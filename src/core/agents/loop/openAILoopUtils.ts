import { DebugLogger } from 'src/utils/DebugLogger'
import type { Message, ResolveEmbedAsBinary } from 'src/types/provider'
import { convertEmbedToImageUrl } from 'src/LLMProviders/utils'
import type {
	ToolCallRequest,
	ToolDefinition,
	ToolExecutionRecord,
	ToolExecutor,
	ToolUserInputRequest,
	ToolUserInputResponse,
} from './types'
import type {
	ContentPart,
	OpenAIToolCall,
	ToolLoopMessage,
	ToolNameMapping,
} from './openAILoopShared'

type ToolCallAccumulator = Map<number, { id: string; name: string; args: string }>

export function accumulateToolCall(
	toolCallsMap: ToolCallAccumulator,
	deltaToolCalls: Array<{ index: number; id?: string; function?: { name?: string; arguments?: string } }>,
): void {
	for (const tc of deltaToolCalls) {
		const existing = toolCallsMap.get(tc.index) ?? { id: '', name: '', args: '' }
		if (tc.id) existing.id = tc.id
		if (tc.function?.name) existing.name += tc.function.name
		if (tc.function?.arguments) existing.args += tc.function.arguments
		toolCallsMap.set(tc.index, existing)
	}
}

export function accumulateLegacyFunctionCall(
	toolCallsMap: ToolCallAccumulator,
	deltaFunctionCall: { name?: string; arguments?: string } | undefined,
): void {
	if (!deltaFunctionCall) return

	const existing = toolCallsMap.get(0) ?? { id: 'call_legacy_0', name: '', args: '' }
	if (deltaFunctionCall.name) existing.name += deltaFunctionCall.name
	if (deltaFunctionCall.arguments) existing.args += deltaFunctionCall.arguments
	toolCallsMap.set(0, existing)
}

export function finalizeToolCalls(
	toolCallsMap: ToolCallAccumulator,
): OpenAIToolCall[] {
	return Array.from(toolCallsMap.values())
		.filter((tc) => typeof tc.name === 'string' && tc.name.trim().length > 0)
		.map((tc, index) => ({
			id: tc.id || `call_fallback_${index}`,
			type: 'function' as const,
			function: { name: tc.name, arguments: tc.args },
		}))
}

export function extractTextFromMessageContent(content: unknown): string {
	if (typeof content === 'string') return content
	if (!Array.isArray(content)) return ''

	const parts: string[] = []
	for (const item of content) {
		if (!item || typeof item !== 'object') continue
		const record = item as Record<string, unknown>
		const directText = typeof record.text === 'string' ? record.text : ''
		if (directText) {
			parts.push(directText)
			continue
		}
		const nestedText =
			record.type === 'text' && typeof record.content === 'string'
				? record.content
				: ''
		if (nestedText) {
			parts.push(nestedText)
		}
	}

	return parts.join('')
}

export function toOpenAIToolCallsFromMessage(messageToolCalls: unknown): OpenAIToolCall[] {
	if (!Array.isArray(messageToolCalls)) return []

	const result: OpenAIToolCall[] = []
	for (const [index, raw] of messageToolCalls.entries()) {
		if (!raw || typeof raw !== 'object') continue
		const tc = raw as {
			id?: unknown
			type?: unknown
			function?: { name?: unknown; arguments?: unknown }
		}
		const name =
			tc.function && typeof tc.function === 'object' && typeof tc.function.name === 'string'
				? tc.function.name
				: ''
		if (!name.trim()) continue
		const rawArgs =
			tc.function && typeof tc.function === 'object'
				? tc.function.arguments
				: undefined
		const args =
			typeof rawArgs === 'string'
				? rawArgs
				: rawArgs === undefined
					? '{}'
					: JSON.stringify(rawArgs)
		result.push({
			id: typeof tc.id === 'string' && tc.id ? tc.id : `call_nonstream_${index}`,
			type: 'function',
			function: {
				name,
				arguments: args,
			},
		})
	}
	return result
}

const REASONING_TEXT_PREFERRED_KEYS = [
	'text',
	'summary',
	'content',
	'reasoning',
	'reasoning_text',
	'summary_text',
	'value',
]

function appendReasoningText(
	value: unknown,
	parts: string[],
	visited: Set<unknown>,
): void {
	if (typeof value === 'string') {
		const text = value.trim()
		if (text) parts.push(text)
		return
	}
	if (!value || typeof value !== 'object') return
	if (visited.has(value)) return
	visited.add(value)

	if (Array.isArray(value)) {
		for (const item of value) {
			appendReasoningText(item, parts, visited)
		}
		return
	}

	const obj = value as Record<string, unknown>
	for (const key of REASONING_TEXT_PREFERRED_KEYS) {
		if (key in obj) {
			appendReasoningText(obj[key], parts, visited)
		}
	}

	for (const [key, child] of Object.entries(obj)) {
		if (REASONING_TEXT_PREFERRED_KEYS.includes(key)) continue
		appendReasoningText(child, parts, visited)
	}
}

function extractReasoningTextFromDetails(reasoningDetails: unknown): string {
	if (reasoningDetails === undefined || reasoningDetails === null) return ''
	const parts: string[] = []
	appendReasoningText(reasoningDetails, parts, new Set())
	if (parts.length === 0) return ''
	const uniqueParts: string[] = []
	const seen = new Set<string>()
	for (const part of parts) {
		if (seen.has(part)) continue
		seen.add(part)
		uniqueParts.push(part)
	}
	return uniqueParts.join('\n')
}

export interface ExtractedReasoningDelta {
	displayText: string
	reasoningContent?: string
	reasoning?: string
	reasoningDetails?: unknown
}

export function extractReasoningFromDelta(
	delta: Record<string, unknown>,
): ExtractedReasoningDelta | null {
	const reasoningContent =
		typeof delta.reasoning_content === 'string' ? delta.reasoning_content : undefined
	const reasoning = typeof delta.reasoning === 'string' ? delta.reasoning : undefined
	const hasReasoningDetails = Object.prototype.hasOwnProperty.call(delta, 'reasoning_details')
	const reasoningDetails = hasReasoningDetails ? delta.reasoning_details : undefined

	const hasAnyReasoningField =
		reasoningContent !== undefined || reasoning !== undefined || hasReasoningDetails
	if (!hasAnyReasoningField) return null

	const preferredReasoningText =
		(typeof reasoningContent === 'string' && reasoningContent.trim())
			|| (typeof reasoning === 'string' && reasoning.trim())
			|| extractReasoningTextFromDetails(reasoningDetails)

	return {
		displayText: preferredReasoningText || '',
		reasoningContent,
		reasoning,
		reasoningDetails,
	}
}

const INTERNAL_OPTION_KEYS = new Set([
	'apiKey', 'baseURL', 'model', 'parameters',
	'apiSecret', 'vendorApiKeys', 'vendorApiKeysByDevice',
	'mcpTools', 'mcpCallTool', 'mcpMaxToolCallLoops', 'mcpGetTools',
	'tools', 'toolExecutor', 'maxToolCallLoops',
	'enableReasoning',
	'reasoningEffort',
	'tag', 'vendor',
])

export function extractApiParams(allOptions: Record<string, unknown>): Record<string, unknown> {
	const apiParams: Record<string, unknown> = {}
	for (const [key, value] of Object.entries(allOptions)) {
		if (INTERNAL_OPTION_KEYS.has(key)) continue
		if (value === undefined || value === null) continue
		if (typeof value === 'function') continue
		if (key.startsWith('__')) continue
		apiParams[key] = value
	}
	return apiParams
}

export function sanitizeApiParamsForToolLoop(
	apiParams: Record<string, unknown>,
): Record<string, unknown> {
	const sanitized: Record<string, unknown> = { ...apiParams }

	delete sanitized.model
	delete sanitized.messages
	delete sanitized.stream
	delete sanitized.tools
	delete sanitized.functions
	delete sanitized.function_call
	delete sanitized.tool_calls

	return sanitized
}

export function sanitizeApiParamsForFinalRequest(
	apiParams: Record<string, unknown>,
): Record<string, unknown> {
	const sanitized = sanitizeApiParamsForToolLoop(apiParams)

	delete sanitized.tool_choice
	delete sanitized.parallel_tool_calls

	return sanitized
}

export async function buildLoopMessages(
	messages: readonly Message[],
	resolveEmbedAsBinary: ResolveEmbedAsBinary,
): Promise<ToolLoopMessage[]> {
	const result: ToolLoopMessage[] = []

	for (const msg of messages) {
		const loopMsg: ToolLoopMessage = {
			role: msg.role,
			content: msg.content,
		}

		if (typeof msg === 'object' && msg !== null && 'reasoning_content' in msg) {
			(loopMsg as { reasoning_content?: string }).reasoning_content =
				(msg as { reasoning_content?: string }).reasoning_content
		}

		if (!msg.embeds || msg.embeds.length === 0) {
			result.push(loopMsg)
			continue
		}

		const contentParts: ContentPart[] = []
		if (msg.content) {
			contentParts.push({ type: 'text', text: msg.content })
		}

		for (const embed of msg.embeds) {
			try {
				const isHttpUrl =
					embed.link.startsWith('http://') || embed.link.startsWith('https://')
				if (isHttpUrl) {
					contentParts.push({ type: 'image_url', image_url: { url: embed.link } })
				} else {
					const imageUrlObj = await convertEmbedToImageUrl(embed, resolveEmbedAsBinary)
					contentParts.push(imageUrlObj)
				}
			} catch (err) {
				DebugLogger.warn(
					`[AgentLoop] 处理嵌入图片失败: ${err instanceof Error ? err.message : String(err)}`
				)
			}
		}

		loopMsg.content = contentParts.length > 0 ? contentParts : msg.content ?? ''
		result.push(loopMsg)
	}

	return result
}

export function areAllToolResultsBlocked(toolResults: ToolLoopMessage[]): boolean {
	return (
		toolResults.length > 0
		&& toolResults.every(
			(result) =>
				typeof result.content === 'string'
				&& result.content.startsWith('工具调用已阻止:'),
		)
	)
}

export function shouldFallbackToPlainRequest(err: unknown): boolean {
	const inspected = new Set<unknown>()
	const texts: string[] = []
	const statuses: number[] = []

	const visit = (value: unknown): void => {
		if (value === null || value === undefined) return
		if (inspected.has(value)) return
		inspected.add(value)

		if (typeof value === 'string') {
			texts.push(value)
			const statusInText = value.match(/\b([45]\d{2})\b/)
			if (statusInText) statuses.push(Number(statusInText[1]))
			return
		}

		if (typeof value === 'number' && Number.isFinite(value)) {
			if (value >= 400 && value <= 599) {
				statuses.push(value)
			}
			return
		}

		if (value instanceof Error) {
			texts.push(value.message)
			const errorLike = value as Error & {
				status?: unknown
				statusCode?: unknown
				code?: unknown
				cause?: unknown
				response?: { status?: unknown; data?: unknown; error?: unknown }
			}
			visit(errorLike.status)
			visit(errorLike.statusCode)
			visit(errorLike.code)
			visit(errorLike.cause)
			visit(errorLike.response?.status)
			visit(errorLike.response?.data)
			visit(errorLike.response?.error)
			return
		}

		if (typeof value === 'object') {
			const obj = value as Record<string, unknown>
			visit(obj.message)
			visit(obj.status)
			visit(obj.statusCode)
			visit(obj.code)
			visit(obj.cause)
			visit(obj.error)
			visit(obj.data)
			visit(obj.response)
		}
	}

	visit(err)
	const mergedText = texts.join(' | ').toLowerCase()
	if (statuses.some((status) => status >= 500 && status <= 599)) return true
	if (
		/(\bapi ?connection ?error\b|\bconnection error\b|\bnetwork error\b|failed to fetch|\bfetch failed\b|socket hang up|econnreset|econnrefused|etimedout|\btimeout\b)/i
			.test(mergedText)
	) {
		return true
	}

	const explicitUnsupportedPatterns = [
		/\btool(s)?\s+(are\s+)?not\s+(supported|available|implemented)\b/i,
		/\bfunction\s+(calling|calls)\s+(is\s+)?not\s+(supported|available|implemented)\b/i,
		/\bdoes\s+not\s+support\s+(tool|function)\s*(calling|calls)?\b/i,
		/\bunsupported\s+(tool|function)\s*(call|type)?\b/i,
		/\bunsupported_parameter\b.*\btool\b/i,
		/\bunknown\s+(tool|function)\s*(type|call)?\b/i,
		/\b(no|zero)\s+(endpoint|server|backend)s?\s+(found|available)?\s*(that\s+)?support(s)?\s*(tool|function)\s*(use|call|usage|calling)?\b/i,
	]

	return explicitUnsupportedPatterns.some((pattern) => pattern.test(mergedText))
}

function getOriginalToolName(
	normalizedName: string,
	mapping: ToolNameMapping | undefined,
): string {
	if (!mapping) return normalizedName
	const originalName = mapping.normalizedToOriginal.get(normalizedName)
	return originalName ?? normalizedName
}

function parseToolArguments(rawArguments: string): Record<string, unknown> {
	try {
		const parsed = JSON.parse(rawArguments)
		return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
			? parsed as Record<string, unknown>
			: {}
	} catch {
		return {}
	}
}

export async function executeToolCalls(
	toolCalls: OpenAIToolCall[],
	tools: ToolDefinition[],
	toolExecutor: ToolExecutor,
	abortSignal?: AbortSignal,
	onToolCallResult?: (record: ToolExecutionRecord) => void,
	requestUserInput?: (
		request: ToolUserInputRequest
	) => Promise<ToolUserInputResponse>,
	toolNameMapping?: ToolNameMapping,
): Promise<ToolLoopMessage[]> {
	return await Promise.all(toolCalls.map(async (call) => {
		const originalName = getOriginalToolName(call.function.name, toolNameMapping)
		const request: ToolCallRequest = {
			id: call.id,
			name: originalName,
			arguments: call.function.arguments,
		}
		const parsedArguments = parseToolArguments(call.function.arguments)

		try {
			const result = await toolExecutor.execute(request, tools, {
				abortSignal,
				requestUserInput,
			})
			const status = result.status ?? (result.errorContext ? 'failed' : 'completed')
			onToolCallResult?.({
				id: result.toolCallId,
				name: result.name,
				arguments: parsedArguments,
				result: result.content,
				status,
				timestamp: Date.now(),
				errorContext: result.errorContext,
			})
			return {
				role: 'tool',
				tool_call_id: result.toolCallId,
				name: result.name,
				content: result.content,
			} as ToolLoopMessage
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : String(err)
			DebugLogger.error(`[AgentLoop] 工具执行失败: ${originalName}`, err)
			const errorContent = `工具调用失败: ${errorMsg}`
			onToolCallResult?.({
				id: call.id,
				name: originalName,
				arguments: parsedArguments,
				result: errorContent,
				status: 'failed',
				timestamp: Date.now(),
			})
			return {
				role: 'tool',
				tool_call_id: call.id,
				name: originalName,
				content: errorContent,
			} as ToolLoopMessage
		}
	}))
}
