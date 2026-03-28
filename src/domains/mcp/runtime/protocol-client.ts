/**
 * @module mcp/runtime/protocol-client
 * @description 管理单个 MCP 服务器的协议握手、工具刷新与工具调用。
 *
 * @dependencies src/domains/mcp/types, src/domains/mcp/runtime/protocol-client-helpers, src/domains/mcp/transport/*
 * @side-effects 建立传输连接、发送 JSON-RPC 请求、通知用户工具调用失败
 * @invariants 同一时间只维护一个活动 transport，并对 pending request 做超时回收。
 */

import { serializeMcpToolResult } from '../internal/tool-result'
import type { McpServerConfig, McpServerStatus, McpToolInfo } from '../types'
import { createMcpTransport, isMcpRemoteTransport } from '../transport/transport-factory'
import type { ITransport, JsonRpcMessage, JsonRpcResponse } from '../transport/transport.types'
import { isJsonRpcNotification, isJsonRpcResponse } from '../transport/transport.types'
import {
	createRetryDelayPromise,
	isBusinessLevelMcpError,
	isRetryableToolCallError,
	MCP_PROTOCOL_VERSION,
	MCP_TOOL_CALL_MAX_RETRIES,
	MCP_TOOL_CALL_RETRY_DELAYS_MS,
	McpJsonRpcError,
	previewProtocolClientArgs,
	shouldReconnectRemoteTransport,
} from './protocol-client-helpers'
import type { McpProtocolClientDependencies, PendingRequest } from './protocol-client.types'

export class McpProtocolClient {
	private transport: ITransport | null = null
	private requestId = 0
	private pendingRequests = new Map<number, PendingRequest>()
	private status: McpServerStatus = 'idle'
	private tools: McpToolInfo[] = []
	private lastToolCallNoticeAt = 0

	constructor(
		private readonly config: McpServerConfig,
		private readonly dependencies: McpProtocolClientDependencies,
		private readonly onStatusChange: (status: McpServerStatus, error?: string) => void,
		private readonly onToolsChange: (tools: McpToolInfo[]) => void,
	) {}

	get currentStatus(): McpServerStatus { return this.status }
	get currentTools(): McpToolInfo[] { return this.tools }
	get pid(): number | undefined { return this.transport?.pid }

	/** @precondition 当前客户端未连接或允许重连 @postcondition 完成握手并刷新工具列表 @throws 当传输层启动或握手失败时抛出 @example await client.connect() */
	async connect(): Promise<void> {
		if (this.status === 'running') return
		this.updateStatus('connecting')
		try {
			this.transport = createMcpTransport(this.config, {
				logger: this.dependencies.logger,
				requestHttp: this.dependencies.requestHttp,
			})
			this.transport.onMessage = (message) => this.handleMessage(message)
			this.transport.onClose = (code) => this.handleClose(code)
			this.transport.onError = (error) => this.handleError(error)
			await this.transport.start()
			const initResult = await this.sendRequest('initialize', {
				protocolVersion: MCP_PROTOCOL_VERSION,
				capabilities: {},
				clientInfo: { name: 'openchat', version: '1.0.0' },
			}) as { serverInfo?: { name: string } }
			this.dependencies.logger.info(
				`[MCP] 服务器握手成功: ${this.config.name}`,
				initResult.serverInfo ? { server: initResult.serverInfo.name } : undefined,
			)
			this.sendNotification('notifications/initialized')
			await this.refreshTools()
			this.updateStatus('running')
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			this.dependencies.logger.error(`[MCP] 连接失败: ${this.config.name}`, error)
			this.dependencies.notify(`MCP 连接失败 (${this.config.name})`, 5000)
			this.updateStatus('error', message)
			throw error
		}
	}

	/** @precondition transport 已连接 @postcondition 返回当前服务器最新工具列表并同步状态回调 @throws 当 tools/list 失败时抛出 @example await client.refreshTools() */
	async refreshTools(): Promise<McpToolInfo[]> {
		const result = await this.sendRequest('tools/list', {}) as {
			tools: Array<{
				name: string
				title?: string
				description?: string
				inputSchema?: Record<string, unknown>
				outputSchema?: Record<string, unknown>
				annotations?: McpToolInfo['annotations']
			}>
		}
		this.tools = (result.tools ?? []).map((tool) => ({
			name: tool.name,
			title: tool.title,
			description: tool.description ?? '',
			inputSchema: tool.inputSchema ?? { type: 'object', properties: {} },
			outputSchema: tool.outputSchema,
			annotations: tool.annotations,
			serverId: this.config.id,
		}))
		this.onToolsChange(this.tools)
		this.dependencies.logger.info(`[MCP] ${this.config.name}: 获取到 ${this.tools.length} 个工具`)
		return this.tools
	}

