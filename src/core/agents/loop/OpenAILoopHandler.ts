/**
 * OpenAI 兼容 Provider 的工具调用循环处理器
 *
 * 从 mcpToolCallHandler.ts 中提取的循环逻辑，
 * 使用通用 ToolExecutor 接口替代直接 MCP 调用
 */

import type { BaseOptions, SendRequest } from 'src/types/provider'
import { createOpenAIToolLoopSupportFactory } from './openAILoopRunner'
import type { OpenAILoopOptions } from './openAILoopShared'

export {
	toOpenAITools,
	resolveCurrentTools,
	type OpenAIToolDefinition,
	type OpenAIToolCall,
	type ToolLoopMessage,
	type ContentPart,
	type ToolNameMapping,
	type OpenAILoopOptions,
} from './openAILoopShared'

/**
 * 为 OpenAI 兼容 Provider 注入工具调用循环支持
 *
 * 替代原来的 withOpenAIMcpToolCallSupport，使用通用 ToolExecutor 接口
 */
export function withToolCallLoopSupport(
	originalFactory: (settings: BaseOptions) => SendRequest,
	loopOptions?: OpenAILoopOptions,
): (settings: BaseOptions) => SendRequest {
	return createOpenAIToolLoopSupportFactory(originalFactory, loopOptions)
}
