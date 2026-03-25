import type { OpenAIToolCall } from 'src/core/agents/loop/OpenAILoopHandler'

/** Ollama 原生工具调用结构 */
export interface OllamaNativeToolCall {
	function: {
		name: string
		arguments: Record<string, unknown>
	}
}

/**
 * 从流式响应中累积原生工具调用
 */
export const accumulateNativeToolCalls = (
	toolCallsMap: Map<number, OllamaNativeToolCall>,
	rawToolCalls: unknown[]
): void => {
	rawToolCalls.forEach((rawCall, index) => {
		if (!rawCall || typeof rawCall !== 'object') return
		const functionPayload =
			typeof (rawCall as { function?: unknown }).function === 'object'
			&& (rawCall as { function?: unknown }).function !== null
				? ((rawCall as { function: { name?: unknown; arguments?: unknown } }).function)
				: undefined
		const name =
			typeof functionPayload?.name === 'string' ? functionPayload.name.trim() : ''
		if (!name) return

		const rawArgs = functionPayload?.arguments
		let args: Record<string, unknown> = {}
		if (rawArgs && typeof rawArgs === 'object' && !Array.isArray(rawArgs)) {
			args = rawArgs as Record<string, unknown>
		} else if (typeof rawArgs === 'string' && rawArgs.trim()) {
			try {
				const parsed = JSON.parse(rawArgs) as unknown
				if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
					args = parsed as Record<string, unknown>
				}
			} catch {
				args = { __raw: rawArgs }
			}
		}

		toolCallsMap.set(index, {
			function: {
				name,
				arguments: args,
			},
		})
	})
}

/**
 * 将工具调用 Map 转为有序列表，同时生成 OpenAI 格式副本
 */
export const finalizeNativeToolCalls = (
	toolCallsMap: Map<number, OllamaNativeToolCall>
): { nativeToolCalls: OllamaNativeToolCall[]; openAIToolCalls: OpenAIToolCall[] } => {
	const entries = Array.from(toolCallsMap.entries()).sort((a, b) => a[0] - b[0])
	const nativeToolCalls = entries.map(([, call]) => call)
	const openAIToolCalls = nativeToolCalls.map((call, index) => ({
		id: `ollama_call_${index + 1}`,
		type: 'function' as const,
		function: {
			name: call.function.name,
			arguments: JSON.stringify(call.function.arguments ?? {}),
		},
	}))
	return { nativeToolCalls, openAIToolCalls }
}

/**
 * 标准化工具结果内容为字符串
 */
export const normalizeToolResultContent = (content: unknown): string => {
	if (typeof content === 'string') return content
	if (content === undefined || content === null) return ''
	try {
		return JSON.stringify(content)
	} catch {
		return String(content)
	}
}
