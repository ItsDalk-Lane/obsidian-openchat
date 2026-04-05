/**
 * MCP 工具调用处理器
 *
 * 提供 MCP 工具的格式转换、参数校验、执行等能力
 * 循环控制逻辑已迁移至 agent-loop 模块
 */

import { DebugLogger } from 'src/utils/DebugLogger'
import type {
	BaseOptions,
	McpCallToolFnForProvider,
	McpToolDefinitionForProvider,
} from 'src/types/provider'
import { normalizeToolArgs } from './mcpToolArgHelpers'
import {
	buildToolArgumentParseErrorContext,
	buildToolArgumentValidationErrorContext,
	formatToolErrorContext,
} from 'src/core/agents/loop/tool-call-validation'
import {
	type ToolFailureTracker,
	buildToolArgCandidates,
	buildToolFailureSignature,
	getToolFailure,
	buildToolRecoveryHint,
	summarizeSchema,
	safeJsonPreview,
	isToolFailureContent,
	recordToolFailure,
	clearToolFailure,
	isRecoverableServerToolError,
} from './mcpToolCallHandlerInternals'

export interface OpenAIToolDefinition {
	type: 'function'
	function: {
		name: string
		description: string
		parameters: Record<string, unknown>
	}
}

/** OpenAI 工具调用响应 */
export interface OpenAIToolCall {
	id: string
	type: 'function'
	function: {
		name: string
		arguments: string
	}
}

/** 多模态内容项（文本或图片） */
export type ContentPart =
	| { type: 'text'; text: string }
	| { type: 'image_url'; image_url: { url: string } }

/** 工具调用循环中的消息 */
export interface ToolLoopMessage {
	role: 'user' | 'assistant' | 'system' | 'tool'
	content: string | null | ContentPart[]
	tool_calls?: OpenAIToolCall[]
	tool_call_id?: string
	name?: string
	reasoning_content?: string
	reasoning?: string
	reasoning_details?: unknown
}

export function toOpenAITools(mcpTools: McpToolDefinitionForProvider[]): OpenAIToolDefinition[] {
	return mcpTools.map((tool) => ({
		type: 'function' as const,
		function: {
			name: tool.name,
			description: tool.description,
			parameters: tool.inputSchema,
		},
	}))
}

/**
 * 将 MCP 工具转换为 Anthropic Claude 格式
 */
export function toClaudeTools(mcpTools: McpToolDefinitionForProvider[]): Array<{
	name: string
	description: string
	input_schema: Record<string, unknown>
}> {
	return mcpTools.map((tool) => ({
		name: tool.name,
		description: tool.description,
		input_schema: tool.inputSchema,
	}))
}

/**
 * @deprecated 使用 agent-loop 的 resolveCurrentTools 代替
 */
export async function resolveCurrentMcpTools(
	mcpTools: BaseOptions['mcpTools'],
	mcpGetTools?: BaseOptions['mcpGetTools'],
): Promise<McpToolDefinitionForProvider[]> {
	if (typeof mcpGetTools === 'function') {
		try {
			const nextTools = await mcpGetTools()
			if (Array.isArray(nextTools) && nextTools.length > 0) {
				return nextTools
			}
		} catch (error) {
			DebugLogger.warn('[MCP] 读取动态工具集失败，回退静态工具集', error)
		}
	}

	return Array.isArray(mcpTools) ? mcpTools : []
}

/**
 * 执行 MCP 工具调用并返回结果
 */
