/* eslint-disable @typescript-eslint/no-explicit-any */

import { requestResponsesByRequestUrl, requestResponsesStreamByFetch } from './poeRequests'
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
	extractOutputTextFromResponse,
	extractReasoningTextFromResponse,
	extractResponseFunctionCalls,
	extractResponseOutputItems
} from './poeMessageTransforms'
import {
	buildAccumulatedRequestData,
	buildResponsesRequestData,
	emitToolMarkers
} from './poeResponsesRunners'
import { withRetry } from './retry'
import { feedChunk } from './sse'
import { buildReasoningBlockEnd, buildReasoningBlockStart } from './utils'

export const runResponsesWithDesktopRequestUrl = async function* (context: PoeRequestContext) {
	let currentInput: unknown = context.responseInput
	let previousResponseId: string | undefined
	let continuationReasoningEnabled = context.enableReasoning
	const accumulatedInput: unknown[] = [...context.responseInput]
	const requestResponsesWithRetry = (body: Record<string, unknown>) =>
		withRetry(
			() => requestResponsesByRequestUrl(ensureResponseEndpoint(context.baseURL), context.apiKey, body),
			{
				...context.retryOptions,
				signal: context.controller.signal
			}
		)

	for (let loop = 0; loop <= context.maxToolCallLoops; loop++) {
		if (context.controller.signal.aborted) return

		const isToolContinuationTurn = isFunctionCallOutputInput(currentInput)
		let response: any
		try {
			response = await requestResponsesWithRetry(
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
					response = await requestResponsesWithRetry(
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

			if (!response) {
				const errorStatus = resolveErrorStatus(requestError)
				if (errorStatus !== undefined && errorStatus >= 500 && loop > 0) {
					response = await requestResponsesWithRetry(
						buildAccumulatedRequestData(context, accumulatedInput, continuationReasoningEnabled)
					)
				} else if (shouldRetryFunctionOutputTurn400(requestError, currentInput)) {
					try {
						response = await requestResponsesWithRetry(
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
						response = await requestResponsesWithRetry(
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

		if (context.enableReasoning) {
			const reasoningText = extractReasoningTextFromResponse(response)
			if (reasoningText) {
				const startMs = Date.now()
				yield buildReasoningBlockStart(startMs)
				yield reasoningText
				const durationMs = Math.max(10, Date.now() - startMs)
				yield buildReasoningBlockEnd(durationMs)
			}
		}

		const functionCalls = extractResponseFunctionCalls(response)
		if (functionCalls.length === 0) {
			const text = extractOutputTextFromResponse(response)
			if (text) yield text
			return
		}

		if (!context.hasMcpToolRuntime || !context.mcpCallTool) {
			throw new Error('Poe Responses 返回了 function_call，但未配置 MCP 工具执行器。')
		}
		if (loop >= context.maxToolCallLoops) {
			throw new Error(`Poe MCP tool loop exceeded maximum iterations (${context.maxToolCallLoops})`)
		}
		if (!response?.id) {
			throw new Error('Poe Responses 缺少 response.id，无法继续工具循环。')
		}

		const executedGen = emitToolMarkers(context, functionCalls, context.mcpCallTool)
		let executedResult = await executedGen.next()
		while (!executedResult.done) {
			yield executedResult.value
			executedResult = await executedGen.next()
		}
		const executed = executedResult.value
		previousResponseId = String(response.id)
		currentInput = executed.nextInputItems
		accumulatedInput.push(...extractResponseOutputItems(response))
		accumulatedInput.push(...executed.nextInputItems)
	}
}

export const runResponsesStreamByFetch = async function* (context: PoeRequestContext) {
	const responseData: Record<string, unknown> = {
		model: context.model,
		input: context.responseInput,
		...context.responseBaseParams
	}
	const toolCandidates = context.getToolCandidates()
	if (toolCandidates.length > 0) {
		responseData.tools = toolCandidates
	}
	if (context.enableReasoning && responseData.reasoning === undefined) {
		responseData.reasoning = { effort: 'medium' }
	}

	const reader = await requestResponsesStreamByFetch(
		ensureResponseEndpoint(context.baseURL),
		context.apiKey,
		responseData,
		context.controller.signal
	)

	let sseRest = ''
	let reading = true
	let reasoningActive = false
	let reasoningStartMs: number | null = null

	while (reading) {
		const { done, value } = await reader.read()
		const parsed = feedChunk(sseRest, done ? '\n\n' : value ?? '')
		sseRest = parsed.rest

		for (const event of parsed.events) {
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

			if (eventType === 'response.completed' && reasoningActive) {
				reasoningActive = false
				const durationMs = Date.now() - (reasoningStartMs ?? Date.now())
				reasoningStartMs = null
				yield buildReasoningBlockEnd(durationMs)
			}
		}

		if (done) {
			reading = false
		}
	}

	if (reasoningActive) {
		const durationMs = Date.now() - (reasoningStartMs ?? Date.now())
		yield buildReasoningBlockEnd(durationMs)
	}
}
