import OpenAI from 'openai'

import type { BaseOptions, Message, ResolveEmbedAsBinary } from '.'

import { resolveErrorStatus } from './poeUtils'

export interface PoeRetryOptions {
	maxRetries: number
	baseDelayMs: number
	maxDelayMs: number
	jitterRatio: number
}

export interface PoeRequestContext {
	messages: readonly Message[]
	controller: AbortController
	resolveEmbedAsBinary: ResolveEmbedAsBinary
	client: OpenAI
	apiKey: string
	baseURL: string
	model: string
	enableReasoning: boolean
	enableWebSearch: boolean
	responseBaseParams: Record<string, unknown>
	chatFallbackParams: Record<string, unknown>
	responseInput: unknown[]
	hasMcpToolRuntime: boolean
	mcpCallTool?: NonNullable<BaseOptions['mcpCallTool']>
	maxToolCallLoops: number
	retryOptions: PoeRetryOptions
	getCurrentMcpTools: () => Promise<NonNullable<BaseOptions['mcpTools']>>
	getToolCandidates: () => unknown[]
	refreshToolCandidates: () => Promise<unknown[]>
}

export const isFunctionCallOutputInput = (
	value: unknown
): value is Array<{ type: 'function_call_output' }> => {
	if (!Array.isArray(value) || value.length === 0) return false
	return value.every(
		(item) => item && typeof item === 'object' && (item as Record<string, unknown>).type === 'function_call_output'
	)
}

export const shouldRetryFunctionOutputTurn400 = (error: unknown, input: unknown) => {
	if (!isFunctionCallOutputInput(input)) return false
	const status = resolveErrorStatus(error)
	if (status === 400) return true
	const message = (error instanceof Error ? error.message : String(error)).toLowerCase()
	return message.includes('protocol_messages') && message.includes('no messages')
}

export const toToolResultContinuationInput = (input: unknown): unknown => {
	if (!isFunctionCallOutputInput(input)) return input
	const toolResults = input
		.map((item, index) => `Tool result ${index + 1}:\n${String((item as Record<string, unknown>).output ?? '')}`)
		.join('\n\n')
	const continuationText =
		`The tool call has completed. Use the following tool results to continue.\n\n${toolResults}`.trim()
	return [
		{
			role: 'user' as const,
			content: [{ type: 'input_text' as const, text: continuationText }]
		}
	]
}