import { t } from 'src/i18n/ai-runtime/helper'
import { BaseOptions, Message, ResolveEmbedAsBinary, SaveAttachment, SendRequest, Vendor } from '.'
import { buildReasoningBlockStart, buildReasoningBlockEnd } from './utils'
import { normalizeProviderError } from './errors'
import { withRetry } from './retry'
import { withToolCallLoopSupport } from 'src/core/agents/loop'
import {
	DEFAULT_DOUBAO_IMAGE_OPTIONS,
	doubaoImageVendor,
	DOUBAO_IMAGE_MODELS,
	DoubaoImageOptions,
	isDoubaoImageGenerationModel,
} from './doubaoImage'
import { DebugLogger } from 'src/utils/DebugLogger'
import {
	extractString,
	createDoubaoHTTPError,
	resolveDoubaoImageEndpoint,
	processMessages,
} from './doubaoUtils'

export type DoubaoThinkingType = 'enabled' | 'disabled' | 'auto'
export type DoubaoReasoningEffort = 'minimal' | 'low' | 'medium' | 'high'

const DOUBAO_KNOWN_CHAT_MODELS = [
	'doubao-seed-2-0-pro-260215',
	'doubao-seed-1-6-vision-250815',
	'doubao-seed-1-6-lite-251015',
	'doubao-seed-1-6-250615',
	'doubao-seed-1-6-251015',
	'doubao-seed-1-6-flash-250828',
	'doubao-seed-1-6-flash-250715',
	'doubao-seed-1-6-flash-250615',
	'doubao-1-5-thinking-vision-pro-250428',
	'doubao-1-5-ui-tars-250428',
	'doubao-1-5-thinking-pro-m-250428'
]

export const DOUBAO_REASONING_EFFORT_OPTIONS: DoubaoReasoningEffort[] = ['minimal', 'low', 'medium', 'high']
export const DEFAULT_DOUBAO_THINKING_TYPE: DoubaoThinkingType = 'enabled'

/**
 * 判断是否需要使用 Responses API
 * 当前仅 Web Search 需要使用 Responses API。
 * 推理模式在 chat.completions 下同样可用，并且 MCP 工具调用依赖该链路。
 */
export const doubaoUseResponsesAPI = (options: DoubaoOptions): boolean =>
	options.enableWebSearch === true

// Doubao图片理解配置选项
export interface DoubaoOptions extends BaseOptions {
	enableReasoning?: boolean // 是否启用推理功能（受聊天界面“推理”按钮控制）
	thinkingType?: DoubaoThinkingType
	reasoningEffort?: DoubaoReasoningEffort
	// 图片理解精细度控制
	imageDetail?: 'low' | 'high'
	imagePixelLimit?: {
		minPixels?: number
		maxPixels?: number
	}
	// Web Search 相关配置
	webSearchConfig?: {
		limit?: number
		maxKeyword?: number
		sources?: string[]
		userLocation?: {
			country?: string
			region?: string
			city?: string
		}
		systemPrompt?: string // 系统提示词，用于指导搜索行为
		enableThinking?: boolean // 是否启用思考过程（边想边搜）
	}
	// 图片生成参数（与 DoubaoImage 兼容）
	displayWidth?: number
	size?: DoubaoImageOptions['size']
	response_format?: DoubaoImageOptions['response_format']
	watermark?: boolean
	sequential_image_generation?: DoubaoImageOptions['sequential_image_generation']
	max_images?: number
	stream?: boolean
	optimize_prompt_mode?: DoubaoImageOptions['optimize_prompt_mode']
}

type DoubaoChatDelta = {
	reasoning_content?: string
	content?: string
}

type DoubaoSSEPayload = {
	type?: string
	delta?: unknown
	thinking?: unknown
	content?: unknown
	choices?: Array<{
		delta?: DoubaoChatDelta
		finish_reason?: unknown
	}>
}

