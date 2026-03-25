/* eslint-disable @typescript-eslint/no-explicit-any */

import { requestResponsesStreamByFetch } from './poeRequests'
import type { PoeRequestContext } from './poeRunnerShared'
import {
	isFunctionCallOutputInput,
	shouldRetryFunctionOutputTurn400,
	toToolResultContinuationInput
} from './poeRunnerShared'
import {
	ensureResponseEndpoint,
	isReasoningDeltaEvent,
	resolveErrorStatus,
	shouldRetryContinuationWithoutReasoning
} from './poeUtils'
import {
	extractResponseFunctionCalls,
	extractResponseOutputItems
} from './poeMessageTransforms'
import { executePoeMcpToolCalls } from './poeMcpRunners'
import { withRetry } from './retry'
import { feedChunk } from './sse'
import { buildReasoningBlockEnd, buildReasoningBlockStart } from './utils'

export const buildResponsesRequestData = (
	context: PoeRequestContext,
	input: unknown,
	previousId: string | undefined,
	mode: 'default' | 'compat',
	continuationReasoningEnabled: boolean,
	allowContinuationReasoning = true
) => {
	const isToolContinuation = isFunctionCallOutputInput(input)
	const data: Record<string, unknown> = {
		model: context.model,
		stream: true,
		input
	}
	if (mode === 'default') {
		Object.assign(data, context.responseBaseParams)
	}
	if (previousId) {
		data.previous_response_id = previousId
	}
	const toolCandidates = context.getToolCandidates()
	const shouldAttachTools =
		toolCandidates.length > 0 && (mode === 'compat' ? isToolContinuation : !isToolContinuation)
	if (shouldAttachTools) {
		data.tools = toolCandidates
	}
	const shouldAttachReasoning =
		context.enableReasoning
		&& data.reasoning === undefined
		&& (!isToolContinuation || (continuationReasoningEnabled && allowContinuationReasoning))
	if (shouldAttachReasoning) {
		data.reasoning = { effort: 'medium' }
	}
	return data
}

export const buildAccumulatedRequestData = (
	context: PoeRequestContext,
	accumulatedInput: unknown[],
	continuationReasoningEnabled: boolean
) => {
	const data: Record<string, unknown> = {
		model: context.model,
		stream: true,
		...context.responseBaseParams,
		input: accumulatedInput
	}
	const toolCandidates = context.getToolCandidates()
	if (toolCandidates.length > 0) {
		data.tools = toolCandidates
	}
	if (context.enableReasoning && continuationReasoningEnabled && data.reasoning === undefined) {
		data.reasoning = { effort: 'medium' }
	}
	if (!continuationReasoningEnabled) {
		delete data.reasoning
	}
	return data
}

export const emitToolMarkers = async function* (
	context: PoeRequestContext,
	functionCalls: ReturnType<typeof extractResponseFunctionCalls>,
	mcpCallTool: NonNullable<PoeRequestContext['mcpCallTool']>
) {
	const activeMcpTools = await context.getCurrentMcpTools()
	const executed = await executePoeMcpToolCalls(functionCalls, activeMcpTools, mcpCallTool)
	await context.refreshToolCandidates()
	for (const marker of executed.markers) {
		yield `{{FF_MCP_TOOL_START}}:${marker.toolName}:${marker.content}{{FF_MCP_TOOL_END}}:`
	}
	return executed
}

export const runResponsesWithOpenAISdk = async function* (context: PoeRequestContext) {
	let currentInput: unknown = context.responseInput
	let previousResponseId: string | undefined
	let continuationReasoningEnabled = context.enableReasoning
	const accumulatedInput: unknown[] = [...context.responseInput]

	for (let loop = 0; loop <= context.maxToolCallLoops; loop++) {
		if (context.controller.signal.aborted) return

		const isToolContinuationTurn = isFunctionCallOutputInput(currentInput)
		let stream: Awaited<ReturnType<typeof context.client.responses.create>> | undefined

		try {
			stream = await context.client.responses.create(
				buildResponsesRequestData(
					context,
					currentInput,
					previousResponseId,
					'default',
					continuationReasoningEnabled
				) as any,
				{ signal: context.controller.signal }
			)
		} catch (error) {
			let requestError: unknown = error

			if (
				isToolContinuationTurn
				&& continuationReasoningEnabled
				&& shouldRetryContinuationWithoutReasoning(requestError)
			) {
				continuationReasoningEnabled = false
				try {
					stream = await context.client.responses.create(
						buildResponsesRequestData(
							context,
							currentInput,
							previousResponseId,
							'default',
							continuationReasoningEnabled,
							false
						) as any,
						{ signal: context.controller.signal }
					)
				} catch (retryWithoutReasoningError) {
					requestError = retryWithoutReasoningError
				}
			}

			if (!stream) {
				const errorStatus = resolveErrorStatus(requestError)
				if (errorStatus !== undefined && errorStatus >= 500 && loop > 0) {
					stream = await context.client.responses.create(
						buildAccumulatedRequestData(context, accumulatedInput, continuationReasoningEnabled) as any,
						{ signal: context.controller.signal }
					)
				} else if (shouldRetryFunctionOutputTurn400(requestError, currentInput)) {
					try {
						stream = await context.client.responses.create(
							buildResponsesRequestData(
								context,
								currentInput,
								previousResponseId,
								'compat',
								continuationReasoningEnabled
							) as any,
							{ signal: context.controller.signal }
						)
					} catch (compatError) {
						if (!shouldRetryFunctionOutputTurn400(compatError, currentInput)) {
							throw compatError
						}
						stream = await context.client.responses.create(
							buildResponsesRequestData(
								context,
								toToolResultContinuationInput(currentInput),
								previousResponseId,
								'default',
								continuationReasoningEnabled
							) as any,
							{ signal: context.controller.signal }
						)
					}
				} else {
					throw requestError
				}
			}
		}

		let completedResponse: any = null
		let reasoningActive = false
		let reasoningStartMs: number | null = null

		for await (const event of stream as AsyncIterable<Record<string, unknown>>) {
			if (isReasoningDeltaEvent(String(event.type ?? ''))) {
				if (!context.enableReasoning) continue
				const text = String((event as any).delta ?? '')
				if (!text) continue
				if (!reasoningActive) {
					reasoningActive = true
					reasoningStartMs = Date.now()
					yield buildReasoningBlockStart(reasoningStartMs)
				}
				yield text
				continue
			}

			if (event.type === 'response.output_text.delta') {
				const text = String((event as any).delta ?? '')
				if (!text) continue
				if (reasoningActive) {
					reasoningActive = false
					const durationMs = Date.now() - (reasoningStartMs ?? Date.now())
					reasoningStartMs = null
					yield buildReasoningBlockEnd(durationMs)
				}
				yield text
				continue
			}

			if (event.type === 'response.completed') {
				completedResponse = (event as any).response
				if (reasoningActive) {
					reasoningActive = false
					const durationMs = Date.now() - (reasoningStartMs ?? Date.now())
					reasoningStartMs = null
					yield buildReasoningBlockEnd(durationMs)
				}
			}
		}

		if (reasoningActive) {
			const durationMs = Date.now() - (reasoningStartMs ?? Date.now())
			yield buildReasoningBlockEnd(durationMs)
		}

		const functionCalls = extractResponseFunctionCalls(completedResponse)
		if (functionCalls.length === 0) {
			return
		}

		if (!context.hasMcpToolRuntime || !context.mcpCallTool) {
			throw new Error('Poe Responses 返回了 function_call，但未配置 MCP 工具执行器。')
		}
		if (loop >= context.maxToolCallLoops) {
			throw new Error(`Poe MCP tool loop exceeded maximum iterations (${context.maxToolCallLoops})`)
		}
		if (!completedResponse?.id) {
			throw new Error('Poe Responses 缺少 response.id，无法继续工具循环。')
		}

		const executedGen = emitToolMarkers(context, functionCalls, context.mcpCallTool)
		let executedResult = await executedGen.next()
		while (!executedResult.done) {
			yield executedResult.value
			executedResult = await executedGen.next()
		}
		const executed = executedResult.value
		previousResponseId = String(completedResponse.id)
		currentInput = executed.nextInputItems
		accumulatedInput.push(...extractResponseOutputItems(completedResponse))
		accumulatedInput.push(...executed.nextInputItems)
	}
}

export const runResponsesWithDesktopFetchSse = async function* (context: PoeRequestContext) {
	let currentInput: unknown = context.responseInput
	let previousResponseId: string | undefined
	let continuationReasoningEnabled = context.enableReasoning
	const accumulatedInput: unknown[] = [...context.responseInput]
	const requestResponsesStreamWithRetry = (body: Record<string, unknown>) =>
		withRetry(
			() => requestResponsesStreamByFetch(ensureResponseEndpoint(context.baseURL), context.apiKey, body, context.controller.signal),
			{
				...context.retryOptions,
				signal: context.controller.signal
			}
		)

	for (let loop = 0; loop <= context.maxToolCallLoops; loop++) {
		if (context.controller.signal.aborted) return

		const isToolContinuationTurn = isFunctionCallOutputInput(currentInput)
		let reader: ReadableStreamDefaultReader<string> | undefined

		try {
			reader = await requestResponsesStreamWithRetry(
				buildResponsesRequestData(
					context,
					currentInput,
					previousResponseId,
					'default',
					continuationReasoningEnabled
				)
			)
		} catch (error) {
			let requestError: unknown = error

			if (
				isToolContinuationTurn
				&& continuationReasoningEnabled
				&& shouldRetryContinuationWithoutReasoning(requestError)
			) {
				continuationReasoningEnabled = false
				try {
					reader = await requestResponsesStreamWithRetry(
						buildResponsesRequestData(
							context,
							currentInput,
							previousResponseId,
							'default',
							continuationReasoningEnabled,
							false
						)
					)
				} catch (retryWithoutReasoningError) {
					requestError = retryWithoutReasoningError
				}
			}

			if (!reader) {
				const errorStatus = resolveErrorStatus(requestError)
				if (errorStatus !== undefined && errorStatus >= 500 && loop > 0) {
					reader = await requestResponsesStreamWithRetry(
						buildAccumulatedRequestData(context, accumulatedInput, continuationReasoningEnabled)
					)
				} else if (shouldRetryFunctionOutputTurn400(requestError, currentInput)) {
					try {
						reader = await requestResponsesStreamWithRetry(
							buildResponsesRequestData(
								context,
								currentInput,
								previousResponseId,
								'compat',
								continuationReasoningEnabled
							)
						)
					} catch (compatError) {
						if (!shouldRetryFunctionOutputTurn400(compatError, currentInput)) {
							throw compatError
						}
						reader = await requestResponsesStreamWithRetry(
							buildResponsesRequestData(
								context,
								toToolResultContinuationInput(currentInput),
								previousResponseId,
								'default',
								continuationReasoningEnabled
							)
						)
					}
				} else {
					throw requestError
				}
			}
		}

		let completedResponse: any = null
		let reasoningActive = false
		let reasoningStartMs: number | null = null
		let reading = true
		let sseRest = ''

		const processEvents = async function* (
			events: Array<{ isDone: boolean; parseError?: string; json?: unknown }>
		) {
			for (const event of events) {
				if (event.isDone) {
					reading = false
					break
				}
				const payload = event.json as Record<string, unknown> | undefined
				if (!payload) continue
				const eventType = String(payload.type ?? '')

				if (isReasoningDeltaEvent(eventType)) {
					if (!context.enableReasoning) continue
					const text = String((payload as any).delta ?? '')
					if (!text) continue
					if (!reasoningActive) {
						reasoningActive = true
						reasoningStartMs = Date.now()
						yield buildReasoningBlockStart(reasoningStartMs)
					}
					yield text
					continue
				}

				if (eventType === 'response.output_text.delta') {
					const text = String((payload as any).delta ?? '')
					if (!text) continue
					if (reasoningActive) {
						reasoningActive = false
						const durationMs = Date.now() - (reasoningStartMs ?? Date.now())
						reasoningStartMs = null
						yield buildReasoningBlockEnd(durationMs)
					}
					yield text
					continue
				}

				if (eventType === 'response.completed') {
					completedResponse = (payload as any).response
					if (reasoningActive) {
						reasoningActive = false
						const durationMs = Date.now() - (reasoningStartMs ?? Date.now())
						reasoningStartMs = null
						yield buildReasoningBlockEnd(durationMs)
					}
				}
			}
		}

		while (reading) {
			const { done, value } = await reader.read()
			const parsed = feedChunk(sseRest, done ? '\n\n' : value ?? '')
			sseRest = parsed.rest
			for await (const text of processEvents(parsed.events)) {
				yield text
			}
			if (done) {
				reading = false
			}
		}

		if (reasoningActive) {
			const durationMs = Date.now() - (reasoningStartMs ?? Date.now())
			yield buildReasoningBlockEnd(durationMs)
		}

		if (!completedResponse) {
			throw new Error('Poe Responses stream ended without response.completed payload')
		}

		const functionCalls = extractResponseFunctionCalls(completedResponse)
		if (functionCalls.length === 0) {
			return
		}

		if (!context.hasMcpToolRuntime || !context.mcpCallTool) {
			throw new Error('Poe Responses 返回了 function_call，但未配置 MCP 工具执行器。')
		}
		if (loop >= context.maxToolCallLoops) {
			throw new Error(`Poe MCP tool loop exceeded maximum iterations (${context.maxToolCallLoops})`)
		}
		if (!completedResponse?.id) {
			throw new Error('Poe Responses 缺少 response.id，无法继续工具循环。')
		}

		const executedGen = emitToolMarkers(context, functionCalls, context.mcpCallTool)
		let executedResult = await executedGen.next()
		while (!executedResult.done) {
			yield executedResult.value
			executedResult = await executedGen.next()
		}
		const executed = executedResult.value
		previousResponseId = String(completedResponse.id)
		currentInput = executed.nextInputItems
		accumulatedInput.push(...extractResponseOutputItems(completedResponse))
		accumulatedInput.push(...executed.nextInputItems)
	}
}
