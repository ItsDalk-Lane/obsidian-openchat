/**
 * Doubao 工具函数：图片处理、消息预处理、错误创建等
 */
import type { Message, ResolveEmbedAsBinary } from '.'
import { convertEmbedToImageUrl, getMimeTypeFromFilename } from './utils'
import { DebugLogger } from 'src/utils/DebugLogger'

type DoubaoImagePixelLimit = {
	min_pixels?: number
	max_pixels?: number
}

type DoubaoChatImageContent = {
	type: 'image_url'
	image_url: {
		url: string
	}
	detail?: 'low' | 'high'
	image_pixel_limit?: DoubaoImagePixelLimit
}

type DoubaoResponsesImageContent = {
	type: 'input_image'
	image_url: string
	detail?: 'low' | 'high'
	image_pixel_limit?: DoubaoImagePixelLimit
}

type DoubaoTextContent =
	| { type: 'text'; text: string }
	| { type: 'input_text'; text: string }

type DoubaoImageContent = DoubaoChatImageContent | DoubaoResponsesImageContent

type DoubaoContentItem = DoubaoTextContent | DoubaoImageContent

type DoubaoProcessedMessage = {
	role: Message['role']
	content: string | DoubaoContentItem[]
}

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp']

/**
 * 已知的动态图片服务域名列表
 * 这些服务通常不使用文件扩展名，而是通过 URL 参数来获取图片
 */
const KNOWN_IMAGE_SERVICE_DOMAINS = [
	'tse1.mm.bing.net', 'tse2.mm.bing.net', 'tse3.mm.bing.net', 'tse4.mm.bing.net', // Bing 图片搜索
	'th.bing.com', // Bing 缩略图
	'images.unsplash.com', 'source.unsplash.com', // Unsplash
	'pbs.twimg.com', // Twitter 图片
	'i.imgur.com', // Imgur
	'cdn.discordapp.com', 'media.discordapp.net', // Discord
	'lh3.googleusercontent.com', 'lh4.googleusercontent.com', 'lh5.googleusercontent.com', // Google 用户内容
	'graph.facebook.com', // Facebook Graph API
	'avatars.githubusercontent.com', 'raw.githubusercontent.com', 'user-images.githubusercontent.com', // GitHub
	'i.ytimg.com', // YouTube 缩略图
	'img.shields.io', // Shields.io 徽章
	'via.placeholder.com', 'placekitten.com', 'placehold.co', // 占位图服务
	'api.qrserver.com', // QR Code 生成
	'chart.googleapis.com', // Google Charts
	'image.tmdb.org', // TMDB 电影数据库
	'a.ppy.sh', // osu! 头像
	'cdn.shopify.com', // Shopify CDN
	'res.cloudinary.com', // Cloudinary
	'imagedelivery.net', // Cloudflare Images
]

/**
 * 检查 URL 是否来自已知的动态图片服务
 */
export const isKnownImageService = (url: string): boolean => {
	try {
		const urlObj = new URL(url)
		const hostname = urlObj.hostname.toLowerCase()
		return KNOWN_IMAGE_SERVICE_DOMAINS.some(domain => hostname === domain || hostname.endsWith('.' + domain))
	} catch {
		return false
	}
}

/**
 * 从文本中提取图片 URL
 *
 * 提取逻辑：
 * 1. 只提取带有图片扩展名（.png, .jpg, .jpeg, .gif, .webp）的 URL
 * 2. 或者来自已知动态图片服务（如 Bing、Unsplash 等）的 URL
 * 3. 过滤掉普通网页链接（如 .htm, .html, .php 等）
 *
 * 支持的 URL 格式：
 * - 带扩展名：https://example.com/image.jpg
 * - 带查询参数：https://example.com/image.jpg?size=large
 * - 动态服务：https://tse1.mm.bing.net/th/id/OIP.xxx?rs=1&pid=ImgDetMain
 */
export const extractImageUrls = (text: string | undefined): string[] => {
	if (!text) return []

	// 匹配所有以 http:// 或 https:// 开头的 URL
	const urlRegex = /(https?:\/\/[^\s]+)/gi
	const matches = text.match(urlRegex) || []

	const imageUrls: string[] = []

	// 明确的非图片文件扩展名（网页、脚本等）
	const NON_IMAGE_EXTENSIONS = ['.htm', '.html', '.php', '.asp', '.aspx', '.jsp', '.js', '.css', '.json', '.xml', '.txt', '.md', '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.zip', '.rar', '.tar', '.gz', '.7z', '.exe', '.msi', '.dmg', '.apk', '.mp3', '.mp4', '.avi', '.mov', '.wav', '.flac']

	for (const match of matches) {
		let url = match.trim()

		// 清理 URL 末尾的特殊字符
		// 移除常见的中文标点、括号等非 URL 字符
		url = url.replace(/[)）\]】>'"]+$/, '')

		const lowerUrl = url.toLowerCase()

		// 检查是否是明确的非图片文件
		const hasNonImageExt = NON_IMAGE_EXTENSIONS.some(ext => {
			const pathPart = lowerUrl.split('?')[0].split('#')[0] // 去掉查询参数和锚点
			return pathPart.endsWith(ext)
		})
		if (hasNonImageExt) {
			continue // 跳过非图片文件
		}

		// 检查是否包含图片扩展名
		let foundImageExt = false
		for (const ext of IMAGE_EXTENSIONS) {
			const extIndex = lowerUrl.lastIndexOf(ext)
			if (extIndex !== -1) {
				foundImageExt = true
				// 截取到扩展名结束的位置
				const afterExt = url.substring(extIndex + ext.length)

				// 如果扩展名后面是查询参数或锚点，保留它们
				if (afterExt.startsWith('?') || afterExt.startsWith('#')) {
					const endMatch = afterExt.match(/^[?#][^\s)）\]】>'"]*/)
					if (endMatch) {
						url = url.substring(0, extIndex + ext.length + endMatch[0].length)
					} else {
						url = url.substring(0, extIndex + ext.length)
					}
				} else if (afterExt.length > 0) {
					// 扩展名后有其他字符但不是查询参数，截断
					url = url.substring(0, extIndex + ext.length)
				}
				break
			}
		}

		// 如果没有图片扩展名，检查是否是已知的动态图片服务
		if (!foundImageExt) {
			if (!isKnownImageService(url)) {
				continue // 既没有图片扩展名，也不是已知图片服务，跳过
			}
			// 对于动态图片服务，清理 URL 末尾的特殊字符
			url = url.replace(/[)）\]】>'"]+$/, '')
		}

		// 最终验证：确保 URL 不为空且格式合法
		if (url.length > 10 && url.match(/^https?:\/\/.+/)) {
			imageUrls.push(url)
		}
	}

	// 去重
	return Array.from(new Set(imageUrls))
}

export const extractString = (value: unknown): string | undefined => {
	if (!value) return undefined
	if (typeof value === 'string') return value
	if (Array.isArray(value)) {
		return value
			.map((item) => extractString(item))
			.filter((item): item is string => typeof item === 'string')
			.join('') || undefined
	}
	if (typeof value === 'object') {
		const obj = value as Record<string, unknown>
		const preferredKeys: Array<string> = ['text', 'content', 'delta', 'thinking', 'value', 'output']
		for (const key of preferredKeys) {
			if (key in obj) {
				const nested = extractString(obj[key])
				if (nested) return nested
			}
		}
		for (const key of Object.keys(obj)) {
			if (preferredKeys.includes(key)) continue
			const nested = extractString(obj[key])
			if (nested) return nested
		}
	}
	return undefined
}

export const createDoubaoHTTPError = (status: number, detail: string) => {
	const message = detail?.trim() ? detail : `Doubao request failed with status ${status}`
	const error = new Error(message) as Error & { status?: number; statusCode?: number }
	error.status = status
	error.statusCode = status
	return error
}

export const resolveDoubaoImageEndpoint = (baseURL: string): string => {
	const fallback = 'https://ark.cn-beijing.volces.com/api/v3/images/generations'
	try {
		const origin = new URL((baseURL || '').trim()).origin
		return `${origin}/api/v3/images/generations`
	} catch {
		return fallback
	}
}

const createDoubaoImageContent = (
	url: string,
	useResponsesAPI: boolean,
): DoubaoImageContent => {
	if (useResponsesAPI) {
		return {
			type: 'input_image',
			image_url: url,
		}
	}
	return {
		type: 'image_url',
		image_url: {
			url,
		},
	}
}

// 处理消息，支持文本和图片的多模态输入
// 当启用 Web Search 时，需要转换为 Responses API 的消息格式
export const processMessages = async (
	messages: readonly Message[],
	resolveEmbedAsBinary: ResolveEmbedAsBinary,
	imageDetail?: 'low' | 'high',
	imagePixelLimit?: { minPixels?: number; maxPixels?: number },
	useResponsesAPI = false // 是否使用 Responses API 格式
) => {
	const processedMessages: DoubaoProcessedMessage[] = []

	for (const message of messages) {

		const content: DoubaoContentItem[] = []
		let remainingText = message.content ?? ''
		const textImageUrls = extractImageUrls(remainingText)
		const imageContentsFromText: DoubaoImageContent[] = []

		if (textImageUrls.length > 0) {
			for (const url of textImageUrls) {
				imageContentsFromText.push(createDoubaoImageContent(url, useResponsesAPI))
			}

			for (const url of textImageUrls) {
				remainingText = remainingText.split(url).join(' ')
			}
		}

		const sanitizedText = remainingText.trim()
		if (sanitizedText) {
			content.push({
				type: useResponsesAPI ? 'input_text' : 'text',
				text: sanitizedText
			})
		}

		content.push(...imageContentsFromText)

		let imageCount = 0
		const maxImageCount = 10
		const maxImageSize = 20 * 1024 * 1024

		if (message.embeds && message.embeds.length > 0) {
			for (const embed of message.embeds) {
				if (imageCount >= maxImageCount) {
					DebugLogger.warn(`已达到最大图片数量限制 ${maxImageCount}，忽略剩余图片`)
					break
				}

				try {
					const isHttpUrl = embed.link.startsWith('http://') || embed.link.startsWith('https://')
					let imageContent: DoubaoImageContent

					if (isHttpUrl) {
						imageContent = createDoubaoImageContent(embed.link, useResponsesAPI)
					} else {
						const binary = await resolveEmbedAsBinary(embed)
						if (binary.byteLength > maxImageSize) {
							DebugLogger.warn(`图片大小超过限制 ${maxImageSize / (1024 * 1024)}MB，忽略此图片`)
							continue
						}

						const mimeType = getMimeTypeFromFilename(embed.link)
						if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(mimeType)) {
							DebugLogger.warn(`不支持的图片格式: ${mimeType}，忽略此图片`)
							continue
						}

						const converted = await convertEmbedToImageUrl(embed, resolveEmbedAsBinary)
						imageContent = createDoubaoImageContent(converted.image_url.url, useResponsesAPI)
					}

					if (imageContent) {
						if (imagePixelLimit && (imagePixelLimit.minPixels || imagePixelLimit.maxPixels)) {
							const pixelLimit: DoubaoImagePixelLimit = {}
							if (imagePixelLimit.minPixels) pixelLimit.min_pixels = imagePixelLimit.minPixels
							if (imagePixelLimit.maxPixels) pixelLimit.max_pixels = imagePixelLimit.maxPixels
							imageContent.image_pixel_limit = pixelLimit
						} else if (imageDetail) {
							imageContent.detail = imageDetail
						}

						content.push(imageContent)
						imageCount++
					}
				} catch (error) {
					DebugLogger.error('处理嵌入图片时出错:', error)
				}
			}
		}

		const hasImageContent = content.some((item) => item.type !== 'text' && item.type !== 'input_text')

		if (!useResponsesAPI && !hasImageContent) {
			const textItem = content.find((item) => item.type === 'text')
			processedMessages.push({
				role: message.role,
				content: textItem ? textItem.text : ''
			})
		} else {
			processedMessages.push({
				role: message.role,
				content
			})
		}
	}

	return processedMessages
}
