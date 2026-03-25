import type { OpenAIToolCall } from 'src/services/mcp/mcpToolCallHandler'
import { executeMcpToolCalls } from 'src/services/mcp/mcpToolCallHandler'

import { requestChatCompletionStreamByFetch } from './poeRequests'
import type { PoeFunctionCallItem, PoeToolResultMarker } from './poeTypes'
import type { PoeRequestContext } from './poeRunnerShared'
import { ensureCompletionEndpoint } from './poeUtils'
import { formatMsg } from './poeMessageTransforms'
import { feedChunk } from './sse'
import { buildReasoningBlockEnd, buildReasoningBlockStart } from './utils'

type PoeLoopMessage = {
	role: string
	content: unknown
	tool_calls?: unknown
	tool_call_id?: string
	tool_name?: string
}
type PoeChatDelta = {
	reasoning_content?: string
	content?: string
	tool_calls?: Array<{
		index?: number
		id?: string
		function?: {
			name?: string
			arguments?: string
		}
	}>
}

type PoeChatPayload = {
	choices?: Array<{
		delta?: PoeChatDelta
	}>
}

const mapFunctionCallsToOpenAI = (calls: PoeFunctionCallItem[]): OpenAIToolCall[] => {
	return calls.map((call) => ({
		id: call.id,
		type: 'function',
		function: {
			name: call.name,
			arguments: call.arguments || '{}'
		}
	}))
}

export const executePoeMcpToolCalls = async (
	functionCalls: PoeFunctionCallItem[],
	mcpTools: Awaited<ReturnType<PoeRequestContext['getCurrentMcpTools']>>,
	mcpCallTool: NonNullable<PoeRequestContext['mcpCallTool']>
): Promise<{
	nextInputItems: Array<{ type: 'function_call_output'; call_id: string; output: string }>
	markers: PoeToolResultMarker[]
}> => {
	const openAIToolCalls = mapFunctionCallsToOpenAI(functionCalls)
	const results = await executeMcpToolCalls(openAIToolCalls, mcpTools, mcpCallTool)
	const resultMap = new Map<string, { name?: string; content?: unknown }>()
	for (const result of results) {
		if (!result.tool_call_id) continue
		resultMap.set(result.tool_call_id, {
			name: result.name,
			content: result.content
		})
	}

	const nextInputItems: Array<{ type: 'function_call_output'; call_id: string; output: string }> = []
	const markers: PoeToolResultMarker[] = []

	for (const call of functionCalls) {
		const matched = resultMap.get(call.id)
		const outputText =
			typeof matched?.content === 'string'
				? matched.content
				: matched?.content === undefined || matched?.content === null
					? ''
					: String(matched.content)

		nextInputItems.push({
			type: 'function_call_output',
			call_id: call.call_id,
			output: outputText
		})
		markers.push({
			toolName: call.name,
			content: outputText
		})
	}

	return {
		nextInputItems,
		markers
	}
}

