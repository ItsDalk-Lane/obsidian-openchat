/* eslint-disable @typescript-eslint/no-explicit-any */

import { t } from 'src/i18n/ai-runtime/helper'
import type { PoeRequestContext } from './poeRunnerShared'
import {
	isFunctionCallOutputInput,
	shouldRetryFunctionOutputTurn400,
	toToolResultContinuationInput
} from './poeRunnerShared'
import {
	isReasoningDeltaEvent,
	isPoeOrganizationKnownZdr,
	markPoeOrganizationAsZdr,
	resolveErrorStatus,
	shouldRetryWithoutPreviousResponseId,
	shouldRetryContinuationWithoutReasoning
} from './poeUtils'
import {
	extractOutputTextFromResponse,
	extractResponseFunctionCalls,
	extractReasoningTextFromResponse,
	extractResponseOutputItems
} from './poeMessageTransforms'
import { executePoeMcpToolCalls } from './poeMcpRunners'
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
		data.reasoning = { effort: 'medium', summary: 'auto' }
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
		data.reasoning = { effort: 'medium', summary: 'auto' }
	}
	return data
}

export const emitToolMarkers = async function* (
	context: PoeRequestContext,
	functionCalls: ReturnType<typeof extractResponseFunctionCalls>,
	mcpCallTool: PoeRequestContext['mcpCallTool']
) {
	const activeTools = await context.getCurrentTools()
	const activeMcpTools = await context.getCurrentMcpTools()
	const executed = await executePoeMcpToolCalls(functionCalls, activeMcpTools, mcpCallTool, {
		tools: activeTools,
		toolExecutor: context.toolExecutor,
		abortSignal: context.controller.signal,
		onToolCallResult: context.onToolCallResult,
	})
	await context.refreshToolCandidates()
	for (const marker of executed.markers) {
		yield `{{FF_MCP_TOOL_START}}:${marker.toolName}:${marker.content}{{FF_MCP_TOOL_END}}:`
	}
	return executed
}

const appendZdrSafeContinuationMessages = (
	accumulatedMessages: unknown[],
	completedResponse: unknown,
	toolResultInput: Array<{ type: 'function_call_output'; call_id: string; output: string }>
) => {
	const outputText = extractOutputTextFromResponse(completedResponse)
	if (outputText) {
		accumulatedMessages.push({
			role: 'assistant',
			content: [{ type: 'output_text', text: outputText }]
		})
	}
	const continuationInput = toToolResultContinuationInput(toolResultInput)
	if (Array.isArray(continuationInput)) {
		accumulatedMessages.push(...continuationInput)
	}
}

