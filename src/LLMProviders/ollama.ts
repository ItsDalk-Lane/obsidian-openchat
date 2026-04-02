import { Ollama } from 'ollama/browser'
import type { EmbedCache } from 'obsidian'
import { t } from 'src/i18n/ai-runtime/helper'
import {
	BaseOptions,
	mergeProviderOptionsWithParameters,
	Message,
	ResolveEmbedAsBinary,
	SendRequest,
	Vendor,
} from './provider-shared'
import { arrayBufferToBase64, getMimeTypeFromFilename, buildReasoningBlockStart, buildReasoningBlockEnd } from './utils'
import {
	toOpenAITools,
	resolveCurrentTools,
} from 'src/core/agents/loop/OpenAILoopHandler'
import type { ToolCallRequest } from 'src/core/agents/loop/types'
import { normalizeProviderError } from './errors'
import { normalizeProviderBaseURLForRuntime } from './provider-base-url'
import {
	type OllamaNativeToolCall,
	accumulateNativeToolCalls,
	finalizeNativeToolCalls,
	normalizeToolResultContent,
} from './ollamaToolCallUtils'

// Structured Output Format 类型
export type StructuredOutputFormat = 'json' | Record<string, unknown>

// Ollama 扩展选项接口
export interface OllamaOptions extends BaseOptions {
	// 推理功能配置
	enableReasoning?: boolean // 是否启用推理功能
	thinkLevel?: 'low' | 'medium' | 'high' // 推理级别(可选)

	// 结构化输出配置
	format?: StructuredOutputFormat // 输出格式：'json' 或 JSON Schema 对象
}

type OllamaChatRole = 'user' | 'assistant' | 'system' | 'tool'

interface OllamaChatMessage {
	role: OllamaChatRole
	content: string
	images?: string[]
	tool_calls?: OllamaNativeToolCall[]
	tool_name?: string
}

type OllamaChatRequest = Parameters<Ollama['chat']>[0]
type OllamaStreamPart = {
	message?: {
		thinking?: unknown
		content?: unknown
		tool_calls?: unknown
	}
}

const DEFAULT_MAX_TOOL_CALL_LOOPS = 10

const parseToolArguments = (rawArguments: string): Record<string, unknown> => {
	try {
		const parsed = JSON.parse(rawArguments)
		return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
			? parsed as Record<string, unknown>
			: {}
	} catch {
		return {}
	}
}

const OLLAMA_INTERNAL_OPTION_KEYS = new Set([
	'apiKey',
	'baseURL',
	'model',
	'parameters',
	'tools',
	'toolExecutor',
	'maxToolCallLoops',
	'getTools',
	'mcpTools',
	'mcpGetTools',
	'mcpCallTool',
	'mcpMaxToolCallLoops',
	'enableReasoning',
	'thinkLevel',
	'format',
])

/**
 * 将 embed 数组转换为 Ollama 需要的 base64 字符串数组
 * @param embeds embed 对象数组
 * @param resolveEmbedAsBinary embed 转换函数
 * @returns base64 字符串数组（不含 data URL 前缀）
 * @throws {Error} 当遇到不支持的图像格式时
 */
const convertEmbedsToBase64Array = async (
	embeds: EmbedCache[],
	resolveEmbedAsBinary: ResolveEmbedAsBinary
): Promise<string[]> => {
	const base64Array: string[] = []

	for (const embed of embeds) {
		const mimeType = getMimeTypeFromFilename(embed.link)

		// 验证图像格式
		if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(mimeType)) {
			throw new Error(t('Only PNG, JPEG, GIF, and WebP images are supported.'))
		}

		// 转换为 base64（无前缀）
		const embedBuffer = await resolveEmbedAsBinary(embed)
		const base64Data = arrayBufferToBase64(embedBuffer)
		base64Array.push(base64Data)
	}

	return base64Array
}

/**
 * 将项目消息格式转换为 Ollama API 消息格式
 * @param msg 原始消息对象
 * @param resolveEmbedAsBinary embed 转换函数
 * @returns Ollama 格式的消息
 */
const formatMsgForOllama = async (
	msg: Message,
	resolveEmbedAsBinary: ResolveEmbedAsBinary
): Promise<OllamaChatMessage> => {
	// 提取并转换图像
	const images = msg.embeds
		? await convertEmbedsToBase64Array(msg.embeds, resolveEmbedAsBinary)
		: []

	// 构建消息对象
	return {
		role: msg.role as Exclude<OllamaChatRole, 'tool'>,
		content: msg.content,
		images: images.length > 0 ? images : undefined
	}
}

const extractOllamaRequestParams = (options: Record<string, unknown>): Record<string, unknown> => {
	const requestParams: Record<string, unknown> = {}
	for (const [key, value] of Object.entries(options)) {
		if (OLLAMA_INTERNAL_OPTION_KEYS.has(key)) continue
		if (value === undefined || value === null) continue
		if (typeof value === 'function') continue
		requestParams[key] = value
	}
	return requestParams
}