export const runPureChatCompletionsMcpLoop = async function* (
	context: PoeRequestContext,
	prebuiltMessages?: PoeLoopMessage[]
) {
	if (!context.mcpCallTool) {
		throw new Error('Poe MCP 工具循环缺少 mcpCallTool。')
	}

	const loopMessages: PoeLoopMessage[] = prebuiltMessages
		? [...prebuiltMessages]
		: await Promise.all(context.messages.map((msg) => formatMsg(msg, context.resolveEmbedAsBinary))) as PoeLoopMessage[]

	const streamOneChatRound = async function* (
		roundMessages: PoeLoopMessage[],
		tools?: unknown[]
	): AsyncGenerator<string, { toolCalls: OpenAIToolCall[]; contentText: string }, undefined> {
		const body: Record<string, unknown> = {
			model: context.model,
			messages: roundMessages,
			...context.chatFallbackParams
		}
		if (tools && tools.length > 0) {
			body.tools = tools
		}
		if (context.enableReasoning) {
			body.reasoning_effort = 'medium'
		}

		const reader = await requestChatCompletionStreamByFetch(
			ensureCompletionEndpoint(context.baseURL),
			context.apiKey,
			body,
			context.controller.signal
		)

		let sseRest = ''
		let reading = true
		let contentText = ''
		const toolCallAccum: Map<number, { id: string; name: string; arguments: string }> = new Map()
		let reasoningActive = false
		let reasoningStartMs: number | null = null
		let reasoningBuffer = ''

		const processDelta = function* (delta: PoeChatDelta | undefined) {
			if (!delta) return

			const reasoningText = delta.reasoning_content
			if (reasoningText && context.enableReasoning) {
				if (!reasoningActive) {
					reasoningActive = true
					reasoningStartMs = Date.now()
					yield buildReasoningBlockStart(reasoningStartMs)
				}
				reasoningBuffer += reasoningText
				yield reasoningText
			}

			const text = delta.content
			if (typeof text === 'string' && text) {
				if (reasoningActive && reasoningBuffer.length > 0) {
					const durationMs = Date.now() - (reasoningStartMs ?? Date.now())
					yield buildReasoningBlockEnd(durationMs)
					reasoningActive = false
					reasoningBuffer = ''
					reasoningStartMs = null
				}
				contentText += text
				yield text
			}

			if (Array.isArray(delta.tool_calls)) {
				if (reasoningActive && reasoningBuffer.length > 0) {
					const durationMs = Date.now() - (reasoningStartMs ?? Date.now())
					yield buildReasoningBlockEnd(durationMs)
					reasoningActive = false
					reasoningBuffer = ''
					reasoningStartMs = null
				}
				for (const tc of delta.tool_calls) {
					const idx = tc.index ?? 0
					if (!toolCallAccum.has(idx)) {
						toolCallAccum.set(idx, { id: '', name: '', arguments: '' })
					}
					const acc = toolCallAccum.get(idx)
					if (!acc) {
						continue
					}
					if (tc.id) acc.id = tc.id
					if (tc.function?.name) acc.name += tc.function.name
					if (tc.function?.arguments) acc.arguments += tc.function.arguments
				}
			}
		}

		while (reading) {
			const { done, value } = await reader.read()
			const parsed = feedChunk(sseRest, done ? '\n\n' : value ?? '')
			sseRest = parsed.rest

			for (const event of parsed.events) {
				if (event.isDone) {
					reading = false
					break
				}
				const payload = event.json as PoeChatPayload | undefined
				const delta = payload?.choices?.[0]?.delta
				yield* processDelta(delta)
			}

			if (done) {
				reading = false
			}
		}

		if (reasoningActive && reasoningBuffer.length > 0) {
			const durationMs = Date.now() - (reasoningStartMs ?? Date.now())
			yield buildReasoningBlockEnd(durationMs)
		}

		const toolCalls: OpenAIToolCall[] = []
		for (const [, acc] of [...toolCallAccum.entries()].sort((a, b) => a[0] - b[0])) {
			if (acc.name) {
				toolCalls.push({
					id: acc.id || `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
					type: 'function' as const,
					function: { name: acc.name, arguments: acc.arguments || '{}' }
				})
			}
		}

		return { toolCalls, contentText }
	}

	for (let loop = 0; loop < context.maxToolCallLoops; loop++) {
		if (context.controller.signal.aborted) return
		const activeMcpTools = await context.getCurrentMcpTools()
		const chatTools = activeMcpTools.map((tool) => ({
			type: 'function' as const,
			function: {
				name: tool.name,
				description: tool.description || '',
				parameters: tool.inputSchema as Record<string, unknown>
			}
		}))

		const gen = streamOneChatRound(loopMessages, chatTools)
		let result = await gen.next()
		while (!result.done) {
			yield result.value
			result = await gen.next()
		}
		const { toolCalls, contentText } = result.value

		if (toolCalls.length === 0) {
			return
		}

		loopMessages.push({
			role: 'assistant',
			content: contentText,
			tool_calls: toolCalls.map((tc) => ({
				id: tc.id,
				type: 'function',
				function: { name: tc.function.name, arguments: tc.function.arguments }
			}))
		})

		const results = await executeMcpToolCalls(toolCalls, activeMcpTools, context.mcpCallTool)
		await context.refreshToolCandidates()

		for (const result of results) {
			loopMessages.push(result)
			const resultContent = typeof result.content === 'string' ? result.content : ''
			yield `{{FF_MCP_TOOL_START}}:${result.name || ''}:${resultContent}{{FF_MCP_TOOL_END}}:`
		}
	}

	const finalGen = streamOneChatRound(loopMessages)
	let finalResult = await finalGen.next()
	while (!finalResult.done) {
		yield finalResult.value
		finalResult = await finalGen.next()
	}
}