export const runResponsesWithOpenAISdk = async function* (context: PoeRequestContext) {
	let currentInput: unknown = context.responseInput
	let previousResponseId: string | undefined
	let continuationReasoningEnabled = context.enableReasoning
	let shouldUseAccumulatedContinuation = isPoeOrganizationKnownZdr(context.baseURL, context.apiKey)
	const accumulatedProtocolInput: unknown[] = [...context.responseInput]
	const accumulatedMessageInput: unknown[] = [...context.responseInput]

	const createResponsesStream = async (requestData: Record<string, unknown>) => {
		try {
			return await context.client.responses.create(requestData as any, {
				signal: context.controller.signal,
			})
		} catch (error) {
			if (!previousResponseId || !shouldRetryWithoutPreviousResponseId(error)) {
				throw error
			}

			markPoeOrganizationAsZdr(context.baseURL, context.apiKey)
			shouldUseAccumulatedContinuation = true
			previousResponseId = undefined
			return await context.client.responses.create(
				buildAccumulatedRequestData(context, accumulatedMessageInput, continuationReasoningEnabled) as any,
				{ signal: context.controller.signal }
			)
		}
	}

	for (let loop = 0; loop <= context.maxToolCallLoops; loop++) {
		if (context.controller.signal.aborted) return

		const isToolContinuationTurn = isFunctionCallOutputInput(currentInput)
		const shouldUseAccumulatedRequest = shouldUseAccumulatedContinuation
		let stream: Awaited<ReturnType<typeof context.client.responses.create>> | undefined

		try {
			stream = await createResponsesStream(
				(shouldUseAccumulatedRequest
					? buildAccumulatedRequestData(context, accumulatedMessageInput, continuationReasoningEnabled)
					: buildResponsesRequestData(
						context,
						currentInput,
						previousResponseId,
						'default',
						continuationReasoningEnabled
					)) as any,
			)
		} catch (error) {
			let requestError: unknown = error

			if (
				!stream
				&&
				isToolContinuationTurn
				&& continuationReasoningEnabled
				&& shouldRetryContinuationWithoutReasoning(requestError)
			) {
				continuationReasoningEnabled = false
				try {
					stream = await createResponsesStream(
						(shouldUseAccumulatedContinuation
							? buildAccumulatedRequestData(context, accumulatedMessageInput, continuationReasoningEnabled)
							: buildResponsesRequestData(
								context,
								currentInput,
								previousResponseId,
								'default',
								continuationReasoningEnabled,
								false
							)) as any,
					)
				} catch (retryWithoutReasoningError) {
					requestError = retryWithoutReasoningError
				}
			}

			if (!stream) {
				const errorStatus = resolveErrorStatus(requestError)
				if (errorStatus !== undefined && errorStatus >= 500 && (loop > 0 || shouldUseAccumulatedContinuation)) {
					stream = await createResponsesStream(
						buildAccumulatedRequestData(
							context,
							shouldUseAccumulatedContinuation ? accumulatedMessageInput : accumulatedProtocolInput,
							continuationReasoningEnabled
						) as any,
					)
				} else if (shouldRetryFunctionOutputTurn400(requestError, currentInput)) {
					try {
						stream = await createResponsesStream(
							(shouldUseAccumulatedContinuation
								? buildAccumulatedRequestData(context, accumulatedMessageInput, continuationReasoningEnabled)
								: buildResponsesRequestData(
									context,
									currentInput,
									previousResponseId,
									'compat',
									continuationReasoningEnabled
								)) as any,
						)
					} catch (compatError) {
						if (!shouldRetryFunctionOutputTurn400(compatError, currentInput)) {
							throw compatError
						}
						stream = await createResponsesStream(
							(shouldUseAccumulatedContinuation
								? (() => {
									const continuationInput = toToolResultContinuationInput(currentInput)
									const nextAccumulatedMessageInput = Array.isArray(continuationInput)
										? [...accumulatedMessageInput, ...continuationInput]
										: accumulatedMessageInput
									return buildAccumulatedRequestData(
										context,
										nextAccumulatedMessageInput,
										continuationReasoningEnabled
									)
								})()
								: buildResponsesRequestData(
									context,
									toToolResultContinuationInput(currentInput),
									previousResponseId,
									'default',
									continuationReasoningEnabled
								)) as any,
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
		let hasStreamedText = false
		let hasStreamedReasoning = false

		for await (const event of stream as AsyncIterable<Record<string, unknown>>) {
			if (isReasoningDeltaEvent(String(event.type ?? ''))) {
				if (!context.enableReasoning) continue
				const text = typeof (event as any).delta === 'string'
					? String((event as any).delta)
					: typeof (event as any).text === 'string'
						? String((event as any).text)
						: ''
				if (!text) {
					hasStreamedReasoning = true
					continue
				}
				if (!reasoningActive) {
					reasoningActive = true
					reasoningStartMs = Date.now()
					yield buildReasoningBlockStart(reasoningStartMs)
				}
				hasStreamedReasoning = true
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
				hasStreamedText = true
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

		if (context.enableReasoning && !hasStreamedReasoning) {
			const reasoningText = extractReasoningTextFromResponse(completedResponse)
			if (reasoningText) {
				const startMs = Date.now()
				yield buildReasoningBlockStart(startMs)
				yield reasoningText
				yield buildReasoningBlockEnd(Math.max(10, Date.now() - startMs))
			}
		}

		if (!hasStreamedText) {
			const outputText = extractOutputTextFromResponse(completedResponse)
			if (outputText) {
				yield outputText
			}
		}

		const functionCalls = extractResponseFunctionCalls(completedResponse)
		if (functionCalls.length === 0) {
			return
		}

		if (!context.hasToolRuntime || (!context.toolExecutor && !context.mcpCallTool)) {
			throw new Error(t('Poe Responses missing tool executor'))
		}
		if (loop >= context.maxToolCallLoops) {
			throw new Error(
				t('Poe tool loop exceeded maximum iterations').replace(
					'{count}',
					String(context.maxToolCallLoops)
				)
			)
		}
		if (!completedResponse?.id) {
			throw new Error(t('Poe Responses missing response id'))
		}

		const executedGen = emitToolMarkers(context, functionCalls, context.mcpCallTool)
		let executedResult = await executedGen.next()
		while (!executedResult.done) {
			yield executedResult.value
			executedResult = await executedGen.next()
		}
		const executed = executedResult.value
		previousResponseId = shouldUseAccumulatedContinuation ? undefined : String(completedResponse.id)
		currentInput = executed.nextInputItems
		accumulatedProtocolInput.push(...extractResponseOutputItems(completedResponse))
		accumulatedProtocolInput.push(...executed.nextInputItems)
		appendZdrSafeContinuationMessages(accumulatedMessageInput, completedResponse, executed.nextInputItems)
	}
}
