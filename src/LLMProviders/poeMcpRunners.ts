import { t } from 'src/i18n/ai-runtime/helper'
import type {
	ToolDefinition,
	ToolExecutionRecord,
	ToolExecutor,
	ToolUserInputRequest,
	ToolUserInputResponse,
} from 'src/core/agents/loop/types'
import type { OpenAIToolCall } from 'src/services/mcp/mcpToolCallHandler'
import { executeMcpToolCalls } from 'src/services/mcp/mcpToolCallHandler'

import type { PoeFunctionCallItem, PoeToolResultMarker } from './poeTypes'
import type { PoeRequestContext } from './poeRunnerShared'

const mapFunctionCallsToOpenAI = (calls: PoeFunctionCallItem[]): OpenAIToolCall[] => {
	return calls.map((call) => ({
		id: call.id,
		type: 'function',
		function: {
			name: call.name,
			arguments: call.arguments || '{}'
		}
	}))
}

const parseToolArguments = (rawArguments: string): Record<string, unknown> => {
	try {
		const parsed = JSON.parse(rawArguments)
		return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
			? parsed as Record<string, unknown>
			: {}
	} catch {
		return {}
	}
}

const resolveFunctionCallResponseId = (call: PoeFunctionCallItem): string => {
	return call.call_id || call.id
}

export const executePoeMcpToolCalls = async (
	functionCalls: PoeFunctionCallItem[],
	mcpTools: Awaited<ReturnType<PoeRequestContext['getCurrentMcpTools']>>,
	mcpCallTool: NonNullable<PoeRequestContext['mcpCallTool']> | undefined,
	options?: {
		tools?: ToolDefinition[]
		toolExecutor?: ToolExecutor
		abortSignal?: AbortSignal
		onToolCallResult?: (record: ToolExecutionRecord) => void
		requestUserInput?: (
			request: ToolUserInputRequest
		) => Promise<ToolUserInputResponse>
	}
): Promise<{
	nextInputItems: Array<{ type: 'function_call_output'; call_id: string; output: string }>
	markers: PoeToolResultMarker[]
}> => {
	const activeTools = Array.isArray(options?.tools) ? options.tools : []
	const toolExecutor = options?.toolExecutor
	if (toolExecutor && activeTools.length > 0) {
		const nextInputItems: Array<{ type: 'function_call_output'; call_id: string; output: string }> = []
		const markers: PoeToolResultMarker[] = []

		for (const call of functionCalls) {
			const parsedArguments = parseToolArguments(call.arguments)
			try {
				const result = await toolExecutor.execute(
					{
						id: call.id,
						name: call.name,
						arguments: call.arguments || '{}'
					},
					activeTools,
					{
						abortSignal: options?.abortSignal,
						requestUserInput: options?.requestUserInput,
					}
				)
				const outputText = typeof result.content === 'string' ? result.content : String(result.content)
				options?.onToolCallResult?.({
					id: result.toolCallId,
					name: result.name,
					arguments: parsedArguments,
					result: outputText,
					status: 'completed',
					timestamp: Date.now(),
				})
				nextInputItems.push({
					type: 'function_call_output',
					call_id: resolveFunctionCallResponseId(call),
					output: outputText
				})
				markers.push({
					toolName: result.name,
					content: outputText
				})
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error)
				const outputText = t('Tool call failed: {message}').replace('{message}', errorMessage)
				options?.onToolCallResult?.({
					id: call.id,
					name: call.name,
					arguments: parsedArguments,
					result: outputText,
					status: 'failed',
					timestamp: Date.now(),
				})
				nextInputItems.push({
					type: 'function_call_output',
					call_id: resolveFunctionCallResponseId(call),
					output: outputText
				})
				markers.push({
					toolName: call.name,
					content: outputText
				})
			}
		}

		return {
			nextInputItems,
			markers
		}
	}

	if (!mcpCallTool) {
		throw new Error(t('Poe Responses missing tool executor'))
	}

	const openAIToolCalls = mapFunctionCallsToOpenAI(functionCalls)
	const results = await executeMcpToolCalls(openAIToolCalls, mcpTools, mcpCallTool)
	const resultMap = new Map<string, { name?: string; content?: unknown }>()
	for (const result of results) {
		if (!result.tool_call_id) continue
		resultMap.set(result.tool_call_id, {
			name: result.name,
			content: result.content
		})
	}

	const nextInputItems: Array<{ type: 'function_call_output'; call_id: string; output: string }> = []
	const markers: PoeToolResultMarker[] = []

	for (const call of functionCalls) {
		const matched = resultMap.get(call.id)
		const outputText =
			typeof matched?.content === 'string'
				? matched.content
				: matched?.content === undefined || matched?.content === null
					? ''
					: String(matched.content)

		nextInputItems.push({
			type: 'function_call_output',
			call_id: resolveFunctionCallResponseId(call),
			output: outputText
		})
		markers.push({
			toolName: call.name,
			content: outputText
		})
	}

	return {
		nextInputItems,
		markers
	}
}
