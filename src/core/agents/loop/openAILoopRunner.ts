import OpenAI from 'openai'
import type { BaseOptions, SendRequest } from 'src/types/provider'
import { REASONING_BLOCK_END_MARKER, REASONING_BLOCK_START_MARKER } from 'src/LLMProviders/utils'
import { DebugLogger } from 'src/utils/DebugLogger'
import { t } from 'src/i18n/ai-runtime/helper'
import type { ToolDefinition } from './types'
import {
	DEFAULT_MAX_TOOL_CALL_LOOPS,
	type OpenAILoopOptions,
	type OpenAIToolDefinition,
	type ToolLoopMessage,
	type ToolNameMapping,
	resolveCurrentTools,
	toOpenAITools,
} from './openAILoopShared'
import {
	type FinalRequestContext,
	runFinalNonStreamingRequest,
	runFinalStreamingRequest,
} from './openAILoopFinalRequest'
import {
	accumulateLegacyFunctionCall,
	accumulateToolCall,
	areAllToolResultsBlocked,
	buildLoopMessages,
	executeToolCalls,
	extractApiParams,
	extractReasoningFromDelta,
	extractTextFromMessageContent,
	finalizeToolCalls,
	sanitizeApiParamsForFinalRequest,
	sanitizeApiParamsForToolLoop,
	shouldFallbackToPlainRequest,
	toOpenAIToolCallsFromMessage,
} from './openAILoopUtils'

type IterationOutcome = 'continue' | 'return' | 'break'

interface IterationContext {
	client: OpenAI
	model: string
	loopMessages: ToolLoopMessage[]
	currentTools: ToolDefinition[]
	transformedTools: OpenAIToolDefinition[]
	toolNameMapping?: ToolNameMapping
	settings: BaseOptions
	controller: AbortController
	apiParamsForToolLoop: Record<string, unknown>
	enableReasoning: boolean
}

const getStringOption = (
	allOptions: Record<string, unknown>,
	optionsExcludingParams: Record<string, unknown>,
	key: string,
): string => {
	const directValue = optionsExcludingParams[key]
	if (typeof directValue === 'string') {
		return directValue
	}
	return typeof allOptions[key] === 'string' ? (allOptions[key] as string) : ''
}

const resolveEnableReasoning = (settings: BaseOptions): boolean => {
	const rawThinkingType = (settings as { thinkingType?: unknown }).thinkingType
	const hasThinkingTypeEnabled =
		typeof rawThinkingType === 'string' && rawThinkingType.toLowerCase() !== 'disabled'
	return (
		(settings as { enableReasoning?: boolean }).enableReasoning === true
		|| (settings as { enableThinking?: boolean }).enableThinking === true
		|| hasThinkingTypeEnabled
	)
}

const createOpenAIClient = (
	allOptions: Record<string, unknown>,
	apiKey: string,
	baseURL: string,
	loopOptions?: OpenAILoopOptions,
): OpenAI => {
	if (loopOptions?.createClient) {
		return loopOptions.createClient(allOptions as Record<string, unknown>) as OpenAI
	}

	let normalizedBaseURL = baseURL
	if (loopOptions?.transformBaseURL) {
		normalizedBaseURL = loopOptions.transformBaseURL(baseURL)
	} else if (normalizedBaseURL.endsWith('/chat/completions')) {
		normalizedBaseURL = normalizedBaseURL.replace(/\/chat\/completions$/, '')
	}

	return new OpenAI({
		apiKey,
		baseURL: normalizedBaseURL,
		dangerouslyAllowBrowser: true,
	})
}

const applyToolTransform = (
	currentTools: ToolDefinition[],
	loopOptions?: OpenAILoopOptions,
): {
	transformedTools: OpenAIToolDefinition[]
	toolNameMapping?: ToolNameMapping
} => {
	const openAITools = currentTools.length > 0 ? toOpenAITools(currentTools) : []
	if (!loopOptions?.transformTools || openAITools.length === 0) {
		return { transformedTools: openAITools }
	}

	const result = loopOptions.transformTools(openAITools)
	return {
		transformedTools: result.tools,
		toolNameMapping: result.mapping,
	}
}

async function* runNonStreamingIteration(
	context: IterationContext,
): AsyncGenerator<string, IterationOutcome, undefined> {
	const completion = await context.client.chat.completions.create(
		{
			model: context.model,
			messages: context.loopMessages as OpenAI.ChatCompletionMessageParam[],
			...(context.transformedTools.length > 0 ? { tools: context.transformedTools } : {}),
			...context.apiParamsForToolLoop,
		},
		{ signal: context.controller.signal },
	)
	const message = completion.choices[0]?.message as unknown as Record<string, unknown> | undefined
	if (!message) return 'return'

	const messageReasoning = extractReasoningFromDelta(message)
	if (messageReasoning?.displayText && context.enableReasoning) {
		const startMs = Date.now()
		yield `${REASONING_BLOCK_START_MARKER}:${startMs}:`
		yield messageReasoning.displayText
		yield `:${REASONING_BLOCK_END_MARKER}:${Date.now() - startMs}:`
	}

	const contentBuffer = extractTextFromMessageContent(message.content)
	const toolCallsResult = toOpenAIToolCallsFromMessage(message.tool_calls)
	if (toolCallsResult.length === 0) {
		if (contentBuffer) {
			yield contentBuffer
		}
		return 'return'
	}

	const assistantMsg: ToolLoopMessage = {
		role: 'assistant',
		content: contentBuffer || null,
		tool_calls: toolCallsResult,
	}
	if (messageReasoning?.reasoningContent) {
		assistantMsg.reasoning_content = messageReasoning.reasoningContent
	} else if (messageReasoning?.displayText) {
		assistantMsg.reasoning_content = messageReasoning.displayText
	}
	if (messageReasoning?.reasoning) {
		assistantMsg.reasoning = messageReasoning.reasoning
	}
	if (messageReasoning?.reasoningDetails !== undefined) {
		assistantMsg.reasoning_details = messageReasoning.reasoningDetails
	}
	context.loopMessages.push(assistantMsg)

	const toolExecutor = context.settings.toolExecutor
	if (!toolExecutor) {
		throw new Error('Tool executor is required for agent loop execution')
	}

	const toolResults = await executeToolCalls(
		toolCallsResult,
		context.currentTools,
		toolExecutor,
		context.controller.signal,
		context.settings.onToolCallResult,
		context.settings.requestToolUserInput,
		context.toolNameMapping,
	)
	for (const [index, call] of toolCallsResult.entries()) {
		const resultContent =
			typeof toolResults[index]?.content === 'string' ? toolResults[index].content : ''
		yield `{{FF_MCP_TOOL_START}}:${call.function.name}:${resultContent}{{FF_MCP_TOOL_END}}:`
	}

	context.loopMessages.push(...toolResults)
	if (areAllToolResultsBlocked(toolResults)) {
		DebugLogger.warn('[AgentLoop] 检测到重复失败的相同工具调用，提前结束工具循环')
		return 'break'
	}

	DebugLogger.debug(
		`[AgentLoop] 已执行 ${toolCallsResult.length} 个工具调用（非流式），继续循环`,
	)
	return 'continue'
}

async function* runStreamingIteration(
	context: IterationContext,
): AsyncGenerator<string, IterationOutcome, undefined> {
	const stream = await context.client.chat.completions.create(
		{
			model: context.model,
			messages: context.loopMessages as OpenAI.ChatCompletionMessageParam[],
			...(context.transformedTools.length > 0 ? { tools: context.transformedTools } : {}),
			stream: true,
			...context.apiParamsForToolLoop,
		},
		{ signal: context.controller.signal },
	)

	let contentBuffer = ''
	let reasoningBuffer = ''
	let reasoningForMessage = ''
	let reasoningContentForMessage = ''
	let reasoningTextForMessage = ''
	const reasoningDetailsForMessage: unknown[] = []
	let reasoningStartMs = 0
	let reasoningActive = false
	let hasToolCalls = false
	const toolCallsMap = new Map<number, { id: string; name: string; args: string }>()

	const closeReasoningBlock = async function* (): AsyncGenerator<string, void, undefined> {
		if (!reasoningActive || reasoningBuffer.length === 0) return
		yield `:${REASONING_BLOCK_END_MARKER}:${Date.now() - reasoningStartMs}:`
		reasoningActive = false
		reasoningForMessage += reasoningBuffer
		reasoningBuffer = ''
	}

	for await (const part of stream) {
		const delta = part.choices[0]?.delta as Record<string, unknown> | undefined
		if (!delta) continue

		const reasoningDelta = extractReasoningFromDelta(delta)
		if (reasoningDelta) {
			if (reasoningDelta.reasoningContent) {
				reasoningContentForMessage += reasoningDelta.reasoningContent
			}
			if (reasoningDelta.reasoning) {
				reasoningTextForMessage += reasoningDelta.reasoning
			}
			if (reasoningDelta.reasoningDetails !== undefined) {
				reasoningDetailsForMessage.push(reasoningDelta.reasoningDetails)
			}

			if (reasoningDelta.displayText && context.enableReasoning) {
				if (!reasoningActive) {
					reasoningActive = true
					reasoningStartMs = Date.now()
					yield `${REASONING_BLOCK_START_MARKER}:${reasoningStartMs}:`
				}
				reasoningBuffer += reasoningDelta.displayText
				yield reasoningDelta.displayText
			}
		}

		const textContent = delta.content as string | undefined
		if (textContent) {
			yield* closeReasoningBlock()
			contentBuffer += textContent
			if (!hasToolCalls) {
				yield textContent
			}
		}

		const deltaToolCalls = delta.tool_calls as
			| Array<{ index: number; id?: string; function?: { name?: string; arguments?: string } }>
			| undefined
		if (deltaToolCalls) {
			yield* closeReasoningBlock()
			hasToolCalls = true
			accumulateToolCall(toolCallsMap, deltaToolCalls)
		}

		const deltaFunctionCall = delta.function_call as
			| { name?: string; arguments?: string }
			| undefined
		if (deltaFunctionCall) {
			yield* closeReasoningBlock()
			hasToolCalls = true
			accumulateLegacyFunctionCall(toolCallsMap, deltaFunctionCall)
		}
	}

	yield* closeReasoningBlock()
	if (!hasToolCalls) {
		return 'return'
	}

	const toolCallsFinal = finalizeToolCalls(toolCallsMap)
	const assistantMsg: ToolLoopMessage = {
		role: 'assistant',
		content: contentBuffer || null,
		tool_calls: toolCallsFinal,
	}
	const normalizedReasoningContent = reasoningContentForMessage || reasoningForMessage
	if (normalizedReasoningContent) {
		assistantMsg.reasoning_content = normalizedReasoningContent
	}
	if (reasoningTextForMessage) {
		assistantMsg.reasoning = reasoningTextForMessage
	}
	if (reasoningDetailsForMessage.length > 0) {
		assistantMsg.reasoning_details =
			reasoningDetailsForMessage.length === 1
				? reasoningDetailsForMessage[0]
				: reasoningDetailsForMessage
	}
	context.loopMessages.push(assistantMsg)

	const toolExecutor = context.settings.toolExecutor
	if (!toolExecutor) {
		throw new Error('Tool executor is required for agent loop execution')
	}

	const toolResults = await executeToolCalls(
		toolCallsFinal,
		context.currentTools,
		toolExecutor,
		context.controller.signal,
		context.settings.onToolCallResult,
		context.settings.requestToolUserInput,
		context.toolNameMapping,
	)
	for (const [index, call] of toolCallsFinal.entries()) {
		const resultContent =
			typeof toolResults[index]?.content === 'string' ? toolResults[index].content : ''
		yield `{{FF_MCP_TOOL_START}}:${call.function.name}:${resultContent}{{FF_MCP_TOOL_END}}:`
	}

	context.loopMessages.push(...toolResults)
	if (areAllToolResultsBlocked(toolResults)) {
		DebugLogger.warn('[AgentLoop] 检测到重复失败的相同工具调用，提前结束工具循环')
		return 'break'
	}

	DebugLogger.debug(`[AgentLoop] 已执行 ${toolCallsFinal.length} 个工具调用，继续循环`)
	return 'continue'
}

export function createOpenAIToolLoopSupportFactory(
	originalFactory: (settings: BaseOptions) => SendRequest,
	loopOptions?: OpenAILoopOptions,
): (settings: BaseOptions) => SendRequest {
	return (settings: BaseOptions): SendRequest => {
		const hasStaticTools = Array.isArray(settings.tools) && settings.tools.length > 0
		const hasDynamicTools = typeof settings.getTools === 'function'
		const { tools, toolExecutor, getTools } = settings
		if ((!hasStaticTools && !hasDynamicTools) || !toolExecutor) {
			return originalFactory(settings)
		}

		return async function* (messages, controller, resolveEmbedAsBinary, saveAttachment) {
			try {
				const { parameters, ...optionsExcludingParams } = settings
				const allOptions = {
					...optionsExcludingParams,
					...(parameters ?? {}),
				} as Record<string, unknown>
				const apiKey = getStringOption(allOptions, optionsExcludingParams, 'apiKey')
				const baseURL = getStringOption(allOptions, optionsExcludingParams, 'baseURL')
				const model = getStringOption(allOptions, optionsExcludingParams, 'model')
				const maxToolCallLoops =
					typeof settings.maxToolCallLoops === 'number' && settings.maxToolCallLoops > 0
						? settings.maxToolCallLoops
						: DEFAULT_MAX_TOOL_CALL_LOOPS
				const enableReasoning = resolveEnableReasoning(settings)
				const preferNonStreamingToolLoop =
					loopOptions?.preferNonStreamingToolLoop === true

				let apiParams = extractApiParams(allOptions)
				if (loopOptions?.transformApiParams) {
					apiParams = loopOptions.transformApiParams(apiParams, allOptions)
				}
				const apiParamsForToolLoop = sanitizeApiParamsForToolLoop(apiParams)
				const apiParamsForFinalRequest = sanitizeApiParamsForFinalRequest(apiParams)
				const client = createOpenAIClient(allOptions, apiKey, baseURL, loopOptions)
				const initialTools = await resolveCurrentTools(tools, getTools)

				DebugLogger.debug(
					`[AgentLoop] 工具调用循环启动: ${initialTools.length} 个工具可用, model=${model}, `
					+ `maxLoops=${maxToolCallLoops}, enableReasoning=${enableReasoning}, `
					+ `preferNonStreamingToolLoop=${preferNonStreamingToolLoop}, `
					+ `apiParams=${JSON.stringify(Object.keys(apiParams))}`,
				)

				const loopMessages = await buildLoopMessages(messages, resolveEmbedAsBinary)

				for (let loop = 0; loop < maxToolCallLoops; loop++) {
					if (controller.signal.aborted) return

					DebugLogger.debug(`[AgentLoop] 工具调用循环 #${loop + 1}`)
					const currentTools = await resolveCurrentTools(tools, getTools)
					const { transformedTools, toolNameMapping } = applyToolTransform(
						currentTools,
						loopOptions,
					)
					const context: IterationContext = {
						client,
						model,
						loopMessages,
						currentTools,
						transformedTools,
						toolNameMapping,
						settings,
						controller,
						apiParamsForToolLoop,
						enableReasoning,
					}

					const outcome = preferNonStreamingToolLoop
						? yield* runNonStreamingIteration(context)
						: yield* runStreamingIteration(context)
					if (outcome === 'return') return
					if (outcome === 'break') break
				}

				DebugLogger.warn(`[AgentLoop] 达到最大工具调用循环次数 (${maxToolCallLoops})`)
				const finalContext: FinalRequestContext = {
					client,
					model,
					loopMessages,
					controller,
					apiParamsForFinalRequest,
					enableReasoning,
				}

				if (preferNonStreamingToolLoop) {
					yield* runFinalNonStreamingRequest(finalContext)
				} else {
					yield* runFinalStreamingRequest(finalContext)
				}
			} catch (err) {
				if (controller.signal.aborted) return

				const errorText = err instanceof Error ? err.message : String(err)
				if (!shouldFallbackToPlainRequest(err)) {
					throw err
				}

				DebugLogger.error(
					`[AgentLoop] 工具调用链路失败，回退普通请求（不带工具）: ${errorText}`,
					err,
				)

				try {
					const { Notice } = await import('obsidian')
					new Notice(
						t('⚠️ Tool call failed, fell back to plain request.\nReason: {reason}').replace('{reason}', errorText.slice(0, 120)),
						8000,
					)
				} catch {
					// Notice 不可用时忽略
				}

				const fallbackSettings: BaseOptions = {
					...settings,
					tools: undefined,
					toolExecutor: undefined,
				}
				const fallbackSendRequest = originalFactory(fallbackSettings)
				for await (const chunk of fallbackSendRequest(
					messages,
					controller,
					resolveEmbedAsBinary,
					saveAttachment,
				)) {
					yield chunk
				}
			}
		}
	}
}
