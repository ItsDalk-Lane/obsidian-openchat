/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-non-null-assertion */

import OpenAI from 'openai'
import { Platform } from 'obsidian'
import { t } from 'src/i18n/ai-runtime/helper'
import { BaseOptions, mergeProviderOptionsWithParameters, Message, ResolveEmbedAsBinary, SendRequest, Vendor } from '.'
import { resolveCurrentMcpTools } from 'src/services/mcp/mcpToolCallHandler'

import {
	runChatCompletionFallback,
	runStreamingChatCompletion,
	runStreamingChatCompletionByFetch
} from './poeChatRunners'
import { normalizeProviderError } from './errors'
import { runMcpHybridToolLoop } from './poeHybridRunner'
import { formatMsgForResponses } from './poeMessageTransforms'
import type { PoeRequestContext } from './poeRunnerShared'
import {
	runResponsesWithDesktopFetchSse,
	runResponsesWithOpenAISdk
} from './poeResponsesRunners'
import {
	runResponsesStreamByFetch,
	runResponsesWithDesktopRequestUrl
} from './poeResponsesRequestRunners'
import { smoothStream, wrapWithThinkTagDetection } from './poeStreaming'
import type { PoeOptions } from './poeTypes'
import {
	mapResponsesParamsToChatParams,
	normalizePoeBaseURL,
	poeMapResponsesParams,
	resolveErrorStatus,
	shouldFallbackToChatCompletions
} from './poeUtils'

export type { PoeOptions } from './poeTypes'
export { normalizePoeBaseURL, poeMapResponsesParams } from './poeUtils'

const DEFAULT_MCP_TOOL_LOOP_LIMIT = 10
const POE_RETRY_OPTIONS = {
	maxRetries: 2,
	baseDelayMs: 250,
	maxDelayMs: 3000,
	jitterRatio: 0.2
} as const

const dedupeTools = (tools: any[]): any[] => {
	const seen = new Set<string>()
	const result: any[] = []

	for (const tool of tools) {
		if (!tool || typeof tool !== 'object') continue
		const type = String((tool as any).type ?? '')
		if (!type) continue

		let key = type
		if (type === 'function') {
			const fnName = String((tool as any).name ?? (tool as any).function?.name ?? '')
			if (!fnName) continue
			key = `function:${fnName}`
		} else {
			key = `${type}:${JSON.stringify(tool)}`
		}

		if (seen.has(key)) continue
		seen.add(key)
		result.push(tool)
	}

	return result
}

const normalizeResponsesFunctionTool = (tool: unknown): any | null => {
	if (!tool || typeof tool !== 'object') return null
	const raw = tool as Record<string, unknown>
	if (raw.type !== 'function') {
		return raw
	}

	const nestedFunction = raw.function && typeof raw.function === 'object'
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
				? raw.parameters
				: (nestedFunction?.parameters && typeof nestedFunction.parameters === 'object')
					? nestedFunction.parameters
					: { type: 'object', properties: {} }
	}
}

const toResponsesFunctionToolsFromMcp = (mcpTools: NonNullable<BaseOptions['mcpTools']>) => {
	return mcpTools.map((tool) => ({
		type: 'function' as const,
		name: tool.name,
		description: tool.description,
		parameters: tool.inputSchema
	}))
}

const mergeResponseTools = (
	apiParamTools: unknown,
	enableWebSearch: boolean,
	mcpTools: BaseOptions['mcpTools']
) => {
	const merged: any[] = []
	if (Array.isArray(apiParamTools)) {
		for (const tool of apiParamTools) {
			const normalized = normalizeResponsesFunctionTool(tool)
			if (normalized) {
				merged.push(normalized)
			}
		}
	}
	if (enableWebSearch) {
		merged.push({ type: 'web_search_preview' })
	}
	if (Array.isArray(mcpTools) && mcpTools.length > 0) {
		merged.push(...toResponsesFunctionToolsFromMcp(mcpTools))
	}
	return dedupeTools(merged)
}

const sendRequestFunc = (settings: PoeOptions): SendRequest =>
	async function* (
		messages: readonly Message[],
		controller: AbortController,
		resolveEmbedAsBinary: ResolveEmbedAsBinary
	) {
		try {
			const options = mergeProviderOptionsWithParameters(settings)
			const {
				apiKey,
				baseURL,
				model,
				enableReasoning = false,
				enableWebSearch = false,
				mcpTools,
				mcpGetTools,
				mcpCallTool,
				mcpMaxToolCallLoops,
				...remains
			} = options

			if (!apiKey) throw new Error(t('API key is required'))
			if (!model) throw new Error(t('Model is required'))

			const hasMcpToolRuntime = (
				(Array.isArray(mcpTools) && mcpTools.length > 0)
				|| typeof mcpGetTools === 'function'
			) && typeof mcpCallTool === 'function'

			const getCurrentMcpTools = async () => {
				return hasMcpToolRuntime
					? await resolveCurrentMcpTools(mcpTools, mcpGetTools)
					: []
			}

			const responseBaseParams = poeMapResponsesParams(remains as Record<string, unknown>)
			const responseApiTools = responseBaseParams.tools
			delete responseBaseParams.tools

			const toolCandidateState = {
				current: mergeResponseTools(
					responseApiTools,
					enableWebSearch,
					hasMcpToolRuntime ? await getCurrentMcpTools() : undefined
				)
			}

			const maxToolCallLoops =
				typeof mcpMaxToolCallLoops === 'number' && mcpMaxToolCallLoops > 0
					? mcpMaxToolCallLoops
					: DEFAULT_MCP_TOOL_LOOP_LIMIT

			const responseInput = await Promise.all(
				messages.map((msg) => formatMsgForResponses(msg, resolveEmbedAsBinary))
			)
			const normalizedBaseURL = normalizePoeBaseURL(String(baseURL ?? ''))
			const client = new OpenAI({
				apiKey: String(apiKey),
				baseURL: normalizedBaseURL,
				dangerouslyAllowBrowser: true
			})

			const refreshToolCandidates = async () => {
				toolCandidateState.current = mergeResponseTools(
					responseApiTools,
					enableWebSearch,
					hasMcpToolRuntime ? await getCurrentMcpTools() : undefined
				)
				return toolCandidateState.current
			}

			const requestContext: PoeRequestContext = {
				messages,
				controller,
				resolveEmbedAsBinary,
				client,
				apiKey: String(apiKey),
				baseURL: normalizedBaseURL,
				model: String(model),
				enableReasoning,
				enableWebSearch,
				responseBaseParams,
				chatFallbackParams: mapResponsesParamsToChatParams(responseBaseParams),
				responseInput,
				hasMcpToolRuntime,
				mcpCallTool,
				maxToolCallLoops,
				retryOptions: POE_RETRY_OPTIONS,
				getCurrentMcpTools,
				getToolCandidates: () => toolCandidateState.current,
				refreshToolCandidates
			}

			try {
				if (hasMcpToolRuntime) {
					yield* smoothStream(
						wrapWithThinkTagDetection(runMcpHybridToolLoop(requestContext), enableReasoning)
					)
					return
				}

				if (!enableReasoning && !enableWebSearch) {
					yield* smoothStream(
						wrapWithThinkTagDetection(
							runStreamingChatCompletionByFetch(requestContext),
							enableReasoning
						)
					)
					return
				}

				yield* smoothStream(
					wrapWithThinkTagDetection(runResponsesStreamByFetch(requestContext), enableReasoning)
				)
				return
			} catch (error) {
				if (hasMcpToolRuntime) {
					if (Platform.isDesktopApp) {
						try {
							yield* smoothStream(
								wrapWithThinkTagDetection(
									runResponsesWithDesktopFetchSse(requestContext),
									enableReasoning
								)
							)
							return
						} catch {
							yield* smoothStream(
								wrapWithThinkTagDetection(
									runResponsesWithDesktopRequestUrl(requestContext),
									enableReasoning
								)
							)
							return
						}
					}
					throw error
				}

				const errorStatus = resolveErrorStatus(error)
				if (errorStatus === 429) {
					throw error
				}

				if (!enableReasoning && !enableWebSearch) {
					try {
						yield* smoothStream(
							wrapWithThinkTagDetection(
								runStreamingChatCompletion(requestContext),
								enableReasoning
							)
						)
						return
					} catch (sdkChatError) {
						if (resolveErrorStatus(sdkChatError) === 429) {
							throw sdkChatError
						}
					}

					try {
						yield* smoothStream(
							wrapWithThinkTagDetection(
								runResponsesWithOpenAISdk(requestContext),
								enableReasoning
							)
						)
						return
					} catch (responsesError) {
						if (resolveErrorStatus(responsesError) === 429) {
							throw responsesError
						}
					}
				} else {
					try {
						yield* smoothStream(
							wrapWithThinkTagDetection(
								runResponsesWithOpenAISdk(requestContext),
								enableReasoning
							)
						)
						return
					} catch (sdkResponsesError) {
						if (resolveErrorStatus(sdkResponsesError) === 429) {
							throw sdkResponsesError
						}
					}
				}

				if (Platform.isDesktopApp) {
					try {
						yield* smoothStream(
							wrapWithThinkTagDetection(
								runResponsesWithDesktopFetchSse(requestContext),
								enableReasoning
							)
						)
						return
					} catch (desktopStreamError) {
						if (resolveErrorStatus(desktopStreamError) === 429) {
							throw desktopStreamError
						}
						try {
							yield* smoothStream(
								wrapWithThinkTagDetection(
									runResponsesWithDesktopRequestUrl(requestContext),
									enableReasoning
								)
							)
							return
						} catch (desktopError) {
							if (resolveErrorStatus(desktopError) === 429) {
								throw desktopError
							}
							if (shouldFallbackToChatCompletions(desktopError)) {
								yield* smoothStream(
									wrapWithThinkTagDetection(
										runChatCompletionFallback(requestContext),
										enableReasoning
									)
								)
								return
							}
							throw desktopError
						}
					}
				}

				if (shouldFallbackToChatCompletions(error)) {
					yield* smoothStream(
						wrapWithThinkTagDetection(runChatCompletionFallback(requestContext), enableReasoning)
					)
					return
				}

				throw error
			}
		} catch (error) {
			const status = resolveErrorStatus(error)
			if (status !== undefined && status >= 500) {
				const detail = error instanceof Error ? error.message : String(error)
				const enriched = new Error(
					`${detail}\nPoe 上游 provider 返回 5xx（临时故障或模型工具链不稳定）。建议切换到 Claude-Sonnet-4.5 或 GPT-5.2 后重试。`
				) as Error & { status?: number }
				enriched.status = status
				throw normalizeProviderError(enriched, 'Poe request failed')
			}
			throw normalizeProviderError(error, 'Poe request failed')
		}
	}

export const poeVendor: Vendor = {
	name: 'Poe',
	defaultOptions: {
		apiKey: '',
		baseURL: 'https://api.poe.com/v1',
		model: 'Claude-Sonnet-4.5',
		enableReasoning: false,
		enableWebSearch: false,
		parameters: {}
	} as PoeOptions,
	sendRequestFunc,
	models: ['Claude-Sonnet-4.5', 'GPT-5.2', 'Gemini-3-Pro', 'Grok-4'],
	websiteToObtainKey: 'https://poe.com/api_key',
	capabilities: ['Text Generation', 'Image Vision', 'Web Search', 'Reasoning']
}