const sendRequestFunc = (settings: BaseOptions): SendRequest =>
	async function* (
		messages: readonly Message[],
		controller: AbortController,
		resolveEmbedAsBinary: ResolveEmbedAsBinary,
		saveAttachment?: SaveAttachment
	) {
		try {
			const { parameters, ...optionsExcludingParams } = settings
			const options = { ...optionsExcludingParams, ...parameters } as DoubaoOptions
			const {
				apiKey,
				baseURL,
				model,
				imageDetail,
				imagePixelLimit,
				enableReasoning,
				enableWebSearch,
				webSearchConfig,
				thinkingType,
				...remains
			} = options
			if (!apiKey) throw new Error(t('API key is required'))
			if (!model) throw new Error(t('Model is required'))

			// 图片生成模型走图像接口，统一由 Doubao Provider 承载
			if (isDoubaoImageGenerationModel(model)) {
				const imageOptions: DoubaoImageOptions = {
					...options,
					baseURL: resolveDoubaoImageEndpoint(baseURL),
					displayWidth: options.displayWidth ?? DEFAULT_DOUBAO_IMAGE_OPTIONS.displayWidth,
					size: options.size ?? DEFAULT_DOUBAO_IMAGE_OPTIONS.size,
					response_format: options.response_format ?? DEFAULT_DOUBAO_IMAGE_OPTIONS.response_format,
					watermark: options.watermark ?? DEFAULT_DOUBAO_IMAGE_OPTIONS.watermark,
					sequential_image_generation:
						options.sequential_image_generation ?? DEFAULT_DOUBAO_IMAGE_OPTIONS.sequential_image_generation,
					stream: options.stream ?? DEFAULT_DOUBAO_IMAGE_OPTIONS.stream,
					optimize_prompt_mode: options.optimize_prompt_mode ?? DEFAULT_DOUBAO_IMAGE_OPTIONS.optimize_prompt_mode,
					max_images: options.max_images ?? 5,
				}
				const imageSendRequest = doubaoImageVendor.sendRequestFunc(imageOptions)
				yield* imageSendRequest(messages, controller, resolveEmbedAsBinary, saveAttachment)
				return
			}

			// 判断是否启用 Web Search
			const useWebSearch = enableWebSearch === true
			const useResponsesAPI = useWebSearch // Web Search 需要使用 Responses API

			// 确定使用的 API 端点
			let endpoint = baseURL
			if (useResponsesAPI && baseURL.includes('/chat/completions')) {
				// 如果启用了 Web Search，自动切换到 Responses API
				endpoint = baseURL.replace('/chat/completions', '/responses')
			}

			// 处理消息，自动支持文本和图片的多模态输入
			const processedMessages = await processMessages(
				messages,
				resolveEmbedAsBinary,
				imageDetail,
				imagePixelLimit,
				useResponsesAPI
			)

			// 构建请求数据
			const data: Record<string, unknown> = {
				model,
				stream: true
			}

			// 只添加通用的、非模型特定的参数
			// 过滤掉可能不被所有模型支持的参数
			const generalParams = remains as Record<string, unknown>
			Object.assign(data, generalParams)

			const isReasoningEnabled = enableReasoning === true
			const requestedThinking = isReasoningEnabled ? thinkingType ?? DEFAULT_DOUBAO_THINKING_TYPE : 'disabled'
			const effectiveThinkingType: DoubaoThinkingType =
				requestedThinking === 'enabled' || requestedThinking === 'disabled' || requestedThinking === 'auto'
					? requestedThinking
					: DEFAULT_DOUBAO_THINKING_TYPE

			// 豆包 API 的推理能力按模型运行时能力决定，不再依赖本地硬编码门禁。
			if (isReasoningEnabled && effectiveThinkingType !== 'disabled') {
				data.thinking = { type: effectiveThinkingType }
			}

			// 根据 API 类型设置消息字段
			if (useResponsesAPI) {
			// Responses API 使用 input 字段
			data.input = processedMessages

			if (useWebSearch) {
				// 根据配置决定是否启用思考功能（同时受 enableReasoning 门控）
				if (
					isReasoningEnabled &&
					webSearchConfig?.enableThinking !== false &&
					effectiveThinkingType &&
					effectiveThinkingType !== 'disabled'
					) {
						data.thinking = { type: effectiveThinkingType }
					}

				// 如果配置了系统提示词，添加到消息开头
				if (webSearchConfig?.systemPrompt) {
					data.input = [
						{
							role: 'system',
							content: [
								{
									type: 'input_text',
									text: webSearchConfig.systemPrompt
								}
							]
						},
						...processedMessages
					]
				}
			}
			} else {
				// Chat Completions API 使用 messages 字段
				data.messages = processedMessages
			}

		// 发送请求
	
			const response = await withRetry(
				async () => {
					const request = await fetch(endpoint, {
						method: 'POST',
						body: JSON.stringify(data),
						headers: {
							Authorization: `Bearer ${apiKey}`,
							'Content-Type': 'application/json'
						},
						signal: controller.signal
					})
					if (!request.ok) {
						const errorText = await request.text()
						throw createDoubaoHTTPError(
							request.status,
							`HTTP error! status: ${request.status}, message: ${errorText}`
						)
					}
					return request
				},
				{ signal: controller.signal }
			)
			const reader = response.body?.getReader()
			if (!reader) throw new Error('Failed to get response reader')

	const decoder = new TextDecoder()
	let buffer = ''
	let thinkingActive = false
	let thinkingStartMs: number | null = null
	const shouldShowThinking =
		isReasoningEnabled &&
		(effectiveThinkingType ?? 'disabled') !== 'disabled' &&
		(useResponsesAPI ? webSearchConfig?.enableThinking !== false : true)

			try {
				while (true) {
					const { done, value } = await reader.read()
					if (done) break

					buffer += decoder.decode(value, { stream: true })
					const lines = buffer.split('\n')
					buffer = lines.pop() || ''

					for (const line of lines) {
						const trimmed = line.trim()
						if (!trimmed || trimmed === 'data: [DONE]') continue
						if (!trimmed.startsWith('data: ')) continue

						try {
							const payload = JSON.parse(trimmed.slice(6)) as DoubaoSSEPayload

					if (useResponsesAPI) {
						const chunkType = payload.type as string | undefined
						if (chunkType && chunkType.startsWith('response.thinking')) {
							const thinkingText = extractString(payload.delta ?? payload.thinking ?? payload.content)
							if (thinkingText && shouldShowThinking) {
								if (!thinkingActive) {
									thinkingActive = true
									thinkingStartMs = Date.now()
									yield buildReasoningBlockStart(thinkingStartMs)
								}
								yield thinkingText // 直接输出，不加任何前缀
							}
							continue
						}
						if (chunkType === 'response.output_text.delta') {
							const content = extractString(payload.delta)
							if (content) {
								if (thinkingActive) {
									thinkingActive = false
									const durationMs = Date.now() - (thinkingStartMs ?? Date.now())
									thinkingStartMs = null
									yield buildReasoningBlockEnd(durationMs)
								}
								yield content
							}
							continue
						}
						if (chunkType === 'response.completed' && thinkingActive) {
							thinkingActive = false
							const durationMs = Date.now() - (thinkingStartMs ?? Date.now())
							thinkingStartMs = null
							yield buildReasoningBlockEnd(durationMs)
						}
					} else {
						const delta = payload.choices?.[0]?.delta

						// 豆包使用 reasoning_content 字段返回推理过程
						const reasoningContent = delta?.reasoning_content
						if (reasoningContent && shouldShowThinking) {
							if (!thinkingActive) {
								thinkingActive = true
								thinkingStartMs = Date.now()
								yield buildReasoningBlockStart(thinkingStartMs)
							}
							yield reasoningContent // 直接输出，不加任何前缀
						}

						const content = delta?.content
						if (content) {
							if (thinkingActive) {
								thinkingActive = false
								const durationMs = Date.now() - (thinkingStartMs ?? Date.now())
								thinkingStartMs = null
								yield buildReasoningBlockEnd(durationMs)
							}
							yield content
						}
						const finishReason = payload.choices?.[0]?.finish_reason
						if (finishReason && thinkingActive) {
							thinkingActive = false
							const durationMs = Date.now() - (thinkingStartMs ?? Date.now())
							thinkingStartMs = null
							yield buildReasoningBlockEnd(durationMs)
						}
					}
						} catch (e) {
							DebugLogger.warn('Failed to parse SSE data:', trimmed, e)
						}
					}
				}
			} finally {
				if (thinkingActive) {
					thinkingActive = false
					const durationMs = Date.now() - (thinkingStartMs ?? Date.now())
					thinkingStartMs = null
					yield buildReasoningBlockEnd(durationMs)
				}
				reader.releaseLock()
			}
		} catch (error) {
			throw normalizeProviderError(error, 'Doubao request failed')
		}
	}

