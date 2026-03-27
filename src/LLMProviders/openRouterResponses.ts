import { t } from 'src/i18n/ai-runtime/helper'
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

const OPENROUTER_IMAGE_DOWNLOAD_TIMEOUT_MS = 30_000
const OPENROUTER_MAX_IMAGE_BYTES = 20 * 1024 * 1024

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
	if (typeof image === 'string') return image
	if (!image || typeof image !== 'object') return undefined
	const record = image as Record<string, unknown>
	const nestedImageUrl = record.image_url
	if (nestedImageUrl && typeof nestedImageUrl === 'object') {
		const url = (nestedImageUrl as { url?: unknown }).url
		return typeof url === 'string' ? url : undefined
	}
	const camelImageUrl = record.imageUrl
	if (camelImageUrl && typeof camelImageUrl === 'object') {
		const url = (camelImageUrl as { url?: unknown }).url
		return typeof url === 'string' ? url : undefined
	}
	if (typeof camelImageUrl === 'string') return camelImageUrl
	if (typeof record.url === 'string') return record.url
	return undefined
}

const inferImageExtensionFromMimeType = (mimeType: string | null | undefined): string => {
	const normalizedMimeType = mimeType?.toLowerCase().split(';')[0]?.trim()
	switch (normalizedMimeType) {
		case 'image/jpeg':
		case 'image/jpg':
			return 'jpg'
		case 'image/webp':
			return 'webp'
		case 'image/gif':
			return 'gif'
		case 'image/svg+xml':
			return 'svg'
		default:
			return 'png'
	}
}

const inferImageExtensionFromUrl = (imageUrl: string): string => {
	if (imageUrl.startsWith('data:')) {
		const mimeTypeMatch = imageUrl.match(/^data:([^;,]+)[;,]/i)
		return inferImageExtensionFromMimeType(mimeTypeMatch?.[1])
	}

	try {
		const parsedUrl = new URL(imageUrl)
		const pathname = parsedUrl.pathname.toLowerCase()
		const extensionMatch = pathname.match(/\.([a-z0-9]+)$/i)
		if (extensionMatch?.[1]) {
			const extension = extensionMatch[1]
			if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(extension)) {
				return extension === 'jpeg' ? 'jpg' : extension
			}
		}
	} catch {
		// 忽略无效 URL，回退为 png
	}

	return 'png'
}

const decodeDataUriToArrayBuffer = (imageUrl: string): ArrayBuffer => {
	const base64Data = imageUrl.split(',')[1]
	if (!base64Data || base64Data.trim().length === 0) {
		throw new Error(t('Invalid base64 data'))
	}

	const binaryString = atob(base64Data)
	const bytes = new Uint8Array(binaryString.length)
	for (let offset = 0; offset < binaryString.length; offset += 1) {
		bytes[offset] = binaryString.charCodeAt(offset)
	}
	return bytes.buffer
}

const resolveGeneratedImageAsset = async (
	imageUrl: string,
	signal: AbortSignal,
): Promise<{ data: ArrayBuffer; extension: string }> => {
	if (imageUrl.startsWith('data:')) {
		const data = decodeDataUriToArrayBuffer(imageUrl)
		if (data.byteLength > OPENROUTER_MAX_IMAGE_BYTES) {
			throw new Error(t('Image exceeds the 20MB limit'))
		}
		return {
			data,
			extension: inferImageExtensionFromUrl(imageUrl),
		}
	}

	const timeoutController = new AbortController()
	const abortOnParentSignal = () => timeoutController.abort(signal.reason)
	const timeoutId = window.setTimeout(() => {
		timeoutController.abort(new Error(t('Image download timed out')))
	}, OPENROUTER_IMAGE_DOWNLOAD_TIMEOUT_MS)
	signal.addEventListener('abort', abortOnParentSignal, { once: true })

	let response: Response
	try {
		response = await fetch(imageUrl, { signal: timeoutController.signal })
	} finally {
		window.clearTimeout(timeoutId)
		signal.removeEventListener('abort', abortOnParentSignal)
	}

	if (!response.ok) {
		throw new Error(
			t('Failed to download image ({status})').replace('{status}', String(response.status))
		)
	}

	const contentLengthHeader = response.headers.get('content-length')
	const contentLength = contentLengthHeader ? Number(contentLengthHeader) : Number.NaN
	if (Number.isFinite(contentLength) && contentLength > OPENROUTER_MAX_IMAGE_BYTES) {
		throw new Error(t('Image exceeds the 20MB limit'))
	}

	const data = await response.arrayBuffer()
	if (data.byteLength > OPENROUTER_MAX_IMAGE_BYTES) {
		throw new Error(t('Image exceeds the 20MB limit'))
	}

	return {
		data,
		extension: inferImageExtensionFromMimeType(response.headers.get('content-type'))
			|| inferImageExtensionFromUrl(imageUrl),
	}
}

