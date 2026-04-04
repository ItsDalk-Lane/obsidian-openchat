/**
 * MCP 工具执行器
 *
 * 实现通用 ToolExecutor 接口，将工具调用委托给 MCP 服务器执行
 * 内部复用 mcpToolCallHandler 的参数校验、归一化、失败追踪等能力
 */

import type {
	ToolExecutor,
	ToolCallRequest,
	ToolCallResult,
	ToolDefinition,
	ToolExecutionOptions,
} from 'src/core/agents/loop/types'
import { completeToolArguments } from 'src/core/agents/loop/tool-call-argument-completion'
import {
	buildToolArgumentParseErrorContext,
	formatToolErrorContext,
} from 'src/core/agents/loop/tool-call-validation'
import type { McpCallToolFnForProvider, McpToolDefinitionForProvider } from 'src/types/provider'
import { executeMcpToolCalls } from './mcpToolCallHandler'
import type { OpenAIToolCall, ToolLoopMessage } from './mcpToolCallHandler'
import { DebugLogger } from 'src/utils/DebugLogger'
import { isToolFailureContent } from './mcpToolCallHandlerInternals'
import type { ToolArgumentCompletionContext } from 'src/core/agents/loop/tool-call-argument-completion'

interface ToolFailureTrackerEntry {
	count: number
	lastContent: string
}

type ToolFailureTracker = Map<string, ToolFailureTrackerEntry>

/**
 * MCP 工具执行器
 *
 * 将通用 ToolExecutor 接口的调用转换为 MCP 协议的工具调用
 */
export class McpToolExecutor implements ToolExecutor {
	private failureTracker: ToolFailureTracker = new Map()
	private readonly enableRuntimeArgumentCompletion: boolean
	private readonly runtimeArgumentContext?: ToolArgumentCompletionContext

	constructor(
		private mcpCallTool: McpCallToolFnForProvider,
		options?: {
			readonly enableRuntimeArgumentCompletion?: boolean
			readonly runtimeArgumentContext?: ToolArgumentCompletionContext
		},
	) {
		this.enableRuntimeArgumentCompletion = options?.enableRuntimeArgumentCompletion ?? true
		this.runtimeArgumentContext = options?.runtimeArgumentContext
	}

	canHandle(call: ToolCallRequest, tools: ToolDefinition[]): boolean {
		return tools.some((tool) =>
			tool.name === call.name
			&& (tool.execution?.kind === 'mcp' || tool.source === 'mcp'),
		)
	}

	async execute(
		call: ToolCallRequest,
		tools: ToolDefinition[],
		_options?: ToolExecutionOptions,
	): Promise<ToolCallResult> {
		const targetTool = tools.find((tool) =>
			tool.name === call.name
			&& (tool.execution?.kind === 'mcp' || tool.source === 'mcp'),
		)
		if (!targetTool) {
			return {
				toolCallId: call.id,
				name: call.name,
				content: '工具调用失败: 未找到 MCP 工具定义',
				status: 'failed',
			}
		}

		let serializedArguments = call.arguments
		if (this.enableRuntimeArgumentCompletion) {
			let parsedArgs: Record<string, unknown>
			try {
				parsedArgs = JSON.parse(call.arguments) as Record<string, unknown>
			} catch (error) {
				const errorContext = buildToolArgumentParseErrorContext(call.name, call.arguments, error)
				return {
					toolCallId: call.id,
					name: call.name,
					content: formatToolErrorContext(errorContext),
					status: 'failed',
					errorContext,
				}
			}

			const completion = completeToolArguments(targetTool, parsedArgs, this.runtimeArgumentContext, {
				enableRuntimeCompletion: true,
			})
			if (completion.notes.length > 0) {
				DebugLogger.debug('[McpToolExecutor] 参数已补全', {
					toolName: call.name,
					notes: completion.notes,
				})
			}
			if (completion.errors.length > 0) {
				return {
					toolCallId: call.id,
					name: call.name,
					content: formatToolErrorContext(completion.errorContext!),
					status: 'failed',
					errorContext: completion.errorContext,
				}
			}
			serializedArguments = JSON.stringify(completion.args)
		}

		const openAIToolCall: OpenAIToolCall = {
			id: call.id,
			type: 'function',
			function: {
				name: call.name,
				arguments: serializedArguments,
			},
		}

		const mcpTools: McpToolDefinitionForProvider[] = tools
			.filter((tool) => tool.execution?.kind === 'mcp' || tool.source === 'mcp')
			.flatMap((tool) => {
				const serverId = tool.execution?.kind === 'mcp'
					? tool.execution.serverId
					: tool.sourceId
				if (!serverId) {
					return []
				}
				return [{
					name: tool.name,
					title: tool.title,
					description: tool.description,
					inputSchema: tool.runtimePolicy?.validationSchema ?? tool.inputSchema,
					outputSchema: tool.outputSchema,
					annotations: tool.annotations,
					serverId,
				}]
			})

		const results: ToolLoopMessage[] = await executeMcpToolCalls(
			[openAIToolCall],
			mcpTools,
			this.mcpCallTool,
			this.failureTracker,
		)

		const result = results[0]
		const content = typeof result?.content === 'string'
			? result.content
			: '工具调用失败: 未收到结果'
		return {
			toolCallId: call.id,
			name: call.name,
			content,
			status: isToolFailureContent(content) ? 'failed' : 'completed',
		}
	}
}

/**
 * 将 MCP 工具定义转换为通用 ToolDefinition 格式
 */
export function mcpToolToToolDefinition(mcpTool: McpToolDefinitionForProvider): ToolDefinition {
	return {
		name: mcpTool.name,
		title: mcpTool.title,
		description: mcpTool.description,
		inputSchema: mcpTool.inputSchema,
		outputSchema: mcpTool.outputSchema,
		annotations: mcpTool.annotations,
		source: 'mcp',
		sourceId: mcpTool.serverId,
		execution: {
			kind: 'mcp',
			serverId: mcpTool.serverId,
		},
	}
}
