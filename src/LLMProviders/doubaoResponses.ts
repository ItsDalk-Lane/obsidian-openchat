import { resolveCurrentTools, toOpenAITools } from 'src/core/agents/loop/openAILoopShared'
import { executeToolCalls, extractApiParams } from 'src/core/agents/loop/openAILoopUtils'
import type { ToolDefinition, ToolExecutor } from 'src/core/agents/loop/types'
import { t } from 'src/i18n/ai-runtime/helper'
import { McpToolExecutor, mcpToolToToolDefinition } from 'src/services/mcp/McpToolExecutor'
import { resolveCurrentMcpTools } from 'src/services/mcp/mcpToolCallHandler'
import { DebugLogger } from 'src/utils/DebugLogger'
import type { Message, ResolveEmbedAsBinary, SaveAttachment, SendRequest } from '.'
import { normalizeProviderError } from './errors'
import { extractResponseFunctionCalls } from './poeMessageTransforms'
import { shouldRetryContinuationWithoutReasoning } from './poeUtils'
import { withRetry } from './retry'
import { feedChunk } from './sse'
import { buildReasoningBlockEnd, buildReasoningBlockStart } from './utils'
import { createDoubaoHTTPError, extractString, processMessages } from './doubaoUtils'
import type { DoubaoOptions, DoubaoReasoningEffort, DoubaoThinkingType } from './doubao'

type DoubaoResponseEvent = {
	type?: unknown
	delta?: unknown
	response?: unknown
}

type ResponseFunctionCall = {
	id: string
	callId: string
	name: string
	arguments: string
}

type ResponseFunctionTool = {
	type: 'function'
	name: string
	description?: string
	parameters: Record<string, unknown>
}

type ResponseTool = ResponseFunctionTool | Record<string, unknown>

const DOUBAO_UNSUPPORTED_RESPONSES_MODELS = new Set([
	'doubao-1-5-pro-32k-character-250715',
])

const DOUBAO_REASONING_DELTA_EVENTS = new Set([
	'response.reasoning.delta',
	'response.reasoning_text.delta',
	'response.reasoning_summary_text.delta',
])

const DEFAULT_MAX_TOOL_CALL_LOOPS = 10

const normalizeDoubaoThinkingType = (
	thinkingType: DoubaoThinkingType | string | undefined,
): DoubaoThinkingType => {
	if (
		thinkingType === 'enabled'
		|| thinkingType === 'disabled'
		|| thinkingType === 'auto'
	) {
		return thinkingType
	}
	return 'enabled'
}

const normalizeDoubaoReasoningEffort = (
	reasoningEffort: DoubaoReasoningEffort | string | undefined,
): DoubaoReasoningEffort | undefined => {
	if (
		reasoningEffort === 'minimal'
		|| reasoningEffort === 'low'
		|| reasoningEffort === 'medium'
		|| reasoningEffort === 'high'
	) {
		return reasoningEffort
	}
	return undefined
}

export const resolveDoubaoResponsesEndpoint = (baseURL: string): string => {
	const trimmed = baseURL.trim()
	if (!trimmed) {
		return 'https://ark.cn-beijing.volces.com/api/v3/responses'
	}
	if (trimmed.endsWith('/responses')) {
		return trimmed
	}
	if (trimmed.endsWith('/chat/completions')) {
		return trimmed.replace(/\/chat\/completions$/, '/responses')
	}
	return trimmed
}

const normalizeResponseFunctionTool = (tool: unknown): ResponseTool | null => {
	if (!tool || typeof tool !== 'object') return null
	const raw = tool as Record<string, unknown>
	if (raw.type !== 'function') {
		return raw
	}

	const nestedFunction =
		raw.function && typeof raw.function === 'object'
			? (raw.function as Record<string, unknown>)
			: undefined
	const name = String(raw.name ?? nestedFunction?.name ?? '')
	if (!name) return null

	return {
		type: 'function',
		name,
		description:
			typeof raw.description === 'string'
				? raw.description
				: typeof nestedFunction?.description === 'string'
					? nestedFunction.description
					: undefined,
		parameters:
			(raw.parameters && typeof raw.parameters === 'object')
				? (raw.parameters as Record<string, unknown>)
				: nestedFunction?.parameters && typeof nestedFunction.parameters === 'object'
					? (nestedFunction.parameters as Record<string, unknown>)
					: { type: 'object', properties: {} },
	}
}

const dedupeResponseTools = (tools: ResponseTool[]): ResponseTool[] => {
	const seen = new Set<string>()
	const deduped: ResponseTool[] = []

	for (const tool of tools) {
		if (!tool || typeof tool !== 'object') continue
		const type = String(tool.type ?? '')
		if (!type) continue
		const key =
			type === 'function'
				? `function:${String(tool.name ?? '')}`
				: `${type}:${JSON.stringify(tool)}`
		if (seen.has(key)) continue
		seen.add(key)
		deduped.push(tool)
	}

	return deduped
}

