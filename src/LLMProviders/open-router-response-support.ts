import { t } from 'src/i18n/ai-runtime/helper'
import { DebugLogger } from 'src/utils/DebugLogger'
import type { SaveAttachment } from './provider-shared'

export interface OpenRouterResponseContext {
	useResponsesAPI: boolean
	imageSaveAsAttachment: boolean
	saveAttachment?: SaveAttachment
	imageDisplayWidth: number
	supportsImageGeneration: boolean
	imageStream?: boolean
	controller: AbortController
}

export interface OpenRouterModelResult {
	getFullResponsesStream(): AsyncIterable<Record<string, unknown>>
	getResponse(): Promise<Record<string, unknown>>
	cancel(): Promise<void>
}

export type ChatChunk = {
	choices?: Array<{
		delta?: Record<string, unknown>
		message?: Record<string, unknown>
	}>
}

export type ChatResponseLike = ChatChunk | AsyncIterable<ChatChunk>

const OPENROUTER_IMAGE_DOWNLOAD_TIMEOUT_MS = 30_000
const OPENROUTER_MAX_IMAGE_BYTES = 20 * 1024 * 1024

export const isAsyncIterable = <T>(
	value: unknown,
): value is AsyncIterable<T> =>
	typeof value === 'object' && value !== null && Symbol.asyncIterator in value

export const normalizeGeneratedImageUrl = (value: string): string => {
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

const inferImageExtensionFromMimeType = (
	mimeType: string | null | undefined,
): string => {
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
			t('Failed to download image ({status})').replace(
				'{status}',
				String(response.status),
			),
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
		extension:
			inferImageExtensionFromMimeType(response.headers.get('content-type'))
			|| inferImageExtensionFromUrl(imageUrl),
	}
}

export const extractImageUrls = (images: unknown): string[] => {
	if (!Array.isArray(images)) return []
	const resolved = images
		.map((image) => extractImageUrl(image))
		.filter((imageUrl): imageUrl is string => Boolean(imageUrl))
	return Array.from(
		new Set(resolved.map((imageUrl) => normalizeGeneratedImageUrl(imageUrl))),
	)
}

export const yieldImageContent = async function* (
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
			const asset = await resolveGeneratedImageAsset(
				normalizedImageUrl,
				context.controller.signal,
			)
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
