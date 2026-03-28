/**
 * @module mcp/internal/sse-parser
 * @description 负责把分块 SSE 文本流解析为结构化事件。
 *
 * @dependencies 无
 * @side-effects 无
 * @invariants 输入 chunk 按顺序消费，未完成帧会留在 rest 中等待下个 chunk。
 */

export interface ParsedSseEvent {
	event?: string
	id?: string
	retry?: number
	data: string
	raw: string
	isDone: boolean
	json?: unknown
	parseError?: string
}

export interface FeedChunkResult {
	events: ParsedSseEvent[]
	rest: string

/** @precondition buffer 为上次残留文本，chunk 为当前新收到文本 @postcondition 返回完整事件列表与新的残留缓冲区 @throws 从不抛出 @example feedSseChunk('', 'data: hello\n\n') */
	done: boolean
}

const normalizeNewlines = (text: string): string =>
	text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

const parseEventFrame = (frame: string): ParsedSseEvent | null => {
	if (!frame.trim()) {
		return null
	}

	const lines = frame.split('\n')
	let eventName: string | undefined
	let id: string | undefined
	let retry: number | undefined
	const dataLines: string[] = []

	for (const line of lines) {
		if (!line || line.startsWith(':')) {
			continue
		}

		const colonIndex = line.indexOf(':')
		const field = colonIndex === -1 ? line : line.slice(0, colonIndex)
		let value = colonIndex === -1 ? '' : line.slice(colonIndex + 1)
		if (value.startsWith(' ')) {
			value = value.slice(1)
		}

		if (field === 'event') {
			eventName = value
			continue
		}
		if (field === 'id') {
			id = value
			continue
		}
		if (field === 'retry') {
			const parsed = Number.parseInt(value, 10)
			if (Number.isFinite(parsed)) {
				retry = parsed
			}
			continue
		}
		if (field === 'data') {
			dataLines.push(value)
		}
	}

	const data = dataLines.join('\n')
	const trimmedData = data.trim()
	if (!eventName && !id && retry === undefined && dataLines.length === 0) {
		return null
	}

	const result: ParsedSseEvent = {
		event: eventName,
		id,
		retry,
		data,
		raw: frame,
		isDone: trimmedData === '[DONE]',
	}

	if (!result.isDone && trimmedData && /^[{[]/.test(trimmedData)) {
		try {
			result.json = JSON.parse(trimmedData)
		} catch (error) {
			result.parseError = error instanceof Error ? error.message : String(error)
		}
	}

	return result
}

export const feedSseChunk = (buffer: string, chunk: string): FeedChunkResult => {
	const normalized = normalizeNewlines((buffer || '') + (chunk || ''))
	if (!normalized) {
		return { events: [], rest: '', done: false }
	}

	const frames = normalized.split('\n\n')
	const hasFrameTerminator = normalized.endsWith('\n\n')
	const completeFrames = hasFrameTerminator ? frames : frames.slice(0, -1)
	const rest = hasFrameTerminator ? '' : frames[frames.length - 1] || ''

	const events: ParsedSseEvent[] = []
	let done = false
	for (const frame of completeFrames) {
		const parsed = parseEventFrame(frame)
		if (!parsed) {
			continue
		}
		events.push(parsed)
		if (parsed.isDone) {
			done = true
			break
		}
	}

	return { events, rest, done }
}