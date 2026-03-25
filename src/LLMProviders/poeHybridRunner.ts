import { requestResponsesStreamByFetch } from './poeRequests'
import type { PoeRequestContext } from './poeRunnerShared'
import { ensureResponseEndpoint, isReasoningDeltaEvent, shouldFallbackToChatCompletions, shouldRetryContinuationWithoutReasoning } from './poeUtils'
import { extractResponseFunctionCalls, extractResponseOutputItems, formatMsg } from './poeMessageTransforms'
import { executePoeMcpToolCalls, runPureChatCompletionsMcpLoop } from './poeMcpRunners'
import { feedChunk } from './sse'
import { buildReasoningBlockEnd, buildReasoningBlockStart } from './utils'
import type { ContentItem } from './poeTypes'

type PoeResponsesPayload = {
	type?: unknown
	delta?: unknown
	response?: unknown
}

type PoeHybridMessage = {
	role: string
	content: string | ContentItem[] | null
	tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }>
	tool_call_id?: string
}

const buildAssistantToolCallMessage = (text: string, calls: ReturnType<typeof extractResponseFunctionCalls>) => ({
	role: 'assistant',
	content: text || null,
	tool_calls: calls.map((call) => ({
		id: call.id,
		type: 'function',
		function: { name: call.name, arguments: call.arguments }
	}))
})

const buildToolResultMessages = (
	calls: ReturnType<typeof extractResponseFunctionCalls>,
	outputs: Array<{ output: string }>
) => {
	return calls.map((call, index) => ({
		role: 'tool',
		tool_call_id: call.id,
		content: outputs[index]?.output ?? ''
	}))
}

export const runMcpHybridToolLoop = async function* (context: PoeRequestContext) {
	if (!context.mcpCallTool) {
		throw new Error('Poe MCP 工具循环缺少 mcpCallTool。')
	}

	const firstRoundData: Record<string, unknown> = {
		model: context.model,
		input: context.responseInput,
		...context.responseBaseParams
	}
	const toolCandidates = context.getToolCandidates()
	if (toolCandidates.length > 0) {
		firstRoundData.tools = toolCandidates
	}
	if (context.enableReasoning && firstRoundData.reasoning === undefined) {
		firstRoundData.reasoning = { effort: 'medium' }
	}

	let firstCompletedResponse: unknown = null
	let firstRoundText = ''
	let responsesApiOk = true

	try {
		const reader = await requestResponsesStreamByFetch(
			ensureResponseEndpoint(context.baseURL),
			context.apiKey,
			firstRoundData,
			context.controller.signal
		)

		let sseRest = ''
		let reading = true
		let reasoningActive = false
		let reasoningStartMs: number | null = null

		const processResponsesEvent = function* (payload: PoeResponsesPayload | undefined) {
			if (!payload) return
			const eventType = String(payload.type ?? '')

			if (isReasoningDeltaEvent(eventType)) {
				if (!context.enableReasoning) return
				const text = String(payload.delta ?? '')
				if (!text) return
				if (!reasoningActive) {
					reasoningActive = true
					reasoningStartMs = Date.now()
					yield buildReasoningBlockStart(reasoningStartMs)
				}
				yield text
				return
			}

			if (eventType === 'response.output_text.delta') {
				const text = String(payload.delta ?? '')
				if (!text) return
				if (reasoningActive) {
					reasoningActive = false
					const durationMs = Date.now() - (reasoningStartMs ?? Date.now())
					reasoningStartMs = null
					yield buildReasoningBlockEnd(durationMs)
				}
				firstRoundText += text
				yield text
				return
			}

			if (eventType === 'response.completed') {
				firstCompletedResponse = payload.response
				if (reasoningActive) {
					reasoningActive = false
					const durationMs = Date.now() - (reasoningStartMs ?? Date.now())
					reasoningStartMs = null
					yield buildReasoningBlockEnd(durationMs)
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
				yield* processResponsesEvent(event.json as PoeResponsesPayload | undefined)
			}
			if (done) {
				reading = false
			}
		}

		if (reasoningActive) {
			const durationMs = Date.now() - (reasoningStartMs ?? Date.now())
			yield buildReasoningBlockEnd(durationMs)
		}
	} catch (responsesError) {
		if (shouldFallbackToChatCompletions(responsesError)) {
			responsesApiOk = false
		} else {
			throw responsesError
		}
	}

	if (!responsesApiOk) {
		yield* runPureChatCompletionsMcpLoop(context)
		return
	}

	const firstFunctionCalls = extractResponseFunctionCalls(firstCompletedResponse)
	if (firstFunctionCalls.length === 0) return

	const firstRoundMcpTools = await context.getCurrentMcpTools()
	const executed = await executePoeMcpToolCalls(firstFunctionCalls, firstRoundMcpTools, context.mcpCallTool)
	await context.refreshToolCandidates()
	for (const marker of executed.markers) {
		yield `{{FF_MCP_TOOL_START}}:${marker.toolName}:${marker.content}{{FF_MCP_TOOL_END}}:`
	}

	const hybridAccumulatedInput: unknown[] = [
		...context.responseInput,
		...extractResponseOutputItems(firstCompletedResponse),
		...executed.nextInputItems
	]
	const continuationMessages: PoeHybridMessage[] = [
		...((await Promise.all(context.messages.map((msg) => formatMsg(msg, context.resolveEmbedAsBinary)))) as PoeHybridMessage[]),
		buildAssistantToolCallMessage(firstRoundText, firstFunctionCalls),
		...buildToolResultMessages(firstFunctionCalls, executed.nextInputItems)
	]
	let continuationReasoningEnabled = context.enableReasoning

	const buildHybridAccumulatedData = (): Record<string, unknown> => {
		const data: Record<string, unknown> = {
			model: context.model,
			...context.responseBaseParams,
			input: hybridAccumulatedInput
		}
		const nextToolCandidates = context.getToolCandidates()
		if (nextToolCandidates.length > 0) {
			data.tools = nextToolCandidates
		}
		if (context.enableReasoning && continuationReasoningEnabled && data.reasoning === undefined) {
			data.reasoning = { effort: 'medium' }
		}
		if (!continuationReasoningEnabled) {
			delete data.reasoning
		}
		return data
	}

	let responsesApiFailed = false
	for (let loop = 1; loop <= context.maxToolCallLoops; loop++) {
		if (context.controller.signal.aborted) return

		let reader: ReadableStreamDefaultReader<string> | undefined

		try {
			reader = await requestResponsesStreamByFetch(
				ensureResponseEndpoint(context.baseURL),
				context.apiKey,
				buildHybridAccumulatedData(),
				context.controller.signal
			)
		} catch (error) {
			let requestError: unknown = error
			if (
				continuationReasoningEnabled
				&& shouldRetryContinuationWithoutReasoning(requestError)
			) {
				continuationReasoningEnabled = false
				try {
					reader = await requestResponsesStreamByFetch(
						ensureResponseEndpoint(context.baseURL),
						context.apiKey,
						buildHybridAccumulatedData(),
						context.controller.signal
					)
				} catch (retryWithoutReasoningError) {
					requestError = retryWithoutReasoningError
				}
			}
			if (!reader) {
				responsesApiFailed = true
				break
			}
		}

		let completedResponse: unknown = null
		let completedText = ''
		let reasoningActive = false
		let reasoningStartMs: number | null = null
		let reading = true
		let sseRest = ''

		const processHybridSseEvent = function* (payload: Record<string, unknown> | undefined) {
			if (!payload) return
			const eventType = String(payload.type ?? '')

			if (isReasoningDeltaEvent(eventType)) {
				if (!context.enableReasoning) return
				const text = String(payload.delta ?? '')
				if (!text) return
				if (!reasoningActive) {
					reasoningActive = true
					reasoningStartMs = Date.now()
					yield buildReasoningBlockStart(reasoningStartMs)
				}
				yield text
				return
			}

			if (eventType === 'response.output_text.delta') {
				const text = String(payload.delta ?? '')
				if (!text) return
				completedText += text
				if (reasoningActive) {
					reasoningActive = false
					yield buildReasoningBlockEnd(Date.now() - (reasoningStartMs ?? Date.now()))
					reasoningStartMs = null
				}
				yield text
				return
			}

			if (eventType === 'response.completed') {
				completedResponse = payload.response
				if (reasoningActive) {
					reasoningActive = false
					yield buildReasoningBlockEnd(Date.now() - (reasoningStartMs ?? Date.now()))
					reasoningStartMs = null
				}
			}
		}

		try {
			while (reading) {
				const { done, value } = await reader.read()
				const parsed = feedChunk(sseRest, done ? '\n\n' : value ?? '')
				sseRest = parsed.rest
				for (const event of parsed.events) {
					if (event.isDone) {
						reading = false
						break
					}
					yield* processHybridSseEvent(event.json as Record<string, unknown> | undefined)
				}
				if (done) {
					reading = false
				}
			}
		} catch {
			if (reasoningActive) {
				yield buildReasoningBlockEnd(Date.now() - (reasoningStartMs ?? Date.now()))
			}
			responsesApiFailed = true
			break
		}

		if (reasoningActive) {
			yield buildReasoningBlockEnd(Date.now() - (reasoningStartMs ?? Date.now()))
		}

		if (!completedResponse) break

		const continuationCalls = extractResponseFunctionCalls(completedResponse)
		if (continuationCalls.length === 0) return

		const continuationMcpTools = await context.getCurrentMcpTools()
		const continuationExecuted = await executePoeMcpToolCalls(
			continuationCalls,
			continuationMcpTools,
			context.mcpCallTool
		)
		await context.refreshToolCandidates()
		continuationMessages.push(buildAssistantToolCallMessage(completedText, continuationCalls))
		continuationMessages.push(...buildToolResultMessages(continuationCalls, continuationExecuted.nextInputItems))
		for (const marker of continuationExecuted.markers) {
			yield `{{FF_MCP_TOOL_START}}:${marker.toolName}:${marker.content}{{FF_MCP_TOOL_END}}:`
		}

		hybridAccumulatedInput.push(...extractResponseOutputItems(completedResponse))
		hybridAccumulatedInput.push(...continuationExecuted.nextInputItems)
	}

	if (responsesApiFailed) {
		yield* runPureChatCompletionsMcpLoop(context, continuationMessages)
	}
}
