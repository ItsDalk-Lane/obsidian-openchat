/**
 * @module mcp/types
 * @description 定义外部 MCP 运行时域的共享类型与运行时接口。
 *
 * @dependencies 无
 * @side-effects 无
 * @invariants 保持为跨域共享契约，不包含具体实现。
 */

/** MCP 服务器连接状态 */
export type McpServerStatus =
	| 'idle'
	| 'connecting'
	| 'running'
	| 'stopping'
	| 'stopped'
	| 'error'

/** MCP 传输类型 */
export type McpTransportType = 'stdio' | 'sse' | 'websocket' | 'http' | 'remote-sse'

/** MCP 服务器配置（由 mcp-servers/*.md 持久化） */
export interface McpServerConfig {
	[key: string]: unknown
	readonly id: string
	name: string
	enabled: boolean
	transportType: McpTransportType
	command?: string
	args?: string[]
	env?: Record<string, string>
	cwd?: string
	url?: string
	headers?: Record<string, string>
	timeout: number
}

/** 运行时状态（不持久化） */
export interface McpServerState {
	readonly serverId: string
	status: McpServerStatus
	tools: McpToolInfo[]
	lastError?: string
	pid?: number
}

/** MCP 工具元数据 */
export interface McpToolAnnotations {
	readonly title?: string
	readonly readOnlyHint?: boolean
	readonly destructiveHint?: boolean
	readonly idempotentHint?: boolean
	readonly openWorldHint?: boolean
}

/** MCP 工具信息（从 tools/list 响应解析） */
export interface McpToolInfo {
	readonly name: string
	readonly title?: string
	readonly description: string
	readonly inputSchema: Record<string, unknown>
	readonly outputSchema?: Record<string, unknown>
	readonly annotations?: McpToolAnnotations
	readonly serverId: string
}

/** 健康检查结果 */
export interface McpHealthResult {
	readonly serverId: string
	readonly serverName: string
	readonly success: boolean
	readonly toolCount: number
	readonly responseTimeMs: number
	readonly error?: string
}

/** MCP 工具定义（传递给 AI Provider 的格式） */
export interface McpToolDefinition {
	readonly name: string
	readonly title?: string
	readonly description: string
	readonly inputSchema: Record<string, unknown>
	readonly outputSchema?: Record<string, unknown>
	readonly annotations?: McpToolAnnotations
	readonly serverId: string
}

export interface McpToolQueryScope {
	readonly serverIds?: string[]
}

/** MCP 工具调用函数签名 */
export type McpCallToolFn = (
	serverId: string,
	toolName: string,
	args: Record<string, unknown>
) => Promise<string>

/** MCP 设置（嵌入 AiRuntimeSettings） */
export interface McpSettings {
	[key: string]: unknown
	servers: McpServerConfig[]
	builtinCoreToolsEnabled?: boolean
	builtinFilesystemEnabled?: boolean
	builtinFetchEnabled?: boolean
	builtinFetchIgnoreRobotsTxt?: boolean
	builtinBingSearchEnabled?: boolean
	builtinTimeDefaultTimezone?: string
	builtinTimeEnabled?: boolean
	disabledBuiltinToolNames?: string[]
	maxToolCallLoops?: number
	enabled?: boolean
}

/** mcp.json 标准配置文件格式（Claude Desktop 兼容） */
export interface McpConfigFile {
	mcpServers: Record<string, {
		type?: string
		url?: string
		command?: string
		args?: unknown[]
		env?: Record<string, unknown>
		headers?: Record<string, unknown>
	}>
}

export interface McpDomainLogger {
	debug(message: string, metadata?: unknown): void
	info(message: string, metadata?: unknown): void
	warn(message: string, metadata?: unknown): void
	error(message: string, metadata?: unknown): void
}

/** 外部 MCP 运行时的最小消费接口 */
export interface McpRuntimeManager {
	getSettings(): McpSettings
	updateSettings(settings: McpSettings): Promise<void>
	getAvailableTools(): Promise<McpToolDefinition[]>
	getAvailableToolsWithLazyStart(scope?: McpToolQueryScope): Promise<McpToolDefinition[]>
	getToolsForModelContext(scope?: McpToolQueryScope): Promise<McpToolDefinition[]>
	callTool(serverId: string, toolName: string, args: Record<string, unknown>): Promise<string>
	callActualTool(serverId: string, toolName: string, args: Record<string, unknown>): Promise<string>
	connectServer(serverId: string): Promise<void>
	disconnectServer(serverId: string): Promise<void>
	checkHealth(serverId?: string): Promise<McpHealthResult[]>
	getEnabledServerSummaries(): Array<{ id: string; name: string }>
	getAllStates(): McpServerState[]
	getState(serverId: string): McpServerState | undefined
	getToolsForServer(serverId: string): Promise<McpToolInfo[]>
	onStateChange(listener: (states: McpServerState[]) => void): () => void
	dispose(): Promise<void> | void
}

/** 外部 MCP 运行时工厂 */
export interface McpRuntimeManagerFactory {
	create(settings: McpSettings): Promise<McpRuntimeManager>
}