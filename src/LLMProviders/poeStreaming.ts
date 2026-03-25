import { buildReasoningBlockEnd, buildReasoningBlockStart } from './utils'

const THINK_OPEN_TAG = '<think>'
const THINK_CLOSE_TAG = '</think>'

export async function* smoothStream(
	source: AsyncGenerator<string, void, undefined>
): AsyncGenerator<string, void, undefined> {
	const mc = new MessageChannel()
	const flush = () => new Promise<void>(resolve => {
		mc.port1.onmessage = () => resolve()
		mc.port2.postMessage(null)
	})

	try {
		let lastYieldTs = 0
		for await (const chunk of source) {
			yield chunk
			const now = performance.now()
			if (now - lastYieldTs < 8) {
				await flush()
			}
			lastYieldTs = performance.now()
		}
	} finally {
		mc.port1.close()
		mc.port2.close()
	}
}

export async function* wrapWithThinkTagDetection(
	source: AsyncGenerator<string, void, undefined>,
	enableReasoning: boolean
): AsyncGenerator<string, void, undefined> {
	if (!enableReasoning) {
		yield* source
		return
	}

	let buffer = ''
	let inThinking = false
	let thinkingStartMs: number | null = null

	for await (const chunk of source) {
		if (
			chunk.startsWith('{{FF_REASONING_START}}')
			|| chunk.startsWith(':{{FF_REASONING_END}}')
			|| chunk.startsWith('{{FF_MCP_TOOL_START}}')
		) {
			if (buffer) {
				yield buffer
				buffer = ''
			}
			yield chunk
			continue
		}

		buffer += chunk

		while (buffer.length > 0) {
			if (!inThinking) {
				const idx = buffer.indexOf(THINK_OPEN_TAG)
				if (idx === -1) {
					let keepLen = 0
					for (let i = Math.min(buffer.length, THINK_OPEN_TAG.length - 1); i > 0; i--) {
						if (THINK_OPEN_TAG.startsWith(buffer.slice(-i))) {
							keepLen = i
							break
						}
					}

					const safeLen = buffer.length - keepLen
					if (safeLen > 0) {
						yield buffer.slice(0, safeLen)
						buffer = buffer.slice(safeLen)
					}
					break
				}
				if (idx > 0) {
					yield buffer.slice(0, idx)
				}
				inThinking = true
				thinkingStartMs = Date.now()
				yield buildReasoningBlockStart(thinkingStartMs)
				buffer = buffer.slice(idx + THINK_OPEN_TAG.length)
			} else {
				const idx = buffer.indexOf(THINK_CLOSE_TAG)
				if (idx === -1) {
					let keepLen = 0
					for (let i = Math.min(buffer.length, THINK_CLOSE_TAG.length - 1); i > 0; i--) {
						if (THINK_CLOSE_TAG.startsWith(buffer.slice(-i))) {
							keepLen = i
							break
						}
					}

					const safeLen = buffer.length - keepLen
					if (safeLen > 0) {
						yield buffer.slice(0, safeLen)
						buffer = buffer.slice(safeLen)
					}
					break
				}
				if (idx > 0) {
					yield buffer.slice(0, idx)
				}
				const durationMs = Date.now() - (thinkingStartMs ?? Date.now())
				thinkingStartMs = null
				yield buildReasoningBlockEnd(durationMs)
				inThinking = false
				buffer = buffer.slice(idx + THINK_CLOSE_TAG.length)
			}
		}
	}

	if (buffer) {
		yield buffer
	}
	if (inThinking) {
		const durationMs = Date.now() - (thinkingStartMs ?? Date.now())
		yield buildReasoningBlockEnd(durationMs)
	}
}
