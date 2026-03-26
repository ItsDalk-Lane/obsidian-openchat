import { DebugLogger } from 'src/utils/DebugLogger'
import type { SaveAttachment } from '.'
import { buildReasoningBlockEnd, buildReasoningBlockStart } from './utils'

interface OpenRouterResponseContext {
	useResponsesAPI: boolean
	imageSaveAsAttachment: boolean
	saveAttachment?: SaveAttachment
	imageDisplayWidth: number
	supportsImageGeneration: boolean
	imageStream?: boolean
	controller: AbortController
}

interface OpenRouterModelResult {
	getFullResponsesStream(): AsyncIterable<Record<string, unknown>>
	getResponse(): Promise<Record<string, unknown>>
	cancel(): Promise<void>
}

type ChatChunk = {
	choices?: Array<{
		delta?: Record<string, unknown>
		message?: Record<string, unknown>
	}>
}

type ChatResponseLike = ChatChunk | AsyncIterable<ChatChunk>

const isAsyncIterable = <T>(value: unknown): value is AsyncIterable<T> =>
	typeof value === 'object' && value !== null && Symbol.asyncIterator in value

const normalizeGeneratedImageUrl = (value: string): string => {
	if (!value) return value
	if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('data:')) {
		return value
	}
	return `data:image/png;base64,${value}`
}

const extractImageUrl = (image: unknown): string | undefined => {
	if (!image || typeof image !== 'object') return undefined
	const record = image as Record<string, unknown>
	const nestedImageUrl = record.image_url
	if (nestedImageUrl && typeof nestedImageUrl === 'object') {
		const url = (nestedImageUrl as { url?: unknown }).url
		return typeof url === 'string' ? url : undefined
	}
	const directImageUrl = record.imageUrl
	if (typeof directImageUrl === 'string') return directImageUrl
	return undefined
}