const buildWebSearchTool = (
	webSearchConfig: DoubaoOptions['webSearchConfig'],
): ResponseTool => {
	const tool: Record<string, unknown> = {
		type: 'web_search',
	}

	if (typeof webSearchConfig?.limit === 'number' && webSearchConfig.limit > 0) {
		tool.max_results = webSearchConfig.limit
	}
	if (typeof webSearchConfig?.maxKeyword === 'number' && webSearchConfig.maxKeyword > 0) {
		tool.max_keywords = webSearchConfig.maxKeyword
	}
	if (Array.isArray(webSearchConfig?.sources) && webSearchConfig.sources.length > 0) {
		tool.sources = webSearchConfig.sources
	}
	if (webSearchConfig?.userLocation) {
		tool.user_location = { ...webSearchConfig.userLocation }
	}

	return tool
}

const toResponseFunctionTools = (tools: ToolDefinition[]): ResponseFunctionTool[] => {
	return toOpenAITools(tools).map((tool) => ({
		type: 'function',
		name: tool.function.name,
		description: tool.function.description,
		parameters: tool.function.parameters,
	}))
}

const resolveToolExecutor = (options: DoubaoOptions): ToolExecutor | undefined => {
	if (options.toolExecutor) {
		return options.toolExecutor
	}
	if (options.mcpCallTool) {
		return new McpToolExecutor(options.mcpCallTool)
	}
	return undefined
}

const dedupeToolDefinitions = (tools: ToolDefinition[]): ToolDefinition[] => {
	const seen = new Set<string>()
	return tools.filter((tool) => {
		const key = `${tool.source}:${tool.sourceId}:${tool.name}`
		if (seen.has(key)) return false
		seen.add(key)
		return true
	})
}

const resolveLegacyMcpTools = async (options: DoubaoOptions): Promise<ToolDefinition[]> => {
	const legacyTools = await resolveCurrentMcpTools(options.mcpTools, options.mcpGetTools)
	return legacyTools.map(mcpToolToToolDefinition)
}

const resolveActiveTools = async (options: DoubaoOptions): Promise<ToolDefinition[]> => {
	const [genericTools, legacyMcpTools] = await Promise.all([
		resolveCurrentTools(options.tools, options.getTools),
		resolveLegacyMcpTools(options),
	])
	return dedupeToolDefinitions([...genericTools, ...legacyMcpTools])
}

const extractResponseFunctionCallsForLoop = (response: unknown): ResponseFunctionCall[] => {
	return extractResponseFunctionCalls(response).map((call) => ({
		id: call.id,
		callId: call.call_id,
		name: call.name,
		arguments: call.arguments,
	}))
}

const mapResponseCallsToToolLoop = (calls: ResponseFunctionCall[]) => {
	return calls.map((call) => ({
		id: call.id,
		type: 'function' as const,
		function: {
			name: call.name,
			arguments: call.arguments,
		},
	}))
}

const buildFunctionOutputItems = (
	calls: ResponseFunctionCall[],
	results: Awaited<ReturnType<typeof executeToolCalls>>,
) => {
	return calls.map((call, index) => ({
		type: 'function_call_output' as const,
		call_id: call.callId,
		output: typeof results[index]?.content === 'string' ? results[index].content : '',
	}))
}

const closeReasoningBlock = async function* (
	reasoningActive: boolean,
	reasoningStartMs: number | null,
): AsyncGenerator<string, void, undefined> {
	if (!reasoningActive) return
	const durationMs = Date.now() - (reasoningStartMs ?? Date.now())
	yield buildReasoningBlockEnd(durationMs)
}

const isReasoningDeltaEvent = (eventType: string): boolean =>
	DOUBAO_REASONING_DELTA_EVENTS.has(eventType)

const buildBaseResponsesParams = (
	options: DoubaoOptions,
	rawApiParams: Record<string, unknown>,
): Record<string, unknown> => {
	const mapped: Record<string, unknown> = { ...rawApiParams }

	if (typeof mapped.max_tokens === 'number' && typeof mapped.max_output_tokens !== 'number') {
		mapped.max_output_tokens = mapped.max_tokens
	}

	delete mapped.max_tokens
	delete mapped.messages
	delete mapped.input
	delete mapped.stream
	delete mapped.model
	delete mapped.enableWebSearch
	delete mapped.webSearchConfig
	delete mapped.imageDetail
	delete mapped.imagePixelLimit
	delete mapped.displayWidth
	delete mapped.size
	delete mapped.response_format
	delete mapped.watermark
	delete mapped.sequential_image_generation
	delete mapped.max_images
	delete mapped.optimize_prompt_mode
	delete mapped.thinkingType
	delete mapped.enableReasoning
	delete mapped.reasoningEffort
	delete mapped.effort
	delete mapped.enableStructuredOutput
	delete mapped.tools
	delete mapped.parallel_tool_calls
	delete mapped.tool_choice
	delete mapped.functions
	delete mapped.function_call

	if (
		options.response_format
		&& typeof options.response_format === 'object'
		&& 'type' in options.response_format
	) {
		mapped.response_format = options.response_format
	}

	if (options.enableStructuredOutput && !mapped.response_format) {
		mapped.response_format = { type: 'json_object' }
	}

	return mapped
}

