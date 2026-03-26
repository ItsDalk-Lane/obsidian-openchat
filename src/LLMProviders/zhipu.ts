import OpenAI from 'openai'
import { t } from 'src/i18n/ai-runtime/helper'
import { BaseOptions, mergeProviderOptionsWithParameters, Message, ResolveEmbedAsBinary, SendRequest, Vendor } from '.'
import { DebugLogger } from 'src/utils/DebugLogger'
import {
	buildReasoningBlockStart,
	buildReasoningBlockEnd,
	convertEmbedToImageUrl
} from './utils'
import { withToolMessageContext } from './messageFormat'
import {
	OpenAILoopOptions,
	withToolCallLoopSupport
} from 'src/core/agents/loop'
import { sendAnthropicRequestFunc } from './zhipuAnthropic'
import {
	buildZhipuThinkingConfig,
	createZhipuLoggedFetch,
	DEFAULT_ZHIPU_THINKING_TYPE,
	filterZhipuRequestExtras,
	isZhipuAnthropicBaseURL,
	type ZhipuAnthropicLoopOptions,
	type ZhipuOptions,
	ZHIPU_SLOW_REQUEST_THRESHOLD_MS,
} from './zhipuShared'

export {
	buildZhipuThinkingConfig,
	createZhipuLoggedFetch,
	DEFAULT_ZHIPU_THINKING_TYPE,
	isZhipuAnthropicBaseURL,
	type ZhipuOptions,
	type ZhipuThinkingType,
	ZHIPU_THINKING_TYPE_OPTIONS,
} from './zhipuShared'

type ZhipuDelta = OpenAI.ChatCompletionChunk.Choice.Delta & {
	reasoning_content?: string
}

type ContentItem =
	| {
		type: 'image_url'
		image_url: {
			url: string
		}
	}
	| { type: 'text'; text: string }

type ZhipuMessagePayload = {
	role: Message['role']
	content: string | ContentItem[]
	reasoning_content?: string
	tool_calls?: unknown
	tool_call_id?: string
}

const formatMsg = async (
	msg: Message,
	resolveEmbedAsBinary: ResolveEmbedAsBinary
): Promise<ZhipuMessagePayload> => {
	const content: ContentItem[] = msg.embeds
		? await Promise.all(msg.embeds.map((embed) => convertEmbedToImageUrl(embed, resolveEmbedAsBinary)))
		: []

	if (content.length === 0) {
		return withToolMessageContext(msg, {
			role: msg.role,
			content: msg.content
		}) as ZhipuMessagePayload
	}

	if (msg.content.trim()) {
		content.push({
			type: 'text',
			text: msg.content
		})
	}

	return withToolMessageContext(msg, {
		role: msg.role,
		content
	}) as ZhipuMessagePayload
}

const zhipuLoopOptions: OpenAILoopOptions = {
	transformApiParams: (apiParams, allOptions) => {
		const mapped: Record<string, unknown> = { ...apiParams }
		delete mapped.enableWebSearch
		delete mapped.enableThinking
		delete mapped.enableReasoning
		delete mapped.thinkingType
		delete mapped.contextLength
		delete mapped.parallel_tool_calls

		const thinkingType =
			typeof allOptions.thinkingType === 'string' ? allOptions.thinkingType : DEFAULT_ZHIPU_THINKING_TYPE
		if (allOptions.enableReasoning === true && thinkingType !== 'disabled') {
			mapped.thinking = { type: thinkingType }
		} else {
			mapped.thinking = { type: 'disabled' }
		}

		return mapped
	}
}

