import { requestUrl } from 'obsidian'

import { normalizeErrorText } from './poeUtils'

type PoeErrorResponse = {
	error?: {
		message?: unknown
	}
}

const tryParseFirstJsonValue = (text: string): unknown | undefined => {
	const trimmed = text.trim()
	if (!trimmed) return undefined

	const startsWithObject = trimmed.startsWith('{')
	const startsWithArray = trimmed.startsWith('[')
	if (!startsWithObject && !startsWithArray) return undefined

	const stack: string[] = []
	let inString = false
	let escaped = false

	for (let i = 0; i < trimmed.length; i++) {
		const ch = trimmed[i]
		if (inString) {
			if (escaped) {
				escaped = false
				continue
			}
			if (ch === '\\') {
				escaped = true
				continue
			}
			if (ch === '"') {
				inString = false
			}
			continue
		}

		if (ch === '"') {
			inString = true
			continue
		}

		if (ch === '{' || ch === '[') {
			stack.push(ch)
			continue
		}

		if (ch === '}' || ch === ']') {
			const last = stack[stack.length - 1]
			if (!last) break
			if ((ch === '}' && last !== '{') || (ch === ']' && last !== '[')) break
			stack.pop()
			if (stack.length === 0) {
				const firstValue = trimmed.slice(0, i + 1)
				return JSON.parse(firstValue)
			}
		}
	}

	return undefined
}

export const parsePoeJsonResponseText = (
	responseText: string
): { json?: unknown; parseError?: string } => {
	const trimmed = (responseText || '').trim()
	if (!trimmed) return {}

	try {
		return { json: JSON.parse(trimmed) }
	} catch (error) {
		try {
			const firstJson = tryParseFirstJsonValue(trimmed)
			if (firstJson !== undefined) return { json: firstJson }
		} catch {
			// noop
		}
		return {
			parseError: error instanceof Error ? error.message : String(error)
		}
	}
}

export const requestResponsesByRequestUrl = async (
	url: string,
	apiKey: string,
	body: Record<string, unknown>
) => {
	let response: Awaited<ReturnType<typeof requestUrl>>
	try {
		response = await requestUrl({
			url,
			method: 'POST',
			body: JSON.stringify({
				...body,
				stream: false
			}),
			throw: false,
			headers: {
				Authorization: `Bearer ${apiKey}`,
				'Content-Type': 'application/json'
			}
		})
	} catch (error) {
		throw normalizeErrorText('Poe request failed', error)
	}

	const responseText = typeof response.text === 'string' ? response.text : ''
	const parsed = parsePoeJsonResponseText(responseText)
	const parsedJson = (parsed.json ?? {}) as PoeErrorResponse

	if (response.status >= 400) {
		const apiError =
			(typeof parsedJson.error?.message === 'string' ? parsedJson.error.message : '')
			|| responseText
			|| (parsed.parseError ? `Invalid error body JSON: ${parsed.parseError}` : '')
			|| `HTTP ${response.status}`
		const error = new Error(`Poe API error (${response.status}): ${apiError}`) as Error & { status?: number }
		error.status = response.status
		throw error
	}

	if (parsed.json !== undefined) {
		return parsed.json
	}

	throw new Error(
		`Poe API returned non-JSON response: ${parsed.parseError || (responseText || '<empty>')}`
	)
}

export const requestResponsesStreamByFetch = async (
	url: string,
	apiKey: string,
	body: Record<string, unknown>,
	signal: AbortSignal
) => {
	let response: Response
	try {
		response = await fetch(url, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${apiKey}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				...body,
				stream: true
			}),
			signal
		})
	} catch (error) {
		throw normalizeErrorText('Poe request failed', error)
	}

	if (!response.ok) {
		const responseText = await response.text().catch(() => '')
		const parsed = parsePoeJsonResponseText(responseText)
		const parsedJson = (parsed.json ?? {}) as PoeErrorResponse
		const apiError =
			(typeof parsedJson.error?.message === 'string' ? parsedJson.error.message : '')
			|| responseText
			|| (parsed.parseError ? `Invalid error body JSON: ${parsed.parseError}` : '')
			|| `HTTP ${response.status}`
		const error = new Error(`Poe API error (${response.status}): ${apiError}`) as Error & { status?: number }
		error.status = response.status
		throw error
	}

	const reader = response.body?.pipeThrough(new TextDecoderStream()).getReader()
	if (!reader) {
		throw new Error('Poe response body is not readable')
	}
	return reader
}

export const requestChatCompletionStreamByFetch = async (
	url: string,
	apiKey: string,
	body: Record<string, unknown>,
	signal: AbortSignal
) => {
	let response: Response
	try {
		response = await fetch(url, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${apiKey}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				...body,
				stream: true
			}),
			signal
		})
	} catch (error) {
		throw normalizeErrorText('Poe request failed', error)
	}

	if (!response.ok) {
		const responseText = await response.text().catch(() => '')
		const parsed = parsePoeJsonResponseText(responseText)
		const parsedJson = (parsed.json ?? {}) as PoeErrorResponse
		const apiError =
			(typeof parsedJson.error?.message === 'string' ? parsedJson.error.message : '')
			|| responseText
			|| (parsed.parseError ? `Invalid error body JSON: ${parsed.parseError}` : '')
			|| `HTTP ${response.status}`
		const error = new Error(`Poe API error (${response.status}): ${apiError}`) as Error & { status?: number }
		error.status = response.status
		throw error
	}

	const reader = response.body?.pipeThrough(new TextDecoderStream()).getReader()
	if (!reader) {
		throw new Error('Poe response body is not readable')
	}
	return reader
}

export const requestChatCompletionByRequestUrl = async (
	url: string,
	apiKey: string,
	body: Record<string, unknown>
) => {
	let response: Awaited<ReturnType<typeof requestUrl>>
	try {
		response = await requestUrl({
			url,
			method: 'POST',
			body: JSON.stringify({
				...body,
				stream: false
			}),
			throw: false,
			headers: {
				Authorization: `Bearer ${apiKey}`,
				'Content-Type': 'application/json'
			}
		})
	} catch (error) {
		throw normalizeErrorText('Poe request failed', error)
	}

	const responseText = typeof response.text === 'string' ? response.text : ''
	const parsed = parsePoeJsonResponseText(responseText)
	const parsedJson = (parsed.json ?? {}) as PoeErrorResponse

	if (response.status >= 400) {
		const apiError =
			(typeof parsedJson.error?.message === 'string' ? parsedJson.error.message : '')
			|| responseText
			|| (parsed.parseError ? `Invalid error body JSON: ${parsed.parseError}` : '')
			|| `HTTP ${response.status}`
		const error = new Error(`Poe API error (${response.status}): ${apiError}`) as Error & { status?: number }
		error.status = response.status
		throw error
	}

	if (parsed.json !== undefined) {
		return parsed.json
	}

	throw new Error(
		`Poe API returned non-JSON response: ${parsed.parseError || (responseText || '<empty>')}`
	)
}