export async function executeMcpToolCalls(
	toolCalls: OpenAIToolCall[],
	mcpTools: McpToolDefinitionForProvider[],
	mcpCallTool: McpCallToolFnForProvider,
	failureTracker?: ToolFailureTracker,
): Promise<ToolLoopMessage[]> {
	const results: ToolLoopMessage[] = []

	for (const call of toolCalls) {
		const toolName = call.function.name
		const toolDef = mcpTools.find((t) => t.name === toolName)
		const serverId = toolDef?.serverId

		if (!serverId) {
			DebugLogger.warn(`[MCP] 未找到工具 "${toolName}" 对应的 MCP 服务器`)
			results.push({
				role: 'tool',
				tool_call_id: call.id,
				name: toolName,
				content: `错误: 未找到工具 "${toolName}"`,
			})
			continue
		}

		let args: Record<string, unknown>
		try {
			const parsed = JSON.parse(call.function.arguments || '{}') as unknown
			if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
				throw new Error('参数必须是 JSON 对象')
			}
			args = parsed as Record<string, unknown>
		} catch (err) {
			const errorContext = buildToolArgumentParseErrorContext(
				toolName,
				call.function.arguments || '{}',
				err,
			)
			DebugLogger.warn(`[MCP] 工具参数解析失败: ${toolName}`, err)
			results.push({
				role: 'tool',
				tool_call_id: call.id,
				name: toolName,
				content: formatToolErrorContext(errorContext),
			})
			continue
		}

		const normalized = normalizeToolArgs(toolName, toolDef?.inputSchema, args)
		args = normalized.args
		if (normalized.notes.length > 0) {
			DebugLogger.warn(`[MCP] 工具参数已自动修正: ${toolName}`, normalized.notes)
		}
		const failureSignature = buildToolFailureSignature(toolName, args)
		const previousFailure = getToolFailure(failureTracker, failureSignature)
		if (previousFailure) {
			const recoveryHint = buildToolRecoveryHint(toolName)
			results.push({
				role: 'tool',
				tool_call_id: call.id,
				name: toolName,
				content:
					`工具调用已阻止: 相同参数已失败 ${previousFailure.count} 次。` +
					`请不要继续使用同一组参数重试。最近错误=${previousFailure.lastContent}。${recoveryHint}`,
			})
			continue
		}

		const validationContext = buildToolArgumentValidationErrorContext({
			name: toolName,
			inputSchema: toolDef?.inputSchema ?? {},
		}, args, {
			notes: normalized.notes,
			argsPreview: safeJsonPreview(args),
			schemaSummary: summarizeSchema(toolDef?.inputSchema),
		})
		if (validationContext.issues.length > 0) {
			DebugLogger.warn(`[MCP] 工具参数校验失败: ${toolName}: ${validationContext.summary}`)
			const failureContent = formatToolErrorContext(validationContext)
			recordToolFailure(failureTracker, failureSignature, failureContent)
			results.push({
				role: 'tool',
				tool_call_id: call.id,
				name: toolName,
				content: failureContent,
			})
			continue
		}

		const argCandidates = buildToolArgCandidates(toolName, toolDef?.inputSchema, args)
		let callSucceeded = false
		let lastError: unknown = null
		let lastTriedArgs: Record<string, unknown> = args

		for (let i = 0; i < argCandidates.length; i++) {
			const candidateArgs = argCandidates[i]
			lastTriedArgs = candidateArgs

			try {
				if (i > 0) {
					DebugLogger.warn(
						`[MCP] 正在尝试参数候选 (${i + 1}/${argCandidates.length}): ${toolName}`,
						candidateArgs,
					)
				} else {
					DebugLogger.debug(`[MCP] 执行工具调用: ${toolName}`, candidateArgs)
				}

				const result = await mcpCallTool(serverId, toolName, candidateArgs)
				if (typeof result === 'string' && isToolFailureContent(result)) {
					recordToolFailure(failureTracker, failureSignature, result)
				} else {
					clearToolFailure(failureTracker, failureSignature)
				}
				results.push({
					role: 'tool',
					tool_call_id: call.id,
					name: toolName,
					content: result,
				})
				callSucceeded = true
				break
			} catch (err) {
				lastError = err
				DebugLogger.error(`[MCP] 工具调用失败: ${toolName}`, err)

				const canTryNextCandidate =
					i < argCandidates.length - 1 && isRecoverableServerToolError(err)
				if (!canTryNextCandidate) {
					break
				}
			}
		}

		if (!callSucceeded) {
			const errorMsg = lastError instanceof Error ? lastError.message : String(lastError)
			const recoveryHint = buildToolRecoveryHint(toolName)
			const failureContent =
				`工具调用失败: ${errorMsg}。最后参数=${safeJsonPreview(lastTriedArgs)}。` +
				`参数约束=${summarizeSchema(toolDef?.inputSchema)}。${recoveryHint}`
			recordToolFailure(failureTracker, failureSignature, failureContent)
			results.push({
				role: 'tool',
				tool_call_id: call.id,
				name: toolName,
				content: failureContent,
			})
		}
	}

	return results
}