	/** @precondition transport 已连接 @postcondition 返回工具调用结果文本，必要时执行重试与重连 @throws 当最终调用失败时抛出 @example await client.callTool('tool', {}) */
	async callTool(name: string, args: Record<string, unknown>): Promise<string> {
		let lastError: unknown = null
		for (let attempt = 0; attempt <= MCP_TOOL_CALL_MAX_RETRIES; attempt += 1) {
			try {
				const result = await this.sendRequest('tools/call', {
					name,
					arguments: args,
				}) as {
					content: Array<{ type: string; text?: string; [key: string]: unknown }>
					structuredContent?: Record<string, unknown>
					isError?: boolean
				}
				const text = serializeMcpToolResult(result)
				if (result.isError) {
					this.dependencies.logger.warn(`[MCP] 工具返回业务错误: ${name}: ${text.slice(0, 200)}`)
					return text
				}
				return text
			} catch (error) {
				lastError = error
				if (isBusinessLevelMcpError(error)) {
					const message = error instanceof Error ? error.message : String(error)
					this.dependencies.logger.warn(`[MCP] 工具业务级错误（不重试）: ${name}: ${message}`)
					return `[工具执行错误] ${message}`
				}
				const canRetry = attempt < MCP_TOOL_CALL_MAX_RETRIES && isRetryableToolCallError(error)
				if (!canRetry) {
					this.reportToolCallFailure(name, args, error)
					throw error
				}
				if (this.isRemoteTransport() && shouldReconnectRemoteTransport(error, attempt)) {
					try {
						await this.reconnectForToolCallRetry()
					} catch (reconnectError) {
						this.dependencies.logger.warn('[MCP] tools/call 重连恢复失败，继续按重试策略执行', reconnectError)
					}
				}
				const delay = MCP_TOOL_CALL_RETRY_DELAYS_MS[
					Math.min(attempt, MCP_TOOL_CALL_RETRY_DELAYS_MS.length - 1)
				]
				this.dependencies.logger.warn(
					`[MCP] 工具调用失败，准备重试 (${attempt + 1}/${MCP_TOOL_CALL_MAX_RETRIES}): ${name}`,
					error,
				)
				await createRetryDelayPromise(delay)
			}
		}
		this.reportToolCallFailure(name, args, lastError)
		throw lastError instanceof Error ? lastError : new Error(`MCP 工具调用失败 [${name}]`)
	}

	/** @precondition 无 @postcondition transport 停止、待处理请求被拒绝且状态切换为 stopped @throws 从不抛出 @example await client.disconnect() */
	async disconnect(): Promise<void> {
		if (!this.transport) return
		this.updateStatus('stopping')
		for (const [id, pending] of this.pendingRequests) {
			clearTimeout(pending.timer)
			pending.reject(new Error('MCP 客户端断开连接'))
			this.pendingRequests.delete(id)
		}
		try {
			await this.transport.stop()
		} catch (error) {
			this.dependencies.logger.warn('[MCP] 停止传输层时出错', error)
		}
		this.transport = null
		this.tools = []
		this.updateStatus('stopped')
	}

	private sendRequest(method: string, params?: Record<string, unknown>): Promise<unknown> {
		return new Promise((resolve, reject) => {
			if (!this.transport) {
				reject(new Error('传输层未初始化'))
				return
			}
			const id = ++this.requestId
			const timeout = this.config.timeout || 30000
			const timer = setTimeout(() => {
				this.pendingRequests.delete(id)
				reject(new Error(`MCP 请求超时 (${timeout}ms): ${method}`))
			}, timeout)
			this.pendingRequests.set(id, { resolve, reject, timer })
			const message: JsonRpcMessage = { jsonrpc: '2.0', id, method, ...(params ? { params } : {}) }
			try {
				this.transport.send(message)
			} catch (error) {
				clearTimeout(timer)
				this.pendingRequests.delete(id)
				reject(error instanceof Error ? error : new Error(String(error)))
			}
		})
	}

	private sendNotification(method: string, params?: Record<string, unknown>): void {
		if (!this.transport) return
		try {
			this.transport.send({ jsonrpc: '2.0', method, ...(params ? { params } : {}) })
		} catch (error) {
			this.dependencies.logger.warn(`[MCP] 发送通知失败: ${method}`, error)
		}
	}

	private handleMessage(message: JsonRpcMessage): void {
		if (this.status === 'error') {
			this.updateStatus('running')
		}
		if (isJsonRpcResponse(message)) {
			this.handleResponse(message)
			return
		}
		if (isJsonRpcNotification(message) && message.method === 'notifications/tools/list_changed') {
			void this.refreshTools().catch((error) => this.dependencies.logger.error('[MCP] 刷新工具列表失败', error))
		}
	}

	private handleResponse(response: JsonRpcResponse): void {
		const pending = this.pendingRequests.get(response.id)
		if (!pending) {
			this.dependencies.logger.warn(`[MCP] 收到未知请求 ID 的响应: ${response.id}`)
			return
		}
		clearTimeout(pending.timer)
		this.pendingRequests.delete(response.id)
		if (response.error) {
			pending.reject(new McpJsonRpcError(`MCP error ${response.error.code}: ${response.error.message}`, response.error.code))
			return
		}
		pending.resolve(response.result)
	}

	private handleClose(code: number | null): void {
		if (this.status !== 'stopping' && this.status !== 'stopped') {
			this.updateStatus('error', `MCP 服务器进程意外退出 (code=${code})`)
		}
	}

	private handleError(error: Error): void {
		if (this.status !== 'stopping' && this.status !== 'stopped') {
			this.updateStatus('error', error.message)
		}
	}

	private updateStatus(status: McpServerStatus, error?: string): void {
		this.status = status
		this.onStatusChange(status, error)
	}

	private isRemoteTransport(): boolean { return isMcpRemoteTransport(this.config) }

	private async reconnectForToolCallRetry(): Promise<void> {
		try {
			await this.disconnect()
		} catch (error) {
			this.dependencies.logger.warn('[MCP] 重试前断开连接失败，忽略并继续重连', error)
		}
		await this.connect()
	}

	private reportToolCallFailure(toolName: string, args: Record<string, unknown>, error: unknown): void {
		const message = error instanceof Error ? error.message : String(error)
		const argsPreview = previewProtocolClientArgs(args)
		this.dependencies.logger.error(`[MCP] 工具调用最终失败: ${this.config.name}/${toolName}: ${message}; args=${argsPreview}`)
		const now = Date.now()
		if (now - this.lastToolCallNoticeAt < 10000) return
		this.lastToolCallNoticeAt = now
		this.dependencies.notify(`MCP 工具调用失败 (${this.config.name}/${toolName}): ${message}\nargs: ${argsPreview}`, 7000)
	}
}