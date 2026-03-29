import { type EmbedCache } from 'obsidian'
import { t } from 'src/i18n/ai-runtime/helper'
import type { Message, ResolveEmbedAsBinary } from './provider-shared'
import { arrayBufferToBase64, getMimeTypeFromFilename } from './utils'
import { withToolMessageContext } from './messageFormat'

type ContentItem =
	| {
		type: 'image_url'
		image_url: { url: string }
	}
	| { type: 'text'; text: string }
	| { type: 'input_text'; text: string }
	| { type: 'file'; file: { filename: string; file_data: string } }

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp']
const KNOWN_IMAGE_SERVICE_DOMAINS = [
	'tse1.mm.bing.net', 'tse2.mm.bing.net', 'tse3.mm.bing.net', 'tse4.mm.bing.net',
	'th.bing.com',
	'images.unsplash.com', 'source.unsplash.com',
	'pbs.twimg.com',
	'i.imgur.com',
	'cdn.discordapp.com', 'media.discordapp.net',
	'lh3.googleusercontent.com', 'lh4.googleusercontent.com', 'lh5.googleusercontent.com',
	'graph.facebook.com',
	'avatars.githubusercontent.com', 'raw.githubusercontent.com', 'user-images.githubusercontent.com',
	'i.ytimg.com',
	'img.shields.io',
	'via.placeholder.com', 'placekitten.com', 'placehold.co',
	'api.qrserver.com',
	'chart.googleapis.com',
	'image.tmdb.org',
	'a.ppy.sh',
	'cdn.shopify.com',
	'res.cloudinary.com',
	'imagedelivery.net',
]

const isKnownImageService = (url: string): boolean => {
	try {
		const urlObj = new URL(url)
		const hostname = urlObj.hostname.toLowerCase()
		return KNOWN_IMAGE_SERVICE_DOMAINS.some(
			(domain) => hostname === domain || hostname.endsWith(`.${domain}`)
		)
	} catch {
		return false
	}
}

const extractImageUrls = (text: string | undefined): string[] => {
	if (!text) return []

	const urlRegex = /(https?:\/\/[^\s]+)/gi
	const matches = text.match(urlRegex) || []
	const imageUrls: string[] = []
	const nonImageExtensions = [
		'.htm', '.html', '.php', '.asp', '.aspx', '.jsp', '.js', '.css', '.json', '.xml',
		'.txt', '.md', '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
		'.zip', '.rar', '.tar', '.gz', '.7z', '.exe', '.msi', '.dmg', '.apk',
		'.mp3', '.mp4', '.avi', '.mov', '.wav', '.flac',
	]

	for (const match of matches) {
		let url = match.trim().replace(/[)）\]】>'"]+$/, '')
		const lowerUrl = url.toLowerCase()
		const pathPart = lowerUrl.split('?')[0].split('#')[0]
		if (nonImageExtensions.some((ext) => pathPart.endsWith(ext))) {
			continue
		}

		let foundImageExt = false
		for (const ext of IMAGE_EXTENSIONS) {
			const extIndex = lowerUrl.lastIndexOf(ext)
			if (extIndex === -1) continue
			foundImageExt = true
			const afterExt = url.substring(extIndex + ext.length)
			if (afterExt.startsWith('?') || afterExt.startsWith('#')) {
				const endMatch = afterExt.match(/^[?#][^\s)）\]】>'"]*/)
				url = endMatch
					? url.substring(0, extIndex + ext.length + endMatch[0].length)
					: url.substring(0, extIndex + ext.length)
			} else if (afterExt.length > 0) {
				url = url.substring(0, extIndex + ext.length)
			}
			break
		}

		if (!foundImageExt && !isKnownImageService(url)) {
			continue
		}

		if (url.length > 10 && /^https?:\/\/.+/.test(url)) {
			imageUrls.push(url)
		}
	}

	return Array.from(new Set(imageUrls))
}

const formatEmbed = async (
	embed: EmbedCache,
	resolveEmbedAsBinary: ResolveEmbedAsBinary,
): Promise<ContentItem> => {
	const mimeType = getMimeTypeFromFilename(embed.link)
	const isHttpUrl = embed.link.startsWith('http://') || embed.link.startsWith('https://')

	if (['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(mimeType)) {
		if (isHttpUrl) {
			return {
				type: 'image_url',
				image_url: { url: embed.link },
			}
		}
		const embedBuffer = await resolveEmbedAsBinary(embed)
		const base64Data = arrayBufferToBase64(embedBuffer)
		return {
			type: 'image_url',
			image_url: { url: `data:${mimeType};base64,${base64Data}` },
		}
	}

	if (mimeType === 'application/pdf') {
		const embedBuffer = await resolveEmbedAsBinary(embed)
		const base64Data = arrayBufferToBase64(embedBuffer)
		return {
			type: 'file',
			file: {
				filename: embed.link,
				file_data: `data:${mimeType};base64,${base64Data}`,
			},
		}
	}

	throw new Error(t('Only PNG, JPEG, GIF, WebP, and PDF files are supported.'))
}

export const formatOpenRouterMessage = async (
	msg: Message,
	resolveEmbedAsBinary: ResolveEmbedAsBinary,
	useResponsesAPI = false,
) => {
	let remainingText = msg.content ?? ''
	const textImageUrls = extractImageUrls(remainingText)
	for (const url of textImageUrls) {
		remainingText = remainingText.split(url).join(' ')
	}
	const sanitizedText = remainingText.trim()
	const embedContents: ContentItem[] = msg.embeds?.length
		? await Promise.all(msg.embeds.map((embed) => formatEmbed(embed, resolveEmbedAsBinary)))
		: []

	if (textImageUrls.length === 0 && embedContents.length === 0) {
		return withToolMessageContext(msg, {
			role: msg.role,
			content: msg.content,
		})
	}

	const content: ContentItem[] = []
	if (sanitizedText) {
		content.push(
			useResponsesAPI
				? { type: 'input_text', text: sanitizedText }
				: { type: 'text', text: sanitizedText }
		)
	}

	if (textImageUrls.length > 0) {
		content.push(
			...textImageUrls.map((url) => ({
				type: 'image_url' as const,
				image_url: { url },
			}))
		)
	}

	content.push(...embedContents)
	return withToolMessageContext(msg, { role: msg.role, content })
}
