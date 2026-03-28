import {
	BUILTIN_SERVER_ID,
	normalizeBuiltinServerId,
} from 'src/tools/runtime/constants';
import {
	type BuiltinToolsRuntime,
} from 'src/tools/runtime/BuiltinToolsRuntime';
import { BuiltinToolExecutor } from 'src/tools/runtime/BuiltinToolExecutor';
import type {
	ResolvedToolRuntime,
	SubAgentStateCallback,
	SubAgentChatServiceAdapter,
} from 'src/tools/sub-agents';
import {
	SubAgentScannerService,
	SubAgentToolExecutor,
	subAgentDefinitionsToTools,
} from 'src/tools/sub-agents';
import { CompositeToolExecutor } from 'src/core/agents/loop/CompositeToolExecutor';
import type { ToolDefinition, ToolExecutor } from 'src/core/agents/loop/types';
import type { McpRuntimeManager } from 'src/domains/mcp/types';
import { McpToolExecutor, mcpToolToToolDefinition } from 'src/services/mcp/McpToolExecutor';
import { DebugLogger } from 'src/utils/DebugLogger';
import type { ChatSession, McpToolMode } from '../types/chat';
import { ChatPlanSyncService } from './chat-plan-sync-service';
import {
	BUILTIN_FILESYSTEM_ROUTING_HINT,
	BUILTIN_FILESYSTEM_TOOL_NAMES,
	createActualMcpCallTool,
	getEnabledChatMcpServers,
} from './chat-tool-runtime-resolver-support';
import type {
	ChatToolRuntimeResolverOptions,
	ResolveToolRuntimeOptions,
} from './chat-tool-runtime-resolver-types';

export class ChatToolRuntimeResolver {
	private builtinToolsRuntime: BuiltinToolsRuntime | null = null;
	private builtinToolsRuntimePromise: Promise<BuiltinToolsRuntime | null> | null = null;
	private builtinRuntimeSessionId: string | null = null;
	private runtimeClosingPromise: Promise<void> | null = null;

	constructor(private readonly options: ChatToolRuntimeResolverOptions) {}

	private getBuiltinToolSettings() {
		return this.options.settingsAccessor.getAiRuntimeSettings().mcp;
	}

	async closeBuiltinToolsRuntime(): Promise<void> {
		if (this.runtimeClosingPromise) {
			await this.runtimeClosingPromise;
			return;
		}

		this.runtimeClosingPromise = (async () => {
		const runtime = this.builtinToolsRuntime;
		this.builtinToolsRuntime = null;
		this.builtinToolsRuntimePromise = null;
		this.builtinRuntimeSessionId = null;
		this.options.planSyncService.detachRuntime();
		if (!runtime) {
			return;
		}
		await runtime.close().catch((error) => {
			DebugLogger.warn('[ChatService] 关闭内置工具运行时失败:', error);
		});
		})();

		try {
			await this.runtimeClosingPromise;
		} finally {
			this.runtimeClosingPromise = null;
		}
	}

	invalidateBuiltinToolsRuntime(): void {
		void this.closeBuiltinToolsRuntime();
	}

	async ensureBuiltinToolsRuntime(session?: ChatSession | null): Promise<BuiltinToolsRuntime | null> {
		if (this.runtimeClosingPromise) {
			await this.runtimeClosingPromise;
		}

		const activeSession = this.options.getActiveSession();
		const targetSessionId = session?.id ?? activeSession?.id ?? '__standalone__';
		if (this.builtinToolsRuntime && this.builtinRuntimeSessionId === targetSessionId) {
			if (activeSession?.id === targetSessionId) {
				this.options.planSyncService.attachRuntime(this.builtinToolsRuntime, activeSession);
			}
			return this.builtinToolsRuntime;
		}

		if (this.builtinToolsRuntimePromise) {
			return await this.builtinToolsRuntimePromise;
		}

		this.builtinToolsRuntimePromise = (async () => {
			await this.closeBuiltinToolsRuntime();
			await this.options.runtimeDeps.ensureSkillsInitialized();
			const runtime = await this.options.createBuiltinToolsRuntime(
				this.getBuiltinToolSettings(),
				this.options.runtimeDeps.getSkillScannerService(),
			);
			this.builtinToolsRuntime = runtime;
			this.builtinRuntimeSessionId = targetSessionId;
			if ((session?.id ?? activeSession?.id) === targetSessionId) {
				this.options.planSyncService.attachRuntime(runtime, session ?? activeSession);
			}
			return runtime;
		})().finally(() => {
			this.builtinToolsRuntimePromise = null;
		});

		return await this.builtinToolsRuntimePromise;
	}

