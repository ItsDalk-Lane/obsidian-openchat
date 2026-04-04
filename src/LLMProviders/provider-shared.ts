import { EmbedCache } from 'obsidian'
import type { McpToolAnnotations } from 'src/services/mcp/types'
import { stripInternalProviderParameters } from 'src/utils/aiProviderMetadata'
import type {
	ToolDefinition,
	ToolExecutionRecord,
	ToolExecutor,
	ToolUserInputRequest,
	ToolUserInputResponse,
} from 'src/core/agents/loop/types'

export type MsgRole = 'user' | 'assistant' | 'system' | 'tool'

export interface SaveAttachment {
	(fileName: string, data: ArrayBuffer): Promise<void>
}

export interface ResolveEmbedAsBinary {
	(embed: EmbedCache): Promise<ArrayBuffer>
}

export interface CreatePlainText {
	(filePath: string, text: string): Promise<void>
}

export interface Message {
	readonly role: MsgRole
	readonly content: string
	readonly embeds?: EmbedCache[]
	readonly prefix?: boolean
	/** DeepSeek 推理模式下的推理内容（仅用于 assistant 消息） */
	readonly reasoning_content?: string
	readonly tool_calls?: unknown
	readonly tool_call_id?: string
	readonly tool_name?: string
}

export type SendRequest = (
	messages: readonly Message[],
	controller: AbortController,
	resolveEmbedAsBinary: ResolveEmbedAsBinary,
	saveAttachment?: SaveAttachment
) => AsyncGenerator<string, void, unknown>

export type Capability =
	| 'Text Generation'
	| 'Image Vision'
	| 'PDF Vision'
	| 'Image Generation'
	| 'Image Editing'
	| 'Web Search'
	| 'Reasoning'
	| 'Structured Output'

export interface Vendor {
	readonly name: string
	readonly defaultOptions: BaseOptions
	sendRequestFunc(options: BaseOptions): SendRequest
	readonly models: string[]
	readonly websiteToObtainKey: string
	readonly capabilities: Capability[]
}

export interface BaseOptions {
	[key: string]: unknown
	apiKey: string
	baseURL: string
	model: string
	parameters?: Record<string, unknown>
	enableWebSearch?: boolean
	/** 启用结构化输出，自动添加 response_format: { type: 'json_object' } */
	enableStructuredOutput?: boolean
	/** 模型上下文长度（tokens），用于上下文管理 */
	contextLength?: number

	/** 通用工具定义列表（由 ChatService 注入，来源可以是 MCP 或其他工具后端） */
	tools?: ToolDefinition[]
	/** 通用工具执行器（由 ChatService 注入，如 McpToolExecutor） */
	toolExecutor?: ToolExecutor
	/** 工具调用循环最大次数（可选，默认 10） */
	maxToolCallLoops?: number
	/** 工具执行完成后的回调，用于回填结构化 toolCalls */
	onToolCallResult?: (record: ToolExecutionRecord) => void
	/** 工具执行期间向宿主请求用户澄清输入 */
	requestToolUserInput?: (
		request: ToolUserInputRequest
	) => Promise<ToolUserInputResponse>

	/**
	 * @deprecated 使用 tools 代替。保留用于向后兼容过渡期
	 */
	mcpTools?: McpToolDefinitionForProvider[]
	/**
	 * @deprecated 仅保留兼容旧路径；当前运行时会在请求开始前一次性解析快照
	 */
	mcpGetTools?: McpGetToolsFnForProvider
	/**
	 * @deprecated 使用 toolExecutor 代替。保留用于向后兼容过渡期
	 */
	mcpCallTool?: McpCallToolFnForProvider
	/**
	 * @deprecated 使用 maxToolCallLoops 代替。保留用于向后兼容过渡期
	 */
	mcpMaxToolCallLoops?: number
}

/** MCP 工具定义（Provider 使用的精简格式） */
export interface McpToolDefinitionForProvider {
	readonly name: string
	readonly title?: string
	readonly description: string
	readonly inputSchema: Record<string, unknown>
	readonly outputSchema?: Record<string, unknown>
	readonly annotations?: McpToolAnnotations
	readonly serverId: string
}

/** MCP 工具调用函数（Provider 使用） */
export type McpCallToolFnForProvider = (
	serverId: string,
	toolName: string,
	args: Record<string, unknown>,
) => Promise<string>

/** MCP 当前工具集解析函数（Provider 使用） */
export type McpGetToolsFnForProvider = () => Promise<McpToolDefinitionForProvider[]>

export interface ProviderSettings {
	tag: string
	readonly vendor: string
	options: BaseOptions
}

export interface Optional {
	apiSecret: string
	endpoint: string
	apiVersion: string
}

export const mergeProviderOptionsWithParameters = <T extends BaseOptions>(
	settings: T
): T & Record<string, unknown> => {
	const { parameters, ...optionsExcludingParams } = settings as T & { parameters?: Record<string, unknown> }
	return {
		...optionsExcludingParams,
		...stripInternalProviderParameters(parameters)
	} as T & Record<string, unknown>
}
