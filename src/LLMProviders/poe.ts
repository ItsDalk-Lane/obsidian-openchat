import OpenAI from 'openai'
import { resolveCurrentTools } from 'src/core/agents/loop/OpenAILoopHandler'
import type { ToolDefinition } from 'src/core/agents/loop/types'
import { t } from 'src/i18n/ai-runtime/helper'
import {
	BaseOptions,
	mergeProviderOptionsWithParameters,
	Message,
	ResolveEmbedAsBinary,
	SendRequest,
	Vendor,
} from './provider-shared'
import { mcpToolToToolDefinition, McpToolExecutor } from 'src/services/mcp/McpToolExecutor'
import { resolveCurrentMcpTools } from 'src/services/mcp/mcpToolCallHandler'
import { DebugLogger } from 'src/utils/DebugLogger'

import { normalizeProviderError } from './errors'
import { formatMsgForResponses } from './poeMessageTransforms'
import type { PoeRequestContext } from './poeRunnerShared'
import { runResponsesWithOpenAISdk } from './poeResponsesRunners'
import { smoothStream, wrapWithThinkTagDetection } from './poeStreaming'
import type { PoeOptions } from './poeTypes'
import {
	normalizePoeBaseURL,
	poeMapResponsesParams,
	resolveErrorStatus
} from './poeUtils'

type PoeResponseTool = Record<string, unknown>

const DEFAULT_MCP_TOOL_LOOP_LIMIT = 10
const POE_RETRY_OPTIONS = {
	maxRetries: 2,
	baseDelayMs: 250,
	maxDelayMs: 3000,
	jitterRatio: 0.2
} as const

const POE_SDK_BLOCKED_HEADER_PATTERN = /^x-stainless-/i

const dedupeTools = (tools: PoeResponseTool[]): PoeResponseTool[] => {
	const seen = new Set<string>()
	const result: PoeResponseTool[] = []

	for (const tool of tools) {
		if (!tool || typeof tool !== 'object') continue
		const toolRecord = tool as Record<string, unknown>
		const type = String(toolRecord.type ?? '')
		if (!type) continue

		let key = type
		if (type === 'function') {
			const nestedFunction =
				toolRecord.function && typeof toolRecord.function === 'object'
					? (toolRecord.function as Record<string, unknown>)
					: undefined
			const fnName = String(toolRecord.name ?? nestedFunction?.name ?? '')
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

const normalizeResponsesFunctionTool = (tool: unknown): PoeResponseTool | null => {
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
const toResponsesFunctionToolsFromGeneric = (tools: ToolDefinition[]) => {
	return tools.map((tool) => ({
		type: 'function' as const,
		name: tool.name,
		description: tool.description,
		parameters: tool.inputSchema
	}))
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

const resolveLegacyMcpToolsAsGeneric = async (
	mcpTools: BaseOptions['mcpTools'],
	mcpGetTools?: BaseOptions['mcpGetTools']
): Promise<ToolDefinition[]> => {
	const legacyTools = await resolveCurrentMcpTools(mcpTools, mcpGetTools)
	return legacyTools.map(mcpToolToToolDefinition)
}

const resolveActiveTools = async (options: {
	tools?: ToolDefinition[]
	getTools?: BaseOptions['getTools']
	mcpTools?: BaseOptions['mcpTools']
	mcpGetTools?: BaseOptions['mcpGetTools']
}): Promise<ToolDefinition[]> => {
	const [genericTools, legacyMcpTools] = await Promise.all([
		resolveCurrentTools(options.tools, options.getTools),
		resolveLegacyMcpToolsAsGeneric(options.mcpTools, options.mcpGetTools),
	])
	return dedupeToolDefinitions([...genericTools, ...legacyMcpTools])
}

const createPoeBrowserSafeFetch = (stage: string): typeof globalThis.fetch => {
	return async (input, init) => {
		const headers = new Headers(input instanceof Request ? input.headers : undefined)
		if (init?.headers) {
			new Headers(init.headers).forEach((value, key) => {
				headers.set(key, value)
			})
		}

		const strippedHeaders: string[] = []
		const headerKeys: string[] = []
		headers.forEach((_, key) => {
			headerKeys.push(key)
		})
		for (const key of headerKeys) {
			if (POE_SDK_BLOCKED_HEADER_PATTERN.test(key)) {
				strippedHeaders.push(key)
				headers.delete(key)
			}
		}

		if (strippedHeaders.length > 0) {
			DebugLogger.debug(`[Poe][${stage}] 已移除浏览器不兼容请求头`, { strippedHeaders })
		}

		return await globalThis.fetch(input, {
			...init,
			headers,
		})
	}
}

const mergeResponseTools = (
	apiParamTools: unknown,
	enableWebSearch: boolean,
	tools: ToolDefinition[]
) => {
	const merged: PoeResponseTool[] = []
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
	if (tools.length > 0) {
		merged.push(...toResponsesFunctionToolsFromGeneric(tools))
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
				tools,
				toolExecutor,
				maxToolCallLoops,
				getTools,
				onToolCallResult,
				mcpTools,
				mcpGetTools,
				mcpCallTool,
				mcpMaxToolCallLoops,
				...remains
			} = options

			if (!apiKey) throw new Error(t('API key is required'))
			if (!model) throw new Error(t('Model is required'))

			const resolvedToolExecutor = toolExecutor
				?? (typeof mcpCallTool === 'function' ? new McpToolExecutor(mcpCallTool) : undefined)

			const hasToolRuntime = (
				(Array.isArray(tools) && tools.length > 0)
				|| typeof getTools === 'function'
				|| (Array.isArray(mcpTools) && mcpTools.length > 0)
				|| typeof mcpGetTools === 'function'
			) && Boolean(resolvedToolExecutor)

			const getCurrentTools = async () => {
				return hasToolRuntime
					? await resolveActiveTools({ tools, getTools, mcpTools, mcpGetTools })
					: []
			}

			const getCurrentMcpTools = async () => {
				const currentTools = await getCurrentTools()
				return currentTools.map((tool) => ({
					name: tool.name,
					title: tool.title,
					description: tool.description,
					inputSchema: tool.inputSchema,
					outputSchema: tool.outputSchema,
					annotations: tool.annotations,
					serverId: tool.sourceId,
				}))
			}

			const responseBaseParams = poeMapResponsesParams(remains as Record<string, unknown>)
			const responseApiTools = responseBaseParams.tools
			delete responseBaseParams.tools

			const initialTools = await getCurrentTools()
			const toolCandidateState = {
				current: mergeResponseTools(
					responseApiTools,
					enableWebSearch,
					initialTools
				)
			}

			const resolvedMaxToolCallLoops =
				typeof maxToolCallLoops === 'number' && maxToolCallLoops > 0
					? maxToolCallLoops
					:
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
				dangerouslyAllowBrowser: true,
				fetch: createPoeBrowserSafeFetch('responses-sdk')
			})

			const refreshToolCandidates = async () => {
				const currentTools = await getCurrentTools()
				toolCandidateState.current = mergeResponseTools(
					responseApiTools,
					enableWebSearch,
					currentTools
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
				responseInput,
				hasToolRuntime,
				toolExecutor: resolvedToolExecutor,
				onToolCallResult,
				requestToolUserInput: settings.requestToolUserInput,
				mcpCallTool,
				maxToolCallLoops: resolvedMaxToolCallLoops,
				retryOptions: POE_RETRY_OPTIONS,
				getCurrentTools,
				getCurrentMcpTools,
				getToolCandidates: () => toolCandidateState.current,
				refreshToolCandidates
			}

			yield* smoothStream(
				wrapWithThinkTagDetection(runResponsesWithOpenAISdk(requestContext), enableReasoning)
			)
			return
		} catch (error) {
			const status = resolveErrorStatus(error)
			if (status !== undefined && status >= 500) {
				const detail = error instanceof Error ? error.message : String(error)
				const enriched = new Error(
					`${detail}\n${t('Poe upstream provider returned 5xx. Try switching to Claude-Sonnet-4.5 or GPT-5.2 and retry.')}`
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

export type { PoeOptions }

export {
	normalizePoeBaseURL,
	poeMapResponsesParams,
}