const sendRequestFunc = (settings: ZhipuOptions): SendRequest =>
	async function* (messages: readonly Message[], controller: AbortController, resolveEmbedAsBinary: ResolveEmbedAsBinary) {
		const options = mergeProviderOptionsWithParameters(settings)
		const { apiKey, baseURL, model, enableWebSearch, enableReasoning, thinkingType, ...remains } = options
		if (!apiKey) throw new Error(t('API key is required'))
		DebugLogger.debug('zhipu options', { baseURL, apiKey, model, enableWebSearch, enableReasoning, thinkingType })
		const formattedMessages = await Promise.all(messages.map((msg) => formatMsg(msg, resolveEmbedAsBinary)))

		const client = new OpenAI({
			apiKey: apiKey,
			baseURL,
			dangerouslyAllowBrowser: true,
			fetch: createZhipuLoggedFetch('chat-stream')
		})

		// 构建请求参数
		const requestParams: Record<string, unknown> = {
			model,
			messages: formattedMessages as OpenAI.ChatCompletionMessageParam[],
			stream: true,
			...filterZhipuRequestExtras(remains)
		}

		// 添加推理配置：启用时按用户配置发送，禁用时显式告知 API 关闭推理
		// 不发送 thinking 参数时，GLM-4.6 等推理模型会默认输出推理内容
		requestParams.thinking = buildZhipuThinkingConfig({
			enableReasoning,
			thinkingType
		})

		const stream = await client.chat.completions.create(requestParams as unknown as OpenAI.ChatCompletionCreateParamsStreaming, {
			signal: controller.signal
		})

		let reasoningActive = false
		let reasoningStartMs: number | null = null
		let firstChunkLogged = false
		const streamStartedAt = Date.now()

		for await (const part of stream) {
			if (!firstChunkLogged) {
				firstChunkLogged = true
				const firstChunkMs = Date.now() - streamStartedAt
				if (firstChunkMs >= ZHIPU_SLOW_REQUEST_THRESHOLD_MS) {
					DebugLogger.warn('[Zhipu][chat-stream] 首个流式分片耗时偏高', {
						baseURL,
						model,
						firstChunkMs,
					})
				}
			}
			const delta = part.choices[0]?.delta as ZhipuDelta | undefined

			// 处理推理内容（参考官方文档的 reasoning_content 字段）
			// 只有在用户启用推理功能时才处理推理内容
			if (enableReasoning && thinkingType !== 'disabled' && delta?.reasoning_content) {
				const reasoningText = delta.reasoning_content
				if (reasoningText) {
					if (!reasoningActive) {
						reasoningActive = true
						reasoningStartMs = Date.now()
						yield buildReasoningBlockStart(reasoningStartMs)
					}
					yield reasoningText // 直接输出，不加任何前缀
				}
				continue
			}

			// 处理普通文本内容
			const text = delta?.content
			if (text) {
				if (reasoningActive) {
					const durationMs = Date.now() - (reasoningStartMs ?? Date.now())
					yield buildReasoningBlockEnd(durationMs)
					reasoningActive = false
					reasoningStartMs = null
				}
				yield text
			}
		}

		// 处理剩余的推理内容（流结束时推理还在进行）
		if (reasoningActive) {
			const durationMs = Date.now() - (reasoningStartMs ?? Date.now())
			yield buildReasoningBlockEnd(durationMs)
			reasoningStartMs = null
		}
	}
const sendRequestFuncOpenAI = withToolCallLoopSupport(sendRequestFunc as (settings: BaseOptions) => SendRequest, zhipuLoopOptions)


export const ZHIPU_MODELS = [
	'glm-5',
	'glm-4.6',
	'glm-4.5',
	'glm-4.5v',
	'glm-4-plus',
	'glm-4-air',
	'glm-4-airx',
	'glm-4-long',
	'glm-4-flash',
	'glm-4-flashx'
]

export const zhipuVendor: Vendor = {
	name: 'Zhipu',
	defaultOptions: {
		apiKey: '',
		baseURL: 'https://open.bigmodel.cn/api/paas/v4/',
		model: ZHIPU_MODELS[0],
		enableWebSearch: false,
		enableReasoning: false,
		thinkingType: DEFAULT_ZHIPU_THINKING_TYPE,
		max_tokens: 8192,
		enableThinking: false,
		budget_tokens: 1600,
		parameters: {}
	} as ZhipuOptions,
	sendRequestFunc: (settings: BaseOptions) => {
		const baseURL = typeof settings.baseURL === 'string' ? settings.baseURL : ''
		if (isZhipuAnthropicBaseURL(baseURL)) {
			const anthropicSettings: ZhipuAnthropicLoopOptions = {
				...(settings as ZhipuOptions),
				max_tokens: typeof settings.max_tokens === 'number' ? settings.max_tokens : 8192,
				enableThinking: (settings as ZhipuOptions).enableReasoning === true,
				budget_tokens: typeof settings.budget_tokens === 'number' ? settings.budget_tokens : 1600,
			}
			return sendAnthropicRequestFunc(anthropicSettings)
		}
		return sendRequestFuncOpenAI(settings)
	},
	models: ZHIPU_MODELS,
	websiteToObtainKey: 'https://open.bigmodel.cn/',
	capabilities: ['Text Generation', 'Web Search', 'Reasoning']
}
