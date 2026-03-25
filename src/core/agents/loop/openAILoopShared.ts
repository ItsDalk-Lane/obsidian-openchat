import { DebugLogger } from 'src/utils/DebugLogger'
import type { GetToolsFn, ToolDefinition } from './types'

/** 工具调用循环最大次数（默认值） */
export const DEFAULT_MAX_TOOL_CALL_LOOPS = 10

/** OpenAI 兼容格式的工具定义 */
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

/**
 * 工具名称映射信息
 * 用于将规范化后的工具名称映射回原始名称
 */
export interface ToolNameMapping {
	/** 规范化后的名称 -> 原始名称 */
	normalizedToOriginal: Map<string, string>
}

export interface OpenAILoopOptions {
	transformBaseURL?: (url: string) => string
	createClient?: (allOptions: Record<string, unknown>) => unknown
	preferNonStreamingToolLoop?: boolean
	transformApiParams?: (
		apiParams: Record<string, unknown>,
		allOptions: Record<string, unknown>
	) => Record<string, unknown>
	/**
	 * 转换工具定义，用于处理特定 Provider 的工具名称格式要求
	 * 例如：DeepSeek 要求工具名称只能包含 a-zA-Z0-9_-
	 */
	transformTools?: (
		tools: OpenAIToolDefinition[]
	) => { tools: OpenAIToolDefinition[]; mapping: ToolNameMapping }
}

/** 将工具定义转换为 OpenAI 兼容格式 */
export function toOpenAITools(tools: ToolDefinition[]): OpenAIToolDefinition[] {
	return tools.map((tool) => ({
		type: 'function' as const,
		function: {
			name: tool.name,
			description: tool.description,
			parameters: tool.inputSchema,
		},
	}))
}

/** 解析当前可用工具集（支持动态刷新） */
export async function resolveCurrentTools(
	staticTools: ToolDefinition[] | undefined,
	getTools?: GetToolsFn,
): Promise<ToolDefinition[]> {
	if (typeof getTools === 'function') {
		try {
			const nextTools = await getTools()
			if (Array.isArray(nextTools) && nextTools.length > 0) {
				return nextTools
			}
		} catch (error) {
			DebugLogger.warn('[AgentLoop] 读取动态工具集失败，回退静态工具集', error)
		}
	}

	return Array.isArray(staticTools) ? staticTools : []
}
