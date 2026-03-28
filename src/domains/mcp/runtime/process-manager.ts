/**
 * @module mcp/runtime/process-manager
 * @description 管理 MCP 协议客户端实例、连接生命周期与状态快照。
 *
 * @dependencies src/domains/mcp/types, src/domains/mcp/runtime/protocol-client, src/providers/providers.types
 * @side-effects 创建并断开协议客户端、广播状态变化
 * @invariants 一个 serverId 同时只持有一个活动客户端实例。
 */

import type { HttpRequestOptions, HttpResponseData } from 'src/providers/providers.types'
import type { McpDomainLogger, McpServerConfig, McpServerState, McpServerStatus, McpToolInfo } from '../types'
import { McpProtocolClient } from './protocol-client'

export interface McpProcessManagerDependencies {
	logger: McpDomainLogger
	notify: (message: string, timeout?: number) => void
	requestHttp: (options: HttpRequestOptions) => Promise<HttpResponseData>
}

interface McpProcessManagerInternals {
	createProtocolClient?: (
		config: McpServerConfig,
		dependencies: McpProcessManagerDependencies,
		onStatusChange: (status: McpServerStatus, error?: string) => void,
		onToolsChange: (tools: McpToolInfo[]) => void,
	) => McpProtocolClient
}

export class McpProcessManager {
	private readonly clients = new Map<string, McpProtocolClient>()
	private readonly states = new Map<string, McpServerState>()
	private disposed = false

	constructor(
		private readonly dependencies: McpProcessManagerDependencies,
		private readonly onStateChange: (states: McpServerState[]) => void,
		private readonly internals: McpProcessManagerInternals = {},
	) {}

	/** @precondition config 为已启用或待连接服务器配置 @postcondition 返回处于 running 状态的协议客户端 @throws 当管理器已销毁或连接失败时抛出 @example await processManager.ensureConnected(config) */
	async ensureConnected(config: McpServerConfig): Promise<McpProtocolClient> {
		if (this.disposed) {
			throw new Error('McpProcessManager 已销毁')
		}

		const existing = this.clients.get(config.id)
		if (existing && existing.currentStatus === 'running') {
			return existing
		}
		if (existing) {
			try {
				await existing.disconnect()
			} catch (error) {
				this.dependencies.logger.warn(`[MCP] 清理旧客户端失败: ${config.id}`, error)
			}
			this.clients.delete(config.id)
		}

		this.updateState(config.id, { serverId: config.id, status: 'connecting', tools: [] })
		const client = this.internals.createProtocolClient
			? this.internals.createProtocolClient(
				config,
				this.dependencies,
				(status, error) => this.handleStatusChange(config.id, status, error),
				(tools) => this.handleToolsChange(config.id, tools),
			)
			: new McpProtocolClient(
				config,
				this.dependencies,
				(status, error) => this.handleStatusChange(config.id, status, error),
				(tools) => this.handleToolsChange(config.id, tools),
			)
		this.clients.set(config.id, client)
		await client.connect()
		return client
	}

	/** @precondition 无 @postcondition 指定服务器客户端若存在则被断开并移除 @throws 从不抛出 @example await processManager.disconnect('server') */
	async disconnect(serverId: string): Promise<void> {
		const client = this.clients.get(serverId)
		if (!client) {
			return
		}
		try {
			await client.disconnect()
		} catch (error) {
			this.dependencies.logger.warn(`[MCP] 断开连接时出错: ${serverId}`, error)
		}
		this.clients.delete(serverId)
	}

	/** @precondition serverId 为服务器标识 @postcondition 返回当前客户端或 undefined @throws 从不抛出 @example processManager.getClient('server') */
	getClient(serverId: string): McpProtocolClient | undefined {
		return this.clients.get(serverId)
	}

	/** @precondition serverId 为服务器标识 @postcondition 返回对应状态或 undefined @throws 从不抛出 @example processManager.getState('server') */
	getState(serverId: string): McpServerState | undefined {
		return this.states.get(serverId)
	}

	/** @precondition 无 @postcondition 返回全部状态快照 @throws 从不抛出 @example processManager.getAllStates() */
	getAllStates(): McpServerState[] {
		return Array.from(this.states.values())
	}

	/** @precondition 无 @postcondition 所有客户端与状态都被释放 @throws 从不抛出 @example await processManager.dispose() */
	async dispose(): Promise<void> {
		if (this.disposed) {
			return
		}
		this.disposed = true
		const tasks = Array.from(this.clients.keys()).map(async (id) => await this.disconnect(id))
		await Promise.allSettled(tasks)
		this.states.clear()
	}

	private handleStatusChange(serverId: string, status: McpServerStatus, error?: string): void {
		const current = this.states.get(serverId)
		if (!current) {
			return
		}
		this.updateState(serverId, {
			...current,
			status,
			lastError: error,
			pid: this.clients.get(serverId)?.pid,
		})
	}

	private handleToolsChange(serverId: string, tools: McpToolInfo[]): void {
		const current = this.states.get(serverId)
		if (!current) {
			return
		}
		this.updateState(serverId, { ...current, tools })
	}

	private updateState(serverId: string, state: McpServerState): void {
		this.states.set(serverId, state)
		this.onStateChange(this.getAllStates())
	}
}