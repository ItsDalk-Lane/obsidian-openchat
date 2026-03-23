/**
 * MCP 功能总入口（Facade）
 *
 * 统一管理外部 MCP 服务器的懒启动、状态查询、健康检查与工具调用。
 * 内置工具已迁移到 BuiltinToolsRuntime，不再由此类负责。
 */

import { App } from 'obsidian';
import { DebugLogger } from 'src/utils/DebugLogger';
import { McpHealthChecker } from './McpHealthChecker';
import { McpProcessManager } from './McpProcessManager';
import type {
	McpHealthResult,
	McpServerConfig,
	McpServerState,
	McpSettings,
	McpToolDefinition,
	McpToolInfo,
} from './types';

const EXTERNAL_CONNECT_RETRY_COOLDOWN_MS = 15_000;

export class McpClientManager {
	private readonly processManager: McpProcessManager;
	private readonly healthChecker: McpHealthChecker;
	private settings: McpSettings;
	private readonly externalConnectCooldownUntil = new Map<string, number>();
	private disposed = false;
	private stateListeners: Array<(states: McpServerState[]) => void> = [];

	constructor(
		_privateApp: App,
		settings: McpSettings,
	) {
		this.settings = settings;
		this.processManager = new McpProcessManager((states) => this.notifyStateChange(states));
		this.healthChecker = new McpHealthChecker(this.processManager);

		void this.autoConnectEnabledServers();
	}

	getSettings(): McpSettings {
		return this.settings;
	}

	private isMcpEnabled(settings: McpSettings = this.settings): boolean {
		return settings.enabled !== false;
	}

	async updateSettings(settings: McpSettings): Promise<void> {
		const oldSettings = this.settings;
		const oldEnabled = this.isMcpEnabled(oldSettings);
		this.settings = settings;

		if (!this.isMcpEnabled(settings) && oldEnabled) {
			DebugLogger.info('[MCP] MCP 功能已禁用，正在断开所有外部连接...');
			const states = this.processManager.getAllStates();
			for (const state of states) {
				await this.processManager.disconnect(state.serverId);
			}
			return;
		}

		const nextServerIds = new Set(settings.servers.map((server) => server.id));
		const states = this.processManager.getAllStates();
		for (const state of states) {
			const nextConfig = settings.servers.find((server) => server.id === state.serverId);
			if (!nextConfig || !nextConfig.enabled || !nextServerIds.has(state.serverId)) {
				await this.processManager.disconnect(state.serverId);
				this.externalConnectCooldownUntil.delete(state.serverId);
			}
		}

		if (this.isMcpEnabled(settings)) {
			void this.autoConnectEnabledServers();
		}
	}

	async getAvailableTools(): Promise<McpToolDefinition[]> {
		if (!this.isMcpEnabled()) {
			return [];
		}

		const tools: McpToolDefinition[] = [];
		for (const state of this.processManager.getAllStates()) {
			if (state.status !== 'running') {
				continue;
			}

			const config = this.settings.servers.find((server) => server.id === state.serverId);
			if (!config?.enabled) {
				continue;
			}

			for (const tool of state.tools) {
				tools.push({
					name: tool.name,
					title: tool.title,
					description: tool.description,
					inputSchema: tool.inputSchema,
					outputSchema: tool.outputSchema,
					annotations: tool.annotations,
					serverId: tool.serverId,
				});
			}
		}

		return tools;
	}

	async getAvailableToolsWithLazyStart(): Promise<McpToolDefinition[]> {
		if (!this.isMcpEnabled()) {
			return [];
		}

		const enabledServers = this.settings.servers.filter((server) => server.enabled);
		await Promise.allSettled(
			enabledServers.map(async (server) => {
				const state = this.processManager.getState(server.id);
				if (state?.status === 'running' || state?.status === 'connecting') {
					return;
				}
				await this.tryEnsureExternalConnected(server, 'lazy');
			})
		);

		return await this.getAvailableTools();
	}

	async getToolsForModelContext(): Promise<McpToolDefinition[]> {
		if (!this.isMcpEnabled()) {
			return [];
		}
		return await this.getAvailableToolsWithLazyStart();
	}

	async callTool(
		serverId: string,
		toolName: string,
		args: Record<string, unknown>
	): Promise<string> {
		return await this.callActualTool(serverId, toolName, args);
	}

	async callActualTool(
		serverId: string,
		toolName: string,
		args: Record<string, unknown>
	): Promise<string> {
		if (!this.isMcpEnabled()) {
			throw new Error('MCP 功能未启用');
		}

		const config = this.settings.servers.find((server) => server.id === serverId);
		if (!config) {
			throw new Error(`MCP 服务器不存在: ${serverId}`);
		}
		if (!config.enabled) {
			throw new Error(`MCP 服务器已禁用: ${config.name}`);
		}

		const client = await this.processManager.ensureConnected(config);
		return await client.callTool(toolName, args);
	}

	async connectServer(serverId: string): Promise<void> {
		const config = this.settings.servers.find((server) => server.id === serverId);
		if (!config) {
			throw new Error(`MCP 服务器不存在: ${serverId}`);
		}

		await this.processManager.ensureConnected(config);
		this.externalConnectCooldownUntil.delete(serverId);
	}

	async disconnectServer(serverId: string): Promise<void> {
		await this.processManager.disconnect(serverId);
	}

	async checkHealth(serverId?: string): Promise<McpHealthResult[]> {
		const servers = serverId
			? this.settings.servers.filter((server) => server.id === serverId)
			: this.settings.servers.filter((server) => server.enabled);
		return await this.healthChecker.check(servers);
	}

	getEnabledServerSummaries(): Array<{ id: string; name: string }> {
		return this.settings.servers
			.filter((server) => server.enabled)
			.map((server) => ({ id: server.id, name: server.name }));
	}

	getAllStates(): McpServerState[] {
		return this.processManager.getAllStates();
	}

	getState(serverId: string): McpServerState | undefined {
		return this.processManager.getState(serverId);
	}

	async getToolsForServer(serverId: string): Promise<McpToolInfo[]> {
		if (!this.isMcpEnabled()) {
			return [];
		}

		const state = this.processManager.getState(serverId);
		if (state?.status === 'running') {
			return [...state.tools];
		}

		const config = this.settings.servers.find((server) => server.id === serverId);
		if (!config || !config.enabled) {
			return [];
		}

		try {
			await this.processManager.ensureConnected(config);
		} catch (error) {
			DebugLogger.warn(`[MCP] 获取服务器工具失败: ${serverId}`, error);
		}

		return this.processManager.getState(serverId)?.tools ?? [];
	}

	onStateChange(listener: (states: McpServerState[]) => void): () => void {
		this.stateListeners.push(listener);
		return () => {
			const idx = this.stateListeners.indexOf(listener);
			if (idx >= 0) {
				this.stateListeners.splice(idx, 1);
			}
		};
	}

	async dispose(): Promise<void> {
		this.disposed = true;
		this.stateListeners = [];
		await this.processManager.dispose();
	}

	private notifyStateChange(states: McpServerState[]): void {
		for (const listener of this.stateListeners) {
			try {
				listener(states);
			} catch (error) {
				DebugLogger.error('[MCP] 状态监听器执行出错', error);
			}
		}
	}

	private async autoConnectEnabledServers(): Promise<void> {
		if (!this.isMcpEnabled() || this.disposed) {
			return;
		}

		const enabledServers = this.settings.servers.filter((server) => server.enabled);
		if (enabledServers.length === 0) {
			return;
		}

		await Promise.allSettled(
			enabledServers.map(async (server) => {
				const state = this.processManager.getState(server.id);
				if (state?.status === 'running' || state?.status === 'connecting') {
					return;
				}
				await this.tryEnsureExternalConnected(server, 'auto');
			})
		);
	}

	private shouldSkipExternalConnect(serverId: string): boolean {
		const blockedUntil = this.externalConnectCooldownUntil.get(serverId);
		return typeof blockedUntil === 'number' && blockedUntil > Date.now();
	}

	private markExternalConnectFailure(serverId: string): void {
		this.externalConnectCooldownUntil.set(
			serverId,
			Date.now() + EXTERNAL_CONNECT_RETRY_COOLDOWN_MS
		);
	}

	private clearExternalConnectFailure(serverId: string): void {
		this.externalConnectCooldownUntil.delete(serverId);
	}

	private async tryEnsureExternalConnected(
		server: McpServerConfig,
		reason: 'lazy' | 'auto'
	): Promise<void> {
		if (this.shouldSkipExternalConnect(server.id)) {
			DebugLogger.debug(
				`[MCP] 跳过 ${reason === 'lazy' ? '懒启动' : '自动连接'}（冷却中）: ${server.name}`
			);
			return;
		}

		try {
			await this.processManager.ensureConnected(server);
			this.clearExternalConnectFailure(server.id);
		} catch (error) {
			this.markExternalConnectFailure(server.id);
			DebugLogger.error(
				`[MCP] ${reason === 'lazy' ? '懒启动' : '自动连接'}服务器失败: ${server.name}`,
				error
			);
		}
	}
}
