import OpenAI from 'openai'
import { t } from 'src/i18n/ai-runtime/helper'
import { BaseOptions, Message, ResolveEmbedAsBinary, SendRequest, Vendor } from '.'
import { buildReasoningBlockStart, buildReasoningBlockEnd } from './utils'
import { DebugLogger } from 'src/utils/DebugLogger'
import { withToolCallLoopSupport, OpenAILoopOptions, OpenAIToolDefinition, ToolNameMapping } from 'src/core/agents/loop'

// DeepSeek选项接口，扩展基础选项以支持推理功能
export interface DeepSeekOptions extends BaseOptions {
	// 推理功能配置
	enableReasoning?: boolean // 是否启用推理功能
}

type DeepSeekDelta = OpenAI.ChatCompletionChunk.Choice.Delta & {
	reasoning_content?: string
} // hack, deepseek-reasoner added a reasoning_content field

type DeepSeekInternalConfig = {
	prefixContinuation?: boolean
	assistantPrefix?: string
	fim?: {
		enabled?: boolean
		prompt?: string
		suffix?: string
		[key: string]: unknown
	}
}

const sendRequestFunc = (settings: BaseOptions): SendRequest =>
	async function* (messages: readonly Message[], controller: AbortController, _resolveEmbedAsBinary: ResolveEmbedAsBinary) {
		const { parameters, ...optionsExcludingParams } = settings
		const rawParameters = (parameters ?? {}) as Record<string, unknown>
		const internalConfig = (rawParameters.__ff_deepseek as DeepSeekInternalConfig | undefined) ?? {}
		const cleanedParameters = { ...rawParameters }
		delete cleanedParameters.__ff_deepseek
		const options = { ...optionsExcludingParams, ...cleanedParameters }
		const { apiKey, baseURL, model, ...remains } = options
		if (!apiKey) throw new Error(t('API key is required'))

		const client = new OpenAI({
			apiKey,
			baseURL,
			dangerouslyAllowBrowser: true
		})

		const shouldUseFim = internalConfig.fim?.enabled === true
		if (shouldUseFim) {
			const fimConfig = internalConfig.fim ?? {}
			const fimPrompt = typeof fimConfig.prompt === 'string' ? fimConfig.prompt : messages[messages.length - 1]?.content ?? ''
			const fimSuffix = typeof fimConfig.suffix === 'string' ? fimConfig.suffix : undefined
			const { prompt: _prompt, suffix: _suffix, enabled: _enabled, ...fimRemains } = fimConfig

			const stream = await client.completions.create(
				{
					model,
					prompt: fimPrompt,
					...(fimSuffix ? { suffix: fimSuffix } : {}),
					stream: true,
					...fimRemains
				},
				{ signal: controller.signal }
			)

			for await (const part of stream) {
				const text = part.choices?.[0]?.text
				if (text) yield text
			}
			return
		}

		const preparedMessages = applyPrefixContinuation(messages, internalConfig)
		const transformedMessages = transformMessagesForDeepSeek(preparedMessages)
		const stream = await client.chat.completions.create(
			{
				model,
				messages: transformedMessages as OpenAI.ChatCompletionMessageParam[],
				stream: true,
				...remains
			} as any,
			{ signal: controller.signal }
		)

		let inReasoning = false
		let reasoningStartMs: number | null = null
		const deepSeekOptions = settings as DeepSeekOptions
		const isReasoningEnabled = deepSeekOptions.enableReasoning ?? false

		for await (const part of stream as any) {
			if (part.usage && part.usage.prompt_tokens && part.usage.completion_tokens)
				DebugLogger.debug(`Prompt tokens: ${part.usage.prompt_tokens}, completion tokens: ${part.usage.completion_tokens}`)

			const delta = part.choices[0]?.delta as DeepSeekDelta
			const reasonContent = delta?.reasoning_content

			// 只有在启用推理功能时才显示推理内容
			if (reasonContent && isReasoningEnabled) {
				if (!inReasoning) {
					inReasoning = true
					reasoningStartMs = Date.now()
					yield buildReasoningBlockStart(reasoningStartMs)
				}
				yield reasonContent // 直接输出，不加任何前缀
			} else {
				if (inReasoning) {
					inReasoning = false
					const durationMs = Date.now() - (reasoningStartMs ?? Date.now())
					reasoningStartMs = null
					yield buildReasoningBlockEnd(durationMs)
				}
				if (delta?.content) yield delta.content
			}
		}

		// 流结束时如果还在推理状态，关闭推理块
		if (inReasoning) {
			const durationMs = Date.now() - (reasoningStartMs ?? Date.now())
			yield buildReasoningBlockEnd(durationMs)
		}
	}