const buildThinkValue = (enableReasoning?: boolean, thinkLevel?: 'low' | 'medium' | 'high') =>
	enableReasoning ? (thinkLevel ?? true) : false

const buildOllamaChatRequest = (
	options: OllamaOptions,
	messages: OllamaChatMessage[],
	overrides?: Record<string, unknown>
): Record<string, unknown> => {
	const requestParams: Record<string, unknown> = {
		model: options.model,
		messages,
		stream: true,
		...extractOllamaRequestParams(options as Record<string, unknown>),
		...(overrides ?? {}),
	}

	requestParams.think = buildThinkValue(options.enableReasoning, options.thinkLevel)

	if (options.format !== undefined) {
		requestParams.format = options.format
	}

	if (options.enableStructuredOutput && requestParams.format === undefined) {
		requestParams.format = 'json'
	}

	return requestParams
}

const sendRequestFuncBase = (settings: BaseOptions): SendRequest =>
	async function* (messages: readonly Message[], controller: AbortController, resolveEmbedAsBinary: ResolveEmbedAsBinary) {
		try {
			const options = mergeProviderOptionsWithParameters(settings) as OllamaOptions
			options.baseURL = normalizeProviderBaseURLForRuntime('Ollama', options.baseURL)
			const formattedMessages = await Promise.all(
				messages.map((msg) => formatMsgForOllama(msg, resolveEmbedAsBinary))
			)

			const ollama = new Ollama({ host: options.baseURL })
			const response = await ollama.chat(buildOllamaChatRequest(options, formattedMessages) as OllamaChatRequest)

			let inReasoning = false
			let reasoningStartMs: number | null = null
			const isReasoningEnabled = options.enableReasoning ?? false

			for await (const part of response as unknown as AsyncIterable<OllamaStreamPart>) {
				if (controller.signal.aborted) {
					ollama.abort()
					return
				}

				const thinkingContent =
					typeof part?.message?.thinking === 'string' ? part.message.thinking : ''
				const content =
					typeof part?.message?.content === 'string' ? part.message.content : ''

				if (thinkingContent && isReasoningEnabled) {
					if (!inReasoning) {
						inReasoning = true
						reasoningStartMs = Date.now()
						yield buildReasoningBlockStart(reasoningStartMs)
					}
					yield thinkingContent
				}

				if (content) {
					if (inReasoning) {
						inReasoning = false
						const durationMs = Date.now() - (reasoningStartMs ?? Date.now())
						reasoningStartMs = null
						yield buildReasoningBlockEnd(durationMs)
					}
					yield content
				}
			}

			if (inReasoning) {
				const durationMs = Date.now() - (reasoningStartMs ?? Date.now())
				yield buildReasoningBlockEnd(durationMs)
			}
		} catch (error) {
			throw normalizeProviderError(error, 'Ollama request failed')
		}
	}

