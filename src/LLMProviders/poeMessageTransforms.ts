import type { Message, ResolveEmbedAsBinary } from './provider-shared'

import type { ContentItem, PoeFunctionCallItem } from './poeTypes'

import { toResponseRole } from './poeUtils'
import { convertEmbedToImageUrl } from './utils'

type PoeResponseItem = {
	type?: unknown
	id?: unknown
	call_id?: unknown
	name?: unknown
	arguments?: unknown
	content?: unknown
	text?: unknown
}

type PoeResponseLike = {
	output?: unknown
	output_text?: unknown
}

export const extractResponseFunctionCalls = (response: unknown): PoeFunctionCallItem[] => {
	const responseLike = (response ?? {}) as PoeResponseLike
	const output = Array.isArray(responseLike.output) ? (responseLike.output as PoeResponseItem[]) : []
	return output
		.filter((item) => item?.type === 'function_call')
		.map((item) => ({
			id: String(item?.id ?? item?.call_id ?? ''),
			call_id: String(item?.call_id ?? item?.id ?? ''),
			name: String(item?.name ?? ''),
			arguments: typeof item?.arguments === 'string' ? item.arguments : '{}'
		}))
		.filter(
			(call: PoeFunctionCallItem) =>
				call.id.length > 0 && call.call_id.length > 0 && call.name.length > 0
		)
}

export const extractOutputTextFromResponse = (response: unknown): string => {
	const responseLike = (response ?? {}) as PoeResponseLike
	if (typeof responseLike.output_text === 'string') {
		return responseLike.output_text
	}
	const output = Array.isArray(responseLike.output) ? (responseLike.output as PoeResponseItem[]) : []
	const textParts: string[] = []
	for (const item of output) {
		if (item?.type !== 'message') continue
		const content = Array.isArray(item?.content) ? item.content : []
		for (const part of content) {
			const contentPart = part as PoeResponseItem
			if (contentPart?.type === 'output_text' && typeof contentPart?.text === 'string') {
				textParts.push(contentPart.text)
			}
		}
	}
	return textParts.join('')
}

const appendReasoningText = (value: unknown, parts: string[]): void => {
	if (typeof value === 'string') {
		const text = value.trim()
		if (text) parts.push(text)
		return
	}
	if (Array.isArray(value)) {
		for (const item of value) {
			appendReasoningText(item, parts)
		}
		return
	}
	if (!value || typeof value !== 'object') return
	const obj = value as Record<string, unknown>
	const preferredKeys = ['text', 'summary', 'content', 'reasoning', 'reasoning_text', 'summary_text', 'value']
	for (const key of preferredKeys) {
		if (key in obj) {
			appendReasoningText(obj[key], parts)
		}
	}
}

export const extractReasoningTextFromResponse = (response: unknown): string => {
	const responseLike = (response ?? {}) as PoeResponseLike
	const output = Array.isArray(responseLike.output) ? responseLike.output : []
	const parts: string[] = []
	for (const item of output) {
		const type = String(item?.type ?? '').toLowerCase()
		if (!type.includes('reason') && !type.includes('think')) {
			continue
		}
		appendReasoningText(item, parts)
	}
	if (parts.length === 0) return ''
	return Array.from(new Set(parts)).join('\n')
}

export const extractResponseOutputItems = (response: unknown): unknown[] => {
	const responseLike = (response ?? {}) as PoeResponseLike
	const output = Array.isArray(responseLike.output) ? responseLike.output : []
	return output.filter((item) =>
		item && typeof item === 'object' && item.type === 'function_call'
	)
}

export const formatMsg = async (
	msg: Message,
	resolveEmbedAsBinary: ResolveEmbedAsBinary
) => {
	const base: Record<string, unknown> = {
		role: msg.role
	}

	if (
		msg.role === 'assistant'
		&& typeof msg.reasoning_content === 'string'
		&& msg.reasoning_content.trim()
	) {
		base.reasoning_content = msg.reasoning_content
	}

	if (msg.role !== 'user' || !msg.embeds || msg.embeds.length === 0) {
		return {
			...base,
			content: msg.content
		}
	}

	const content: ContentItem[] = await Promise.all(
		msg.embeds.map((embed) => convertEmbedToImageUrl(embed, resolveEmbedAsBinary))
	)
	if (msg.content.trim()) {
		content.push({
			type: 'text' as const,
			text: msg.content
		})
	}

	return {
		...base,
		content
	}
}

export const formatMsgForResponses = async (
	msg: Message,
	resolveEmbedAsBinary: ResolveEmbedAsBinary
) => {
	const formatted = await formatMsg(msg, resolveEmbedAsBinary)
	const formattedRecord = formatted as Record<string, unknown>
	const role = toResponseRole(String(formattedRecord.role ?? msg.role))
	const textContentType = role === 'assistant' ? 'output_text' : 'input_text'

	if (!Array.isArray(formattedRecord.content)) {
		return {
			role,
			content: [{ type: textContentType, text: String(formattedRecord.content ?? '') }]
		}
	}

	const content = (formattedRecord.content as ContentItem[]).map((part) => {
		if (part.type === 'image_url') {
			return {
				type: 'input_image' as const,
				image_url: String(part.image_url?.url ?? '')
			}
		}
		return {
			type: textContentType,
			text: String(part.text ?? '')
		}
	})

	return {
		role,
		content: content.length > 0 ? content : [{ type: textContentType, text: '' }]
	}
}