const applyPrefixContinuation = (messages: readonly Message[], config: DeepSeekInternalConfig): readonly Message[] => {
	if (!config?.prefixContinuation) {
		return messages
	}
	const assistantPrefix = typeof config.assistantPrefix === 'string' ? config.assistantPrefix : ''
	if (messages.length === 0) {
		return [{ role: 'assistant', content: assistantPrefix, prefix: true }]
	}
	const last = messages[messages.length - 1]
	if (last.role === 'assistant') {
		return [...messages.slice(0, -1), { ...last, prefix: true }]
	}
	return [...messages, { role: 'assistant', content: assistantPrefix, prefix: true }]
}

/**
 * 转换消息格式，处理 DeepSeek 推理模式的特殊要求
 * 
 * 根据 DeepSeek 官方文档：
 * - assistant 消息可包含 reasoning_content 字段
 */
const transformMessagesForDeepSeek = (messages: readonly Message[]): any[] => {
	return messages.map(msg => {
		// 处理 assistant 消息
		if (msg.role === 'assistant') {
			const hasReasoningContent = msg.reasoning_content !== undefined && msg.reasoning_content !== '';

			// 如果有 reasoning_content，需要特殊处理
			if (hasReasoningContent) {
				return {
					role: msg.role,
					content: msg.content,
					...(hasReasoningContent ? { reasoning_content: msg.reasoning_content } : {}),
					...(msg.prefix ? { prefix: msg.prefix } : {})
				}
			}
		}

		return {
			role: msg.role,
			content: msg.content,
			...(msg.embeds ? { embeds: msg.embeds } : {}),
			...(msg.prefix ? { prefix: msg.prefix } : {})
		}
	})
}

export const DEEPSEEK_MODELS = ['deepseek-chat', 'deepseek-reasoner']

/**
 * 规范化工具名称以符合 DeepSeek API 要求
 *
 * DeepSeek 要求工具名称只能包含 a-zA-Z0-9_-
 * 其他字符（如中文、空格、特殊符号）需要被替换
 */
const normalizeToolName = (name: string): string => {
	// 将非法字符替换为下划线，并确保不以数字开头
	let normalized = name.replace(/[^a-zA-Z0-9_-]/g, '_')
	// 如果以数字开头，添加前缀
	if (/^\d/.test(normalized)) {
		normalized = `tool_${normalized}`
	}
	return normalized
}

/**
 * DeepSeek 工具调用循环的特殊配置
 *
 * DeepSeek API 对某些参数有特殊要求：
 * 1. 不支持 parallel_tool_calls 参数
 * 2. tool_choice 只支持 "auto"、"none" 和 {"type": "function", "function": {"name": "..."}}
 * 3. 工具名称只能包含 a-zA-Z0-9_-，不能包含中文或特殊符号
 */
const deepSeekLoopOptions: OpenAILoopOptions = {
	transformApiParams: (apiParams) => {
		const sanitized = { ...apiParams }
		// DeepSeek 不支持 parallel_tool_calls，删除以避免 400 错误
		delete sanitized.parallel_tool_calls
		return sanitized
	},
	transformTools: (tools: OpenAIToolDefinition[]): { tools: OpenAIToolDefinition[]; mapping: ToolNameMapping } => {
		const mapping: ToolNameMapping = { normalizedToOriginal: new Map() }
		const transformedTools = tools.map((tool) => {
			const normalizedName = normalizeToolName(tool.function.name)
			// 记录映射关系（规范化名称 -> 原始名称）
			mapping.normalizedToOriginal.set(normalizedName, tool.function.name)
			return {
				...tool,
				function: {
					...tool.function,
					name: normalizedName,
				},
			}
		})
		return { tools: transformedTools, mapping }
	}
}

export const deepSeekVendor: Vendor = {
	name: 'DeepSeek',
	defaultOptions: {
		apiKey: '',
		baseURL: 'https://api.deepseek.com',
		model: DEEPSEEK_MODELS[0],
		parameters: {},
		enableReasoning: false // 默认关闭推理功能
	} as DeepSeekOptions,
	sendRequestFunc: withToolCallLoopSupport(sendRequestFunc as any, deepSeekLoopOptions),
	models: DEEPSEEK_MODELS,
	websiteToObtainKey: 'https://platform.deepseek.com',
	capabilities: ['Text Generation', 'Reasoning', 'Structured Output']
}
