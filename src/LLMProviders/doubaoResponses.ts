import { executeToolCalls, extractApiParams } from 'src/core/agents/loop/openAILoopUtils'
import { t } from 'src/i18n/ai-runtime/helper'
import { DebugLogger } from 'src/utils/DebugLogger'
import type {
	Message,
	ResolveEmbedAsBinary,
	SaveAttachment,
	SendRequest,
} from './provider-shared'
import { normalizeProviderError } from './errors'
import { shouldRetryContinuationWithoutReasoning } from './poeUtils'
import { processMessages } from './doubaoUtils'
import type { DoubaoOptions } from './doubao'
import {
	buildBaseResponsesParams,
	buildFunctionOutputItems,
	buildRequestData,
	buildResponsesTools,
	createRequest,
	DEFAULT_MAX_TOOL_CALL_LOOPS,
	extractResponseFunctionCallsForLoop,
	isUnsupportedDoubaoResponsesModel,
	mapResponseCallsToToolLoop,
	normalizeDoubaoReasoningEffort,
	normalizeDoubaoThinkingType,
	resolveActiveTools,
	resolveDoubaoResponsesEndpoint,
	resolveToolExecutor,
	streamResponseRound,
} from './doubao-responses-support'

export const sendDoubaoResponsesRequest = (settings: DoubaoOptions): SendRequest =>
	async function* (
		messages: readonly Message[],
		controller: AbortController,
		resolveEmbedAsBinary: ResolveEmbedAsBinary,
		_saveAttachment?: SaveAttachment,
	) {
		try {
			const {
				apiKey,
				baseURL,
				model,
				imageDetail,
				imagePixelLimit,
				enableReasoning,
				thinkingType,
				reasoningEffort,
				webSearchConfig,
			} = settings

			if (!apiKey) throw new Error(t('API key is required'))
			if (!model) throw new Error(t('Model is required'))
			if (isUnsupportedDoubaoResponsesModel(model)) {
				throw new Error(t('Doubao Responses API is not supported for this model'))
			}

			const endpoint = resolveDoubaoResponsesEndpoint(baseURL)
			const normalizedThinkingType = enableReasoning === true
				? normalizeDoubaoThinkingType(thinkingType)
				: 'disabled'
			const normalizedReasoningEffort = enableReasoning === true
				? normalizeDoubaoReasoningEffort(reasoningEffort)
				: undefined
			const showReasoning =
				enableReasoning === true
				&& normalizedThinkingType !== 'disabled'
				&& (!settings.enableWebSearch || webSearchConfig?.enableThinking !== false)

			const processedMessages = await processMessages(
				messages,
				resolveEmbedAsBinary,
				imageDetail,
				imagePixelLimit,
				true,
			)
			const firstInput = webSearchConfig?.systemPrompt
				? [
					{
						role: 'system',
						content: [
							{
								type: 'input_text',
								text: webSearchConfig.systemPrompt,
							},
						],
					},
					...processedMessages,
				]
				: processedMessages

			const toolExecutor = resolveToolExecutor(settings)
			const rawApiParams = extractApiParams(settings as Record<string, unknown>)
			const baseResponsesParams = buildBaseResponsesParams(settings, rawApiParams)
			let currentInput: unknown = firstInput
			let previousResponseId: string | undefined
			let continuationThinkingEnabled = showReasoning
			const maxToolCallLoops =
				typeof settings.maxToolCallLoops === 'number' && settings.maxToolCallLoops > 0
					? settings.maxToolCallLoops
					: typeof settings.mcpMaxToolCallLoops === 'number' && settings.mcpMaxToolCallLoops > 0
						? settings.mcpMaxToolCallLoops
						: DEFAULT_MAX_TOOL_CALL_LOOPS

			for (let loop = 0; loop <= maxToolCallLoops; loop += 1) {
				const activeTools = await resolveActiveTools(settings)
				const responseTools = buildResponsesTools(rawApiParams.tools, activeTools, settings)
				const requestData = buildRequestData({
					model,
					input: currentInput,
					previousResponseId,
					baseParams: baseResponsesParams,
					responseTools,
					thinkingType: normalizedThinkingType,
					reasoningEffort: normalizedReasoningEffort,
					includeThinking: continuationThinkingEnabled,
				})

				let response: Response | undefined
				try {
					response = await createRequest(endpoint, apiKey, requestData, controller.signal)
				} catch (error) {
					const isToolContinuation =
						Array.isArray(currentInput)
						&& currentInput.every(
							(item) => item && typeof item === 'object' && (item as Record<string, unknown>).type === 'function_call_output',
						)
					if (
						isToolContinuation
						&& continuationThinkingEnabled
						&& shouldRetryContinuationWithoutReasoning(error)
					) {
						continuationThinkingEnabled = false
						response = await createRequest(
							endpoint,
							apiKey,
							buildRequestData({
								model,
								input: currentInput,
								previousResponseId,
								baseParams: baseResponsesParams,
								responseTools,
								thinkingType: normalizedThinkingType,
								reasoningEffort: normalizedReasoningEffort,
								includeThinking: false,
							}),
							controller.signal,
						)
					} else {
						throw error
					}
				}

				const roundGen = streamResponseRound(response, continuationThinkingEnabled)
				let roundResult = await roundGen.next()
				while (!roundResult.done) {
					yield roundResult.value
					roundResult = await roundGen.next()
				}

				const completedResponse = roundResult.value.completedResponse
				const functionCalls = extractResponseFunctionCallsForLoop(completedResponse)
				if (functionCalls.length === 0) {
					return
				}

				if (!toolExecutor) {
					throw new Error(t('Doubao Responses missing tool executor'))
				}
				if (loop >= maxToolCallLoops) {
					throw new Error(t('Doubao tool loop exceeded maximum iterations').replace('{count}', String(maxToolCallLoops)))
				}
				if (!completedResponse || typeof completedResponse !== 'object' || !('id' in (completedResponse as Record<string, unknown>))) {
					throw new Error(t('Doubao Responses missing response id'))
				}
				const responseId = (completedResponse as Record<string, unknown>).id
				if (typeof responseId !== 'string' || !responseId.trim()) {
					throw new Error(t('Doubao Responses missing response id'))
				}

				const toolResults = await executeToolCalls(
					mapResponseCallsToToolLoop(functionCalls),
					activeTools,
					toolExecutor,
					controller.signal,
					settings.onToolCallResult,
				)
				if (toolResults.length !== functionCalls.length) {
					throw new Error('Doubao tool execution returned mismatched result count.')
				}
				for (const [index, call] of functionCalls.entries()) {
					const content = typeof toolResults[index]?.content === 'string' ? toolResults[index].content : ''
					yield `{{FF_MCP_TOOL_START}}:${call.name}:${content}{{FF_MCP_TOOL_END}}:`
				}

				previousResponseId = responseId
				currentInput = buildFunctionOutputItems(functionCalls, toolResults)
			}
		} catch (error) {
			DebugLogger.error('[Doubao] Responses request failed', error)
			throw normalizeProviderError(error, 'Doubao request failed')
		}
	}