	async resolveToolRuntime(options?: ResolveToolRuntimeOptions): Promise<ResolvedToolRuntime> {
		const requestTools: ToolDefinition[] = [];
		const executors: ToolExecutor[] = [...this.options.runtimeDeps.getCustomToolExecutors()];
		const session = options?.session ?? this.options.getActiveSession() ?? undefined;
		const mcpManager = this.options.runtimeDeps.getMcpClientManager();
		const hasExplicitFilters =
			options?.explicitToolNames !== undefined
			|| options?.explicitMcpServerIds !== undefined;
		const normalizedExplicitServerIds = (options?.explicitMcpServerIds ?? []).map(normalizeBuiltinServerId);
		const normalizedSelectedServerIds = this.options.getMcpSelectedServerIds().map(normalizeBuiltinServerId);
		const existingNames = new Set<string>();
		const disabledBuiltinToolNames =
			this.options.settingsAccessor.getAiRuntimeSettings().mcp?.disabledBuiltinToolNames ?? [];

		let builtinExecutor: BuiltinToolExecutor | null = null;
		let mcpExecutor: McpToolExecutor | null = null;

		if (hasExplicitFilters || this.options.getMcpToolMode() !== 'disabled') {
			const builtinRuntime = await this.ensureBuiltinToolsRuntime(session);
			if (builtinRuntime) {
				const allBuiltinTools = await builtinRuntime.listTools();
				const filteredBuiltinTools = allBuiltinTools
					.filter((tool) => !disabledBuiltinToolNames.includes(tool.name))
					.filter((tool) => {
						if (hasExplicitFilters) {
							const matchedByName = options?.explicitToolNames?.includes(tool.name) ?? false;
							const matchedByServer = normalizedExplicitServerIds.includes(BUILTIN_SERVER_ID);
							return matchedByName || matchedByServer;
						}
						if (this.options.getMcpToolMode() === 'manual') {
							return normalizedSelectedServerIds.includes(BUILTIN_SERVER_ID);
						}
						return true;
					});

				for (const tool of filteredBuiltinTools) {
					const description = BUILTIN_FILESYSTEM_TOOL_NAMES.has(tool.name)
						? `${BUILTIN_FILESYSTEM_ROUTING_HINT}\n\n${tool.description}`
						: tool.description;
					requestTools.push({
						name: tool.name,
						title: tool.title,
						description,
						inputSchema: tool.inputSchema,
						outputSchema: tool.outputSchema,
						annotations: tool.annotations,
						source: 'builtin',
						sourceId: BUILTIN_SERVER_ID,
					});
					existingNames.add(tool.name);
				}

				if (filteredBuiltinTools.length > 0) {
					builtinExecutor = new BuiltinToolExecutor(
						builtinRuntime.getRegistry(),
						builtinRuntime.getContext(),
						this.options.planSyncService.createBuiltinCallTool(builtinRuntime, session),
					);
				}
			}
		}

		if (mcpManager && (hasExplicitFilters || this.options.getMcpToolMode() !== 'disabled')) {
			const allMcpTools = await mcpManager.getToolsForModelContext();
			const selectedServerIds = options?.explicitMcpServerIds;
			const selectedToolNames = options?.explicitToolNames;
			const filteredMcpTools = hasExplicitFilters
				? allMcpTools.filter((tool) => {
					const matchedByName = selectedToolNames?.includes(tool.name) ?? false;
					const matchedByServer = selectedServerIds?.includes(tool.serverId) ?? false;
					return matchedByName || matchedByServer;
				})
				: this.options.getMcpToolMode() === 'manual'
					? allMcpTools.filter((tool) => this.options.getMcpSelectedServerIds().includes(tool.serverId))
					: allMcpTools;

			for (const tool of filteredMcpTools) {
				if (existingNames.has(tool.name)) {
					DebugLogger.warn(
						'[ChatService] 检测到同名工具，已跳过外部 MCP 工具并保留 builtin 优先',
						{ toolName: tool.name, serverId: tool.serverId },
					);
					continue;
				}
				existingNames.add(tool.name);
				requestTools.push(mcpToolToToolDefinition(tool));
			}

			const mcpCallTool = this.createActualMcpCallTool(mcpManager);
			if (mcpCallTool) {
				mcpExecutor = new McpToolExecutor(mcpCallTool);
			}

			if (!hasExplicitFilters && filteredMcpTools.length === 0) {
				const hasEnabledMcpServer = mcpManager.getSettings().servers.some((server) => server.enabled);
				if (hasEnabledMcpServer) {
					this.options.showMcpNoticeOnce('MCP 已启用，但当前没有可用工具，请检查服务器状态与配置。');
				}
			}
		}

		if (options?.includeSubAgents !== false) {
			const scanResult = await this.options.subAgentScannerService.scan();
			for (const tool of subAgentDefinitionsToTools(scanResult.agents)) {
				if (existingNames.has(tool.name)) {
					DebugLogger.warn('[ChatService] Sub Agent 工具名称冲突，已跳过', {
						toolName: tool.name,
					});
					continue;
				}
				existingNames.add(tool.name);
				requestTools.push(tool);
			}
			executors.push(new SubAgentToolExecutor(
				this.options.subAgentScannerService,
				this.options.chatServiceAdapter,
				options?.parentSessionId ?? session?.id ?? '',
				options?.subAgentStateCallback ?? (() => {}),
			));
		}

		if (builtinExecutor) {
			executors.push(builtinExecutor);
		}

		if (mcpExecutor) {
			executors.push(mcpExecutor);
		}

		return {
			requestTools,
			toolExecutor: executors.length > 0 ? new CompositeToolExecutor(executors) : undefined,
			maxToolCallLoops: this.options.getMaxToolCallLoops(),
		};
	}

	getEnabledMcpServers(): Array<{ id: string; name: string }> {
		return getEnabledChatMcpServers(
			this.options.runtimeDeps,
			this.options.runtimeDeps.getMcpClientManager(),
			this.getBuiltinToolSettings(),
		);
	}

	async getBuiltinToolsForSettings(): Promise<Awaited<ReturnType<BuiltinToolsRuntime['listTools']>>> {
		const runtime = await this.ensureBuiltinToolsRuntime(this.options.getActiveSession());
		if (!runtime) {
			return [];
		}
		return await runtime.listTools();
	}

	dispose(): void {
		void this.closeBuiltinToolsRuntime();
	}
}