const models = Array.from(new Set([...DOUBAO_KNOWN_CHAT_MODELS, ...DOUBAO_IMAGE_MODELS]))

// 包装原始函数（用于 Responses API 模式）
const sendRequestFuncBase = sendRequestFunc

// MCP 支持的包装函数（用于普通模式）
const sendRequestFuncWithMcp = withToolCallLoopSupport(sendRequestFunc, {
	transformApiParams: (apiParams, allOptions) => {
		const mapped: Record<string, unknown> = { ...apiParams }

		// Doubao 需要使用 thinking 对象，不接受 thinkingType 直传。
		delete mapped.thinkingType
		delete mapped.reasoningEffort
		delete mapped.effort

		const enableReasoning = allOptions.enableReasoning === true
		const requestedThinking =
			typeof allOptions.thinkingType === 'string'
				? (allOptions.thinkingType as string)
				: DEFAULT_DOUBAO_THINKING_TYPE
		const normalizedThinking: DoubaoThinkingType =
			requestedThinking === 'enabled' || requestedThinking === 'disabled' || requestedThinking === 'auto'
				? requestedThinking
				: DEFAULT_DOUBAO_THINKING_TYPE

		if (enableReasoning && normalizedThinking !== 'disabled') {
			mapped.thinking = { type: normalizedThinking }
		} else {
			delete mapped.thinking
		}

		return mapped
	}
})

export const doubaoVendor: Vendor = {
	name: 'Doubao',
	defaultOptions: {
		apiKey: '',
		baseURL: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
		model: '',
		parameters: {},
		enableWebSearch: false // 默认不启用 Web Search
	},
	sendRequestFunc: (settings: DoubaoOptions): SendRequest => {
		const merged = { ...settings, ...(settings.parameters || {}) } as DoubaoOptions
		// Responses API（推理模式/Web Search）可能不支持 tools，跳过 MCP 直接使用原始函数
		if (doubaoUseResponsesAPI(merged)) {
			return sendRequestFuncBase(settings)
		}
		return sendRequestFuncWithMcp(settings as unknown as BaseOptions)
	},
	models,
	websiteToObtainKey: 'https://www.volcengine.com',
	capabilities: ['Text Generation', 'Image Vision', 'Image Generation', 'Web Search', 'Reasoning']
}