const buildResponsesTools = (
	rawParamTools: unknown,
	tools: ToolDefinition[],
	options: DoubaoOptions,
): ResponseTool[] => {
	const merged: ResponseTool[] = []
	if (Array.isArray(rawParamTools)) {
		for (const tool of rawParamTools) {
			const normalized = normalizeResponseFunctionTool(tool)
			if (normalized) {
				merged.push(normalized)
			}
		}
	}
	if (tools.length > 0) {
		merged.push(...toResponseFunctionTools(tools))
	}
	if (options.enableWebSearch) {
		merged.push(buildWebSearchTool(options.webSearchConfig))
	}
	return dedupeResponseTools(merged)
}

const buildRequestData = (params: {
	model: string
	input: unknown
	previousResponseId?: string
	baseParams: Record<string, unknown>
	responseTools: ResponseTool[]
	thinkingType: DoubaoThinkingType
	reasoningEffort?: DoubaoReasoningEffort
	includeThinking: boolean
}) => {
	const requestData: Record<string, unknown> = {
		model: params.model,
		stream: true,
		input: params.input,
		...params.baseParams,
	}

	if (params.previousResponseId) {
		requestData.previous_response_id = params.previousResponseId
	}

	const isToolContinuation =
		Array.isArray(params.input)
		&& params.input.every(
			(item) => item && typeof item === 'object' && (item as Record<string, unknown>).type === 'function_call_output',
		)
	if (!isToolContinuation && params.responseTools.length > 0) {
		requestData.tools = params.responseTools
	}

	if (params.includeThinking && params.thinkingType !== 'disabled') {
		requestData.thinking = { type: params.thinkingType }
		if (params.reasoningEffort) {
			requestData.reasoning = { effort: params.reasoningEffort }
		}
	} else {
		delete requestData.thinking
		delete requestData.reasoning
	}

	return requestData
}

const createRequest = async (
	endpoint: string,
	apiKey: string,
	requestData: Record<string, unknown>,
	signal: AbortSignal,
) => {
	return await withRetry(
		async () => {
			const response = await fetch(endpoint, {
				method: 'POST',
				body: JSON.stringify(requestData),
				headers: {
					Authorization: `Bearer ${apiKey}`,
					'Content-Type': 'application/json',
				},
				signal,
			})
			if (!response.ok) {
				const errorText = await response.text()
				throw createDoubaoHTTPError(
					response.status,
					`HTTP error! status: ${response.status}, message: ${errorText}`,
				)
			}
			return response
		},
		{ signal },
	)
}

const streamResponseRound = async function* (
	response: Response,
	showReasoning: boolean,
): AsyncGenerator<string, { completedResponse: unknown }, undefined> {
	const reader = response.body?.pipeThrough(new TextDecoderStream()).getReader()
	if (!reader) {
		throw new Error('Failed to get response reader')
	}

	let sseRest = ''
	let reading = true
	let reasoningActive = false
	let reasoningStartMs: number | null = null
	let completedResponse: unknown = null

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
				const payload = event.json as DoubaoResponseEvent | undefined
				if (!payload) continue

				const eventType = String(payload.type ?? '')
				if (isReasoningDeltaEvent(eventType)) {
					const text = extractString(payload.delta)
					if (!text || !showReasoning) {
						continue
					}
					if (!reasoningActive) {
						reasoningActive = true
						reasoningStartMs = Date.now()
						yield buildReasoningBlockStart(reasoningStartMs)
					}
					yield text
					continue
				}

				if (eventType === 'response.output_text.delta') {
					const text = extractString(payload.delta)
					if (!text) {
						continue
					}
					if (reasoningActive) {
						reasoningActive = false
						yield* closeReasoningBlock(true, reasoningStartMs)
						reasoningStartMs = null
					}
					yield text
					continue
				}

				if (eventType === 'response.completed') {
					completedResponse = payload.response
					if (reasoningActive) {
						reasoningActive = false
						yield* closeReasoningBlock(true, reasoningStartMs)
						reasoningStartMs = null
					}
				}
			}

			if (done) {
				reading = false
			}
		}
	} finally {
		if (reasoningActive) {
			yield* closeReasoningBlock(true, reasoningStartMs)
		}
		await reader.cancel()
	}

	return { completedResponse }
}

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
			if (DOUBAO_UNSUPPORTED_RESPONSES_MODELS.has(model.trim().toLowerCase())) {
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