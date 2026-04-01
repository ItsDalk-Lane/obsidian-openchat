/**
 * @module mcp/runtime/runtime-manager
 * @description 承载外部 MCP 运行时门面，负责连接调度、工具暴露与状态广播。
 *
 * @dependencies src/domains/mcp/types, src/domains/mcp/runtime/health-checker, src/domains/mcp/runtime/process-manager, src/providers/providers.types
 * @side-effects 自动连接已启用服务器、广播运行时状态、通知用户工具调用失败
 * @invariants 不直接依赖 legacy MCP 实现；所有宿主能力通过依赖注入获得。
 */

import type { HttpRequestOptions, HttpResponseData } from 'src/providers/providers.types'
import type {
	McpDomainLogger,
	McpHealthResult,
	McpRuntimeManager,
	McpServerConfig,
	McpServerState,
	McpSettings,
	McpToolQueryScope,
	McpToolDefinition,
	McpToolInfo,
} from '../types'
import { McpHealthChecker } from './health-checker'
import { McpProcessManager } from './process-manager'

const EXTERNAL_CONNECT_RETRY_COOLDOWN_MS = 15_000

export interface McpRuntimeManagerDependencies {
	logger: McpDomainLogger
	notify: (message: string, timeout?: number) => void
	requestHttp: (options: HttpRequestOptions) => Promise<HttpResponseData>
}

interface McpRuntimeManagerInternals {
	createProcessManager?: (
		dependencies: McpRuntimeManagerDependencies,
		onStateChange: (states: McpServerState[]) => void,
	) => McpProcessManager
	createHealthChecker?: (
		processManager: McpProcessManager,
		logger: McpDomainLogger,
	) => McpHealthChecker
}

export class McpRuntimeManagerImpl implements McpRuntimeManager {
	private readonly processManager: McpProcessManager
	private readonly healthChecker: McpHealthChecker
	private readonly externalConnectCooldownUntil = new Map<string, number>()
	private readonly stateListeners: Array<(states: McpServerState[]) => void> = []
	private disposed = false

	constructor(
		private settings: McpSettings,
		private readonly dependencies: McpRuntimeManagerDependencies,
		internals: McpRuntimeManagerInternals = {},
	) {
		this.processManager = internals.createProcessManager
			? internals.createProcessManager(this.dependencies, (states) => this.notifyStateChange(states))
			: new McpProcessManager(this.dependencies, (states) => this.notifyStateChange(states))
		this.healthChecker = internals.createHealthChecker
			? internals.createHealthChecker(this.processManager, this.dependencies.logger)
			: new McpHealthChecker(this.processManager, this.dependencies.logger)
		void this.autoConnectEnabledServers()
	}

	/** @precondition 无 @postcondition 返回当前运行时配置快照 @throws 从不抛出 @example manager.getSettings() */
	getSettings(): McpSettings {
		return this.settings
	}

	/** @precondition settings 为最新运行时配置 @postcondition 服务器连接状态与新配置保持一致 @throws 当连接切换失败时抛出 @example await manager.updateSettings(settings) */
	async updateSettings(settings: McpSettings): Promise<void> {
		const oldSettings = this.settings
		const oldEnabled = this.isMcpEnabled(oldSettings)
		this.settings = settings

		if (!this.isMcpEnabled(settings) && oldEnabled) {
			for (const state of this.processManager.getAllStates()) {
				await this.processManager.disconnect(state.serverId)
			}
			return
		}

		const nextServerIds = new Set(settings.servers.map((server) => server.id))
		for (const state of this.processManager.getAllStates()) {
			const nextConfig = settings.servers.find((server) => server.id === state.serverId)
			if (!nextConfig || !nextConfig.enabled || !nextServerIds.has(state.serverId)) {
				await this.processManager.disconnect(state.serverId)
				this.externalConnectCooldownUntil.delete(state.serverId)
			}
		}

		if (this.isMcpEnabled(settings)) {
			void this.autoConnectEnabledServers()
		}
	}

	/** @precondition MCP 已启用或允许返回空数组 @postcondition 返回所有运行中服务器的工具聚合列表 @throws 从不抛出 @example await manager.getAvailableTools() */
	async getAvailableTools(): Promise<McpToolDefinition[]> {
		if (!this.isMcpEnabled()) {
			return []
		}
		const tools: McpToolDefinition[] = []
		for (const state of this.processManager.getAllStates()) {
			if (state.status !== 'running') {
				continue
			}
			const config = this.settings.servers.find((server) => server.id === state.serverId)
			if (!config?.enabled) {
				continue
			}
			for (const tool of state.tools) {
				tools.push({ ...tool })
			}
		}
		return tools
	}

	/** @precondition MCP 已启用或允许返回空数组 @postcondition 必要时懒启动服务器后返回工具列表 @throws 从不抛出 @example await manager.getAvailableToolsWithLazyStart() */
	async getAvailableToolsWithLazyStart(scope?: McpToolQueryScope): Promise<McpToolDefinition[]> {
		if (!this.isMcpEnabled()) {
			return []
		}
		const scopedServerIds = new Set(scope?.serverIds ?? [])
		const enabledServers = this.settings.servers.filter((server) => {
			if (!server.enabled) {
				return false
			}
			if (scopedServerIds.size === 0) {
				return true
			}
			return scopedServerIds.has(server.id)
		})
		await Promise.allSettled(enabledServers.map(async (server) => {
			const state = this.processManager.getState(server.id)
			if (state?.status === 'running' || state?.status === 'connecting') {
				return
			}
			await this.tryEnsureExternalConnected(server)
		}))
		return await this.getAvailableTools()
	}

	/** @precondition 无 @postcondition 返回适合模型上下文注入的工具定义列表 @throws 从不抛出 @example await manager.getToolsForModelContext() */
	async getToolsForModelContext(scope?: McpToolQueryScope): Promise<McpToolDefinition[]> {
		return await this.getAvailableToolsWithLazyStart(scope)
	}

	/** @precondition serverId 与 toolName 指向已配置工具 @postcondition 委托到底层工具调用实现 @throws 当服务器不存在、已禁用或调用失败时抛出 @example await manager.callTool('server', 'tool', {}) */
	async callTool(serverId: string, toolName: string, args: Record<string, unknown>): Promise<string> {
		return await this.callActualTool(serverId, toolName, args)
	}

	/** @precondition serverId 与 toolName 指向已配置工具 @postcondition 返回工具调用文本结果 @throws 当服务器不存在、已禁用或调用失败时抛出 @example await manager.callActualTool('server', 'tool', {}) */
	async callActualTool(serverId: string, toolName: string, args: Record<string, unknown>): Promise<string> {
		if (!this.isMcpEnabled()) {
			throw new Error('MCP 功能未启用')
		}
		const config = this.settings.servers.find((server) => server.id === serverId)
		if (!config) {
			throw new Error(`MCP 服务器不存在: ${serverId}`)
		}
		if (!config.enabled) {
			throw new Error(`MCP 服务器已禁用: ${config.name}`)
		}
		const client = await this.processManager.ensureConnected(config)
		return await client.callTool(toolName, args)
	}

	/** @precondition serverId 对应已配置服务器 @postcondition 指定服务器已建立连接并清理外部连接冷却状态 @throws 当服务器不存在或连接失败时抛出 @example await manager.connectServer('server') */
	async connectServer(serverId: string): Promise<void> {
		const config = this.requireServer(serverId)
		await this.processManager.ensureConnected(config)
		this.externalConnectCooldownUntil.delete(serverId)
	}

	/** @precondition 无 @postcondition 指定服务器连接被断开 @throws 当断开失败时抛出 @example await manager.disconnectServer('server') */
	async disconnectServer(serverId: string): Promise<void> {
		await this.processManager.disconnect(serverId)
	}

	/** @precondition serverId 可以为空表示检查所有已启用服务器 @postcondition 返回健康检查结果列表 @throws 从不抛出 @example await manager.checkHealth() */
	async checkHealth(serverId?: string): Promise<McpHealthResult[]> {
		const servers = serverId
			? this.settings.servers.filter((server) => server.id === serverId)
			: this.settings.servers.filter((server) => server.enabled)
		return await this.healthChecker.check(servers)
	}

	/** @precondition 无 @postcondition 返回所有已启用服务器的轻量摘要 @throws 从不抛出 @example manager.getEnabledServerSummaries() */
	getEnabledServerSummaries(): Array<{ id: string; name: string }> {
		return this.settings.servers
			.filter((server) => server.enabled)
			.map((server) => ({ id: server.id, name: server.name }))
	}

	/** @precondition 无 @postcondition 返回全部服务器状态快照 @throws 从不抛出 @example manager.getAllStates() */
	getAllStates(): McpServerState[] {
		return this.processManager.getAllStates()
	}

	/** @precondition serverId 为服务器标识 @postcondition 返回该服务器状态或 undefined @throws 从不抛出 @example manager.getState('server') */
	getState(serverId: string): McpServerState | undefined {
		return this.processManager.getState(serverId)
	}

	/** @precondition serverId 为已配置服务器标识 @postcondition 返回该服务器的工具列表，必要时会尝试连接 @throws 从不抛出 @example await manager.getToolsForServer('server') */
	async getToolsForServer(serverId: string): Promise<McpToolInfo[]> {
		if (!this.isMcpEnabled()) {
			return []
		}
		const state = this.processManager.getState(serverId)
		if (state?.status === 'running') {
			return [...state.tools]
		}
		const config = this.settings.servers.find((server) => server.id === serverId)
		if (!config || !config.enabled) {
			return []
		}
		try {
			await this.processManager.ensureConnected(config)
		} catch (error) {
			this.dependencies.logger.warn(`[MCP] 获取服务器工具失败: ${serverId}`, error)
		}
		return this.processManager.getState(serverId)?.tools ?? []
	}

	/** @precondition listener 为幂等状态监听器 @postcondition 返回注销该监听器的函数 @throws 从不抛出 @example const off = manager.onStateChange(listener) */
	onStateChange(listener: (states: McpServerState[]) => void): () => void {
		this.stateListeners.push(listener)
		return () => {
			const index = this.stateListeners.indexOf(listener)
			if (index >= 0) {
				this.stateListeners.splice(index, 1)
			}
		}
	}

	/** @precondition 无 @postcondition 运行时被释放且不再广播状态或维持连接 @throws 当底层 processManager 释放失败时抛出 @example await manager.dispose() */
	async dispose(): Promise<void> {
		this.disposed = true
		this.stateListeners.length = 0
		await this.processManager.dispose()
	}

	private isMcpEnabled(settings: McpSettings = this.settings): boolean {
		return settings.enabled !== false
	}

	private requireServer(serverId: string): McpServerConfig {
		const config = this.settings.servers.find((server) => server.id === serverId)
		if (!config) {
			throw new Error(`MCP 服务器不存在: ${serverId}`)
		}
		return config
	}

	private notifyStateChange(states: McpServerState[]): void {
		for (const listener of this.stateListeners) {
			try {
				listener(states)
			} catch (error) {
				this.dependencies.logger.error('[MCP] 状态监听器执行出错', error)
			}
		}
	}

	private async autoConnectEnabledServers(): Promise<void> {
		if (!this.isMcpEnabled() || this.disposed) {
			return
		}
		const enabledServers = this.settings.servers.filter((server) => server.enabled)
		await Promise.allSettled(enabledServers.map(async (server) => {
			const state = this.processManager.getState(server.id)
			if (state?.status === 'running' || state?.status === 'connecting') {
				return
			}
			await this.tryEnsureExternalConnected(server)
		}))
	}

	private shouldSkipExternalConnect(serverId: string): boolean {
		const blockedUntil = this.externalConnectCooldownUntil.get(serverId)
		return typeof blockedUntil === 'number' && blockedUntil > Date.now()
	}

	private async tryEnsureExternalConnected(server: McpServerConfig): Promise<void> {
		if (this.shouldSkipExternalConnect(server.id)) {
			return
		}
		try {
			await this.processManager.ensureConnected(server)
			this.externalConnectCooldownUntil.delete(server.id)
		} catch (error) {
			this.externalConnectCooldownUntil.set(server.id, Date.now() + EXTERNAL_CONNECT_RETRY_COOLDOWN_MS)
			this.dependencies.logger.error(`[MCP] 自动连接服务器失败: ${server.name}`, error)
		}
	}
}