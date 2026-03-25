import { Notice } from 'obsidian'
import { t } from 'src/i18n/ai-runtime/helper'
import { DebugLogger } from 'src/utils/DebugLogger'
import type {
	Message,
	ResolveEmbedAsBinary,
	SaveAttachment,
	SendRequest,
} from '.'
import { getCapabilityEmoji } from './utils'
import { normalizeProviderError } from './errors'
import { withRetry } from './retry'
import { buildOpenRouterHTTPError } from './openRouterErrors'
import { formatOpenRouterMessage } from './openRouterMessageFormat'
import { handleOpenRouterNonStreamingResponse, handleOpenRouterStreamingResponse } from './openRouterResponses'
import { isImageGenerationModel, type OpenRouterOptions, type WebSearchPlugin } from './openRouterShared'

export const createOpenRouterSendRequest = (settings: OpenRouterOptions): SendRequest =>
	async function* (
		messages: readonly Message[],
		controller: AbortController,
		resolveEmbedAsBinary: ResolveEmbedAsBinary,
		saveAttachment?: SaveAttachment,
	) {
		try {
			const { parameters, ...optionsExcludingParams } = settings
			const options = { ...optionsExcludingParams, ...parameters }
			const {
				apiKey,
				baseURL,
				model,
				enableWebSearch = false,
				webSearchEngine,
				webSearchMaxResults = 5,
				webSearchPrompt,
				imageAspectRatio,
				imageStream = false,
				imageResponseFormat = 'b64_json',
				imageSaveAsAttachment = true,
				imageDisplayWidth = 400,
				enableReasoning = false,
				reasoningEffort = 'medium',
				...remains
			} = options

			if (!apiKey) throw new Error(t('API key is required'))
			if (!model) throw new Error(t('Model is required'))

			const useResponsesAPI = enableReasoning
			const endpoint =
				useResponsesAPI && String(baseURL).includes('/chat/completions')
					? String(baseURL).replace('/chat/completions', '/responses')
					: String(baseURL)
			const supportsImageGeneration = isImageGenerationModel(String(model))
			const isImageGenerationRequest =
				supportsImageGeneration
				|| messages.some((msg) =>
					msg.content?.toLowerCase().includes('生成图片')
					|| msg.content?.toLowerCase().includes('生成图像')
					|| msg.content?.toLowerCase().includes('generate image')
				)

			if (isImageGenerationRequest && imageSaveAsAttachment && !saveAttachment) {
				DebugLogger.warn('⚠️ 图像生成配置为保存附件，但未提供 saveAttachment 函数，将返回 URL 格式')
			}

			const formattedMessages = await Promise.all(
				messages.map((msg) => formatOpenRouterMessage(msg, resolveEmbedAsBinary, useResponsesAPI))
			)
			const data: Record<string, unknown> = {
				model,
				stream: useResponsesAPI ? true : imageStream || !isImageGenerationRequest,
			}

			if (useResponsesAPI) {
				data.input = formattedMessages.map((msg) => ({
					type: 'message',
					role: msg.role,
					content: Array.isArray(msg.content)
						? msg.content
						: [{ type: 'input_text', text: msg.content }],
				}))
				const remainsRecord = remains as Record<string, unknown>
				if (typeof remainsRecord.max_tokens === 'number') {
					data.max_output_tokens = remainsRecord.max_tokens
				} else {
					data.max_output_tokens = 9000
				}
				Object.assign(data, remainsRecord)
				if (enableReasoning) {
					data.reasoning = { effort: reasoningEffort }
					new Notice(`${getCapabilityEmoji('Reasoning')}推理模式 (${reasoningEffort}) - 模型: ${model}`)
				}
			} else {
				data.messages = formattedMessages
				Object.assign(data, remains)
			}

			if (supportsImageGeneration) {
				data.modalities = ['image', 'text']
				data.response_format = imageResponseFormat
				if (imageAspectRatio) {
					data.image_config = { aspect_ratio: imageAspectRatio }
				}
				new Notice(`${getCapabilityEmoji('Image Generation')}图像生成模式`)
			}

			if (enableWebSearch && !supportsImageGeneration) {
				const webPlugin: WebSearchPlugin = { id: 'web' }
				if (webSearchEngine) webPlugin.engine = webSearchEngine
				if (webSearchMaxResults !== 5) webPlugin.max_results = webSearchMaxResults
				if (webSearchPrompt) webPlugin.search_prompt = webSearchPrompt
				data.plugins = [webPlugin]
				new Notice(`${getCapabilityEmoji('Web Search')}Web Search`)
			}

			const response = await withRetry(
				async () => {
					const nextResponse = await fetch(endpoint, {
						method: 'POST',
						headers: {
							Authorization: `Bearer ${apiKey}`,
							'Content-Type': 'application/json',
						},
						body: JSON.stringify(data),
						signal: controller.signal,
					})
					if (!nextResponse.ok) {
						throw buildOpenRouterHTTPError(
							nextResponse.status,
							await nextResponse.text(),
							String(model),
							supportsImageGeneration,
						)
					}
					return nextResponse
				},
				{ signal: controller.signal },
			)

			const isStreamingResponse =
				(response.headers.get('content-type') || '').includes('text/event-stream')
				|| Boolean(data.stream)
			const responseContext = {
				useResponsesAPI,
				imageSaveAsAttachment,
				saveAttachment,
				imageDisplayWidth,
				supportsImageGeneration,
				controller,
			}

			if (isStreamingResponse) {
				yield* handleOpenRouterStreamingResponse(response, responseContext)
			} else {
				yield* handleOpenRouterNonStreamingResponse(response, responseContext)
			}
		} catch (error) {
			throw normalizeProviderError(error, 'OpenRouter request failed')
		}
	}