const extractImageUrls = (images: unknown): string[] => {
	if (!Array.isArray(images)) return []
	const resolved = images
		.map((image) => extractImageUrl(image))
		.filter((imageUrl): imageUrl is string => Boolean(imageUrl))
	return Array.from(new Set(resolved.map((imageUrl) => normalizeGeneratedImageUrl(imageUrl))))
}

const yieldImageContent = async function* (
	imageUrl: string,
	index: number,
	total: number,
	context: OpenRouterResponseContext,
	sequenceIndex = index,
): AsyncGenerator<string, void, undefined> {
	const normalizedImageUrl = normalizeGeneratedImageUrl(imageUrl)
	const imageNumber = sequenceIndex + 1
	if (context.imageSaveAsAttachment && context.saveAttachment) {
		try {
			const asset = await resolveGeneratedImageAsset(normalizedImageUrl, context.controller.signal)
			const now = new Date()
			const formatTime =
				`${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
				+ `_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`
			const indexFlag = total > 1 || sequenceIndex > 0 ? `-${imageNumber}` : ''
			const filename = `openrouter-${formatTime}${indexFlag}.${asset.extension}`

			await context.saveAttachment(filename, asset.data)
			yield `![[${filename}|${context.imageDisplayWidth}]]\n\n`
		} catch (error) {
			DebugLogger.error('[OpenRouter] 处理图片 URL 时出错', error)
			const errorMsg = error instanceof Error ? error.message : String(error)
			yield `${t('Image save failed: {message}').replace('{message}', errorMsg)}\n\n`
		}
		return
	}

	yield `![OpenRouter image ${imageNumber}](${normalizedImageUrl})\n\n`
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
					yield `\n\n${t('API returned an incomplete response. Content may be truncated.')}`
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
			let emittedImageCount = 0
			const emittedImageUrls = new Set<string>()
			for await (const chunk of response) {
				if (context.controller.signal.aborted) {
					break
				}
				const choice = Array.isArray(chunk.choices) ? chunk.choices[0] : undefined
				const delta = choice?.delta
				const message = choice?.message
				const content = typeof delta?.content === 'string' ? delta.content : ''
				if (content) {
					hasStreamedText = true
					yield content
				}

				const images = extractImageUrls(
					Array.isArray(delta?.images)
						? delta.images
						: Array.isArray(delta?.imageUrls)
							? delta.imageUrls
							: Array.isArray(message?.images)
								? message.images
								: Array.isArray(message?.imageUrls)
									? message.imageUrls
									: []
				)
				const newImages = images.filter((imageUrl) => !emittedImageUrls.has(imageUrl))
				if (newImages.length > 0) {
					if (!hasStreamedText && !emittedImage) {
						yield '\n\n'
					}
					for (const imageUrl of newImages) {
						emittedImageUrls.add(imageUrl)
					}
					for (const [index, imageUrl] of newImages.entries()) {
						emittedImage = true
						yield* yieldImageContent(
							imageUrl,
							index,
							newImages.length,
							context,
							emittedImageCount + index,
						)
					}
					emittedImageCount += newImages.length
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

		const images = extractImageUrls(
			Array.isArray(message?.images)
				? message.images
				: Array.isArray(message?.imageUrls)
					? message.imageUrls
					: []
		)
		if (images.length > 0) {
			yield '\n\n'
			for (const [index, imageUrl] of images.entries()) {
				yield* yieldImageContent(imageUrl, index, images.length, context)
			}
			return
		}

		if (!content) {
			yield getEmptyResponseWarning(context.supportsImageGeneration)
		}
	} catch (error) {
		DebugLogger.error('解析 OpenRouter SDK 响应失败:', error)
		throw new Error(
			t('Failed to parse response: {message}').replace(
				'{message}',
				error instanceof Error ? error.message : String(error)
			)
		)
	}
}