const sendRequestFunc = (settings: BaseOptions): SendRequest => {
	const hasStaticTools = Array.isArray(settings.tools) && settings.tools.length > 0
	const hasDynamicTools = typeof settings.getTools === 'function'
	if ((!hasStaticTools && !hasDynamicTools) || !settings.toolExecutor) {
		return sendRequestFuncBase(settings)
	}

	return async function* (messages, controller, resolveEmbedAsBinary) {
		try {
			const options = mergeProviderOptionsWithParameters(settings) as OllamaOptions
			options.baseURL = normalizeProviderBaseURLForRuntime('Ollama', options.baseURL)
			const formattedMessages = await Promise.all(
				messages.map((msg) => formatMsgForOllama(msg, resolveEmbedAsBinary))
			)
			const loopMessages: OllamaChatMessage[] = [...formattedMessages]
			const ollama = new Ollama({ host: options.baseURL })
			const maxToolCallLoops =
				typeof settings.maxToolCallLoops === 'number' && settings.maxToolCallLoops > 0
					? settings.maxToolCallLoops
					: DEFAULT_MAX_TOOL_CALL_LOOPS
			const isReasoningEnabled = options.enableReasoning ?? false

			for (let loop = 0; loop < maxToolCallLoops; loop++) {
				if (controller.signal.aborted) {
					ollama.abort()
					return
				}

				const currentTools = await resolveCurrentTools(settings.tools, settings.getTools)
				const response = await ollama.chat(
					buildOllamaChatRequest(
						options,
						loopMessages,
						currentTools.length > 0 ? { tools: toOpenAITools(currentTools) } : undefined
					) as OllamaChatRequest
				)

				let inReasoning = false
				let reasoningStartMs: number | null = null
				let contentBuffer = ''
				const nativeToolCallsMap = new Map<number, OllamaNativeToolCall>()

				for await (const part of response as unknown as AsyncIterable<OllamaStreamPart>) {
					if (controller.signal.aborted) {
						ollama.abort()
						return
					}

					const thinkingContent =
						typeof part?.message?.thinking === 'string' ? part.message.thinking : ''
					const content =
						typeof part?.message?.content === 'string' ? part.message.content : ''
					const rawToolCalls = Array.isArray(part?.message?.tool_calls)
						? (part.message.tool_calls as unknown[])
						: []

					if (thinkingContent && isReasoningEnabled) {
						if (!inReasoning) {
							inReasoning = true
							reasoningStartMs = Date.now()
							yield buildReasoningBlockStart(reasoningStartMs)
						}
						yield thinkingContent
					}

					if (rawToolCalls.length > 0) {
						if (inReasoning) {
							inReasoning = false
							const durationMs = Date.now() - (reasoningStartMs ?? Date.now())
							reasoningStartMs = null
							yield buildReasoningBlockEnd(durationMs)
						}
						accumulateNativeToolCalls(nativeToolCallsMap, rawToolCalls)
					}

					if (content) {
						if (inReasoning) {
							inReasoning = false
							const durationMs = Date.now() - (reasoningStartMs ?? Date.now())
							reasoningStartMs = null
							yield buildReasoningBlockEnd(durationMs)
						}
						contentBuffer += content
						yield content
					}
				}

				if (inReasoning) {
					const durationMs = Date.now() - (reasoningStartMs ?? Date.now())
					yield buildReasoningBlockEnd(durationMs)
				}

				if (nativeToolCallsMap.size === 0) {
					return
				}

				const { nativeToolCalls, openAIToolCalls } = finalizeNativeToolCalls(nativeToolCallsMap)
				loopMessages.push({
					role: 'assistant',
					content: contentBuffer,
					tool_calls: nativeToolCalls,
				})

				const toolExecutor = settings.toolExecutor
				if (!toolExecutor) {
					throw new Error('Tool executor is required for Ollama tool loop execution')
				}

				const toolResults = await Promise.all(openAIToolCalls.map(async (call) => {
					const request: ToolCallRequest = {
						id: call.id,
						name: call.function.name,
						arguments: call.function.arguments,
					}
					try {
						const result = await toolExecutor.execute(request, currentTools, {
							abortSignal: controller.signal,
							requestUserInput: settings.requestToolUserInput,
						})
						const resultContent = normalizeToolResultContent(result.content)
						settings.onToolCallResult?.({
							id: result.toolCallId,
							name: result.name,
							arguments: parseToolArguments(call.function.arguments),
							result: resultContent,
							status: 'completed',
							timestamp: Date.now(),
						})
						return {
							name: result.name ?? 'tool',
							content: resultContent,
							message: {
								role: 'tool' as const,
								content: resultContent,
								tool_name: result.name,
							},
						}
					} catch (err) {
						const errorMsg = err instanceof Error ? err.message : String(err)
						const errorContent = t('Tool call failed: {message}').replace('{message}', errorMsg)
						settings.onToolCallResult?.({
							id: call.id,
							name: call.function.name,
							arguments: parseToolArguments(call.function.arguments),
							result: errorContent,
							status: 'failed',
							timestamp: Date.now(),
						})
						return {
							name: call.function.name,
							content: errorContent,
							message: {
								role: 'tool' as const,
								content: errorContent,
								tool_name: call.function.name,
							},
						}
					}
				}))

				for (const result of toolResults) {
					yield `{{FF_MCP_TOOL_START}}:${result.name}:${result.content}{{FF_MCP_TOOL_END}}:`
					loopMessages.push(result.message)
				}
			}

			const finalResponse = await ollama.chat(buildOllamaChatRequest(options, loopMessages) as OllamaChatRequest)
			let inReasoning = false
			let reasoningStartMs: number | null = null

			for await (const part of finalResponse as unknown as AsyncIterable<OllamaStreamPart>) {
				if (controller.signal.aborted) {
					ollama.abort()
					return
				}

				const thinkingContent =
					typeof part?.message?.thinking === 'string' ? part.message.thinking : ''
				const content =
					typeof part?.message?.content === 'string' ? part.message.content : ''

				if (thinkingContent && isReasoningEnabled) {
					if (!inReasoning) {
						inReasoning = true
						reasoningStartMs = Date.now()
						yield buildReasoningBlockStart(reasoningStartMs)
					}
					yield thinkingContent
				}

				if (content) {
					if (inReasoning) {
						inReasoning = false
						const durationMs = Date.now() - (reasoningStartMs ?? Date.now())
						reasoningStartMs = null
						yield buildReasoningBlockEnd(durationMs)
					}
					yield content
				}
			}

			if (inReasoning) {
				const durationMs = Date.now() - (reasoningStartMs ?? Date.now())
				yield buildReasoningBlockEnd(durationMs)
			}
		} catch (error) {
			if (controller.signal.aborted) return
			throw normalizeProviderError(error, 'Ollama request failed')
		}
	}
}

export const ollamaVendor: Vendor = {
	name: 'Ollama',
	defaultOptions: {
		apiKey: '',
		baseURL: 'http://127.0.0.1:11434',
		model: 'llama3.1',
		parameters: {},
		enableReasoning: false
	} as OllamaOptions,
	sendRequestFunc,
	models: [],
	websiteToObtainKey: 'https://ollama.com',
	capabilities: ['Text Generation', 'Image Vision', 'Reasoning', 'Structured Output']
}