const yieldImageContent = async function* (
	imageUrl: string,
	index: number,
	total: number,
	context: OpenRouterResponseContext,
): AsyncGenerator<string, void, undefined> {
	if (context.imageSaveAsAttachment && context.saveAttachment) {
		try {
			if (!imageUrl.startsWith('data:')) {
				yield `⚠️ 检测到 URL 格式图片，但配置为保存附件。图片 URL：${imageUrl}\n\n`
				return
			}

			const base64Data = imageUrl.split(',')[1]
			if (!base64Data) {
				throw new Error('无效的 base64 数据')
			}

			const binaryString = atob(base64Data)
			const bytes = new Uint8Array(binaryString.length)
			for (let offset = 0; offset < binaryString.length; offset += 1) {
				bytes[offset] = binaryString.charCodeAt(offset)
			}
			const now = new Date()
			const formatTime =
				`${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
				+ `_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`
			const indexFlag = total > 1 ? `-${index + 1}` : ''
			const filename = `openrouter-${formatTime}${indexFlag}.png`

			await context.saveAttachment(filename, bytes.buffer)
			yield `![[${filename}|${context.imageDisplayWidth}]]\n\n`
		} catch (error) {
			DebugLogger.error('[OpenRouter] 处理图片 URL 时出错', error)
			const errorMsg = error instanceof Error ? error.message : String(error)
			yield `❌ 图片保存失败: ${errorMsg}\n\n`
		}
		return
	}

	yield imageUrl.startsWith('data:')
		? `📷 生成的图片（Base64 格式，长度: ${imageUrl.length}）\n\n`
		: `📷 生成的图片 URL：${imageUrl}\n\n`
}

const extractReasoningText = (response: Record<string, unknown>): string => {
	const output = Array.isArray(response.output) ? response.output : []
	const parts: string[] = []
	for (const item of output) {
		if (!item || typeof item !== 'object') continue
		const record = item as Record<string, unknown>
		if (record.type !== 'reasoning') continue
		const summary = Array.isArray(record.summary) ? record.summary : []
		for (const summaryItem of summary) {
			if (!summaryItem || typeof summaryItem !== 'object') continue
			const text = (summaryItem as { text?: unknown }).text
			if (typeof text === 'string' && text) {
				parts.push(text)
			}
		}
	}
	return parts.join('\n')
}

const extractResponseText = (response: Record<string, unknown>): string => {
	if (typeof response.outputText === 'string' && response.outputText) {
		return response.outputText
	}
	const output = Array.isArray(response.output) ? response.output : []
	for (const item of output) {
		if (!item || typeof item !== 'object') continue
		const record = item as Record<string, unknown>
		if (record.type !== 'message') continue
		const text = extractOutputText(record.content)
		if (text) return text
	}
	return ''
}

const extractGeneratedImages = (response: Record<string, unknown>): string[] => {
	const output = Array.isArray(response.output) ? response.output : []
	const images: string[] = []
	for (const item of output) {
		if (!item || typeof item !== 'object') continue
		const record = item as Record<string, unknown>
		if (record.type !== 'image_generation_call') continue
		const result = typeof record.result === 'string' ? record.result : ''
		if (result) {
			images.push(normalizeGeneratedImageUrl(result))
		}
	}
	return images
}

const extractStreamErrorMessage = (event: Record<string, unknown>): string => {
	const directError = event.error
	if (typeof directError === 'string' && directError) {
		return directError
	}
	if (directError && typeof directError === 'object') {
		const message = (directError as { message?: unknown }).message
		if (typeof message === 'string' && message) {
			return message
		}
	}
	const response = event.response
	if (response && typeof response === 'object') {
		const responseError = (response as { error?: unknown }).error
		if (typeof responseError === 'string' && responseError) {
			return responseError
		}
		if (responseError && typeof responseError === 'object') {
			const message = (responseError as { message?: unknown }).message
			if (typeof message === 'string' && message) {
				return message
			}
		}
	}
	return 'OpenRouter 响应失败'
}

const yieldResponseImages = async function* (
	images: string[],
	context: OpenRouterResponseContext,
	prependBreak: boolean,
): AsyncGenerator<string, void, undefined> {
	if (images.length === 0) {
		if (context.supportsImageGeneration) {
			yield '⚠️ 图像生成请求完成，但 API 未返回图片数据。请检查模型配置或提示词。'
		}
		return
	}

	if (prependBreak) {
		yield '\n\n'
	}

	for (const [index, image] of images.entries()) {
		yield* yieldImageContent(image, index, images.length, context)
	}
}

const getEmptyResponseWarning = (supportsImageGeneration: boolean): string =>
	supportsImageGeneration
		? '⚠️ 图像生成请求完成，但 API 未返回图片数据。请检查模型配置或提示词。'
		: '⚠️ 收到空响应，请检查模型配置或稍后重试。'

const yieldResponseFallbackContent = async function* (
	response: Record<string, unknown>,
	context: OpenRouterResponseContext,
	hasStreamedText: boolean,
): AsyncGenerator<string, void, undefined> {
	const reasoningText = extractReasoningText(response)
	if (!hasStreamedText && reasoningText) {
		yield `${buildReasoningBlockStart(Date.now())}${reasoningText}${buildReasoningBlockEnd(10)}`
	}

	const finalText = extractResponseText(response)
	if (!hasStreamedText && finalText) {
		yield finalText
	}

	const images = extractGeneratedImages(response)
	if (images.length > 0 || context.supportsImageGeneration) {
		yield* yieldResponseImages(images, context, hasStreamedText || Boolean(finalText))
		return
	}

	if (!hasStreamedText && !reasoningText && !finalText) {
		yield getEmptyResponseWarning(context.supportsImageGeneration)
	}
}

const extractOutputText = (content: unknown): string => {
	if (!Array.isArray(content)) return ''
	for (const item of content) {
		if (!item || typeof item !== 'object') continue
		const record = item as { type?: unknown; text?: unknown }
		if (record.type === 'output_text' && typeof record.text === 'string') {
			return record.text
		}
	}
	return ''
}

export async function* handleOpenRouterCallModelResult(
	result: OpenRouterModelResult,
	context: OpenRouterResponseContext,
): AsyncGenerator<string, void, undefined> {
	let reasoningActive = false
	let reasoningStartMs: number | null = null
	let hasStreamedText = false
	const responsePromise = result.getResponse()

	const cancelResult = () => {
		void result.cancel().catch(() => {
			// ignore cancellation cleanup failures
		})
	}
	context.controller.signal.addEventListener('abort', cancelResult, { once: true })

	try {
		for await (const event of result.getFullResponsesStream()) {
			if (context.controller.signal.aborted) {
				break
			}
			const eventType = typeof event.type === 'string' ? event.type : ''
			if (
				eventType === 'response.reasoning.delta'
				|| eventType === 'response.reasoning_text.delta'
				|| eventType === 'response.reasoning_summary_text.delta'
			) {
				const delta = typeof event.delta === 'string'
					? event.delta
					: typeof event.text === 'string'
						? event.text
						: ''
				if (!delta) continue
				if (!reasoningActive) {
					reasoningActive = true
					reasoningStartMs = Date.now()
					yield buildReasoningBlockStart(reasoningStartMs)
				}
				yield delta
				continue
			}

			if (eventType === 'response.output_text.delta') {
				if (reasoningActive) {
					reasoningActive = false
					yield buildReasoningBlockEnd(Date.now() - (reasoningStartMs ?? Date.now()))
					reasoningStartMs = null
				}
				if (typeof event.delta === 'string' && event.delta) {
					hasStreamedText = true
					yield event.delta
				}
				continue
			}

			if (
				eventType === 'response.completed'
				|| eventType === 'response.incomplete'
				|| eventType === 'response.failed'
			) {
				if (reasoningActive) {
					reasoningActive = false
					yield buildReasoningBlockEnd(Date.now() - (reasoningStartMs ?? Date.now()))
					reasoningStartMs = null
				}
				if (eventType === 'response.incomplete') {
					yield '\n\n⚠️ API 返回了不完整的响应，内容可能被截断。'
				}
				if (eventType === 'response.failed') {
					throw new Error(extractStreamErrorMessage(event))
				}
			}
		}
	} finally {
		if (reasoningActive) {
			yield buildReasoningBlockEnd(Date.now() - (reasoningStartMs ?? Date.now()))
		}
		context.controller.signal.removeEventListener('abort', cancelResult)
	}

	const finalResponse = await responsePromise
	yield* yieldResponseFallbackContent(finalResponse, context, hasStreamedText)
}

export async function* handleOpenRouterChatResponse(
	response: ChatResponseLike,
	context: OpenRouterResponseContext,
): AsyncGenerator<string, void, undefined> {
	try {
		if (isAsyncIterable<ChatChunk>(response)) {
			let hasStreamedText = false
			let emittedImage = false
			for await (const chunk of response) {
				if (context.controller.signal.aborted) {
					break
				}
				const choice = Array.isArray(chunk.choices) ? chunk.choices[0] : undefined
				const delta = choice?.delta
				const content = typeof delta?.content === 'string' ? delta.content : ''
				if (content) {
					hasStreamedText = true
					yield content
				}

				const images = Array.isArray(delta?.images)
					? delta.images
					: Array.isArray(delta?.imageUrls)
						? delta.imageUrls
						: []
				if (images.length > 0) {
					if (!hasStreamedText && !emittedImage) {
						yield '\n\n'
					}
					for (const [index, image] of images.entries()) {
						const imageUrl = extractImageUrl(image)
						if (imageUrl) {
							emittedImage = true
							yield* yieldImageContent(normalizeGeneratedImageUrl(imageUrl), index, images.length, context)
						}
					}
				}
			}
			if (!hasStreamedText && !emittedImage) {
				yield getEmptyResponseWarning(context.supportsImageGeneration)
			}
			return
		}

		const choice = Array.isArray(response.choices) ? response.choices[0] : undefined
		const message = choice?.message
		const content = typeof message?.content === 'string' ? message.content : ''
		if (content) {
			yield content
		}

		const images = Array.isArray(message?.images)
			? message.images
			: Array.isArray(message?.imageUrls)
				? message.imageUrls
				: []
		if (images.length > 0) {
			yield '\n\n'
			for (const [index, image] of images.entries()) {
				const imageUrl = extractImageUrl(image)
				if (imageUrl) {
					yield* yieldImageContent(normalizeGeneratedImageUrl(imageUrl), index, images.length, context)
				}
			}
			return
		}

		if (!content) {
			yield getEmptyResponseWarning(context.supportsImageGeneration)
		}
	} catch (error) {
		DebugLogger.error('解析 OpenRouter SDK 响应失败:', error)
		throw new Error(`解析响应失败: ${error instanceof Error ? error.message : String(error)}`)
	}
}
