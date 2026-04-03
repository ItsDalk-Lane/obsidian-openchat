import {
	BUILTIN_SERVER_ID,
	normalizeBuiltinServerId,
} from 'src/tools/runtime/constants';
import type { BuiltinToolsRuntime } from 'src/tools/runtime/BuiltinToolsRuntime';
import { BuiltinToolExecutor } from 'src/tools/runtime/BuiltinToolExecutor';
import type { ResolvedToolRuntime } from 'src/tools/sub-agents/types';
import { SubAgentToolExecutor } from 'src/tools/sub-agents/SubAgentToolExecutor';
import {
	createDelegateSubAgentToolDefinition,
	createDiscoverSubAgentsToolDefinition,
} from 'src/tools/sub-agents/subAgentTools';
import { CompositeToolExecutor } from 'src/core/agents/loop/CompositeToolExecutor';
import type { ToolDefinition, ToolExecutor } from 'src/core/agents/loop/types';
import type { ToolArgumentCompletionContext } from 'src/core/agents/loop/tool-call-argument-completion';
import { McpToolExecutor } from 'src/services/mcp/McpToolExecutor';
import { DebugLogger } from 'src/utils/DebugLogger';
import type { ChatSession } from '../types/chat';
import { resolveToolSurfaceSettings } from './chat-tool-feature-flags';
import { isBuiltinToolEnabledForDefaultSurface } from './chat-tool-feature-flags';
import {
	buildDiscoveryCatalog as buildToolDiscoveryCatalog,
	compileExecutableToolDefinition,
	createBuiltinToolDefinition,
	createMcpToolDefinition,
	createSubAgentDiscoveryTool,
} from './chat-tool-discovery-catalog';
import {
	BUILTIN_FILESYSTEM_ROUTING_HINT,
	BUILTIN_FILESYSTEM_TOOL_NAMES,
	createActualMcpCallTool,
} from './chat-tool-runtime-resolver-support';
import type {
	ChatToolRuntimeResolverOptions,
	ResolveToolRuntimeOptions,
} from './chat-tool-runtime-resolver-types';
import type {
	DiscoveryCatalog,
	DiscoveryCatalogBuildOptions,
} from './chat-tool-selection-types';

export class ChatToolRuntimeResolver {
	private builtinToolsRuntime: BuiltinToolsRuntime | null = null;
	private builtinToolsRuntimePromise: Promise<BuiltinToolsRuntime | null> | null = null;
	private builtinRuntimeSessionId: string | null = null;
	private runtimeClosingPromise: Promise<void> | null = null;

	constructor(private readonly options: ChatToolRuntimeResolverOptions) {}

	private getBuiltinToolSettings() {
		return this.options.settingsAccessor.getAiRuntimeSettings().mcp;
	}

	private getToolSurfaceFlags() {
		return resolveToolSurfaceSettings(this.options.settingsAccessor.getAiRuntimeSettings());
	}

	private resolveRuntimeArgumentContext(
		session?: ChatSession,
	): Omit<ToolArgumentCompletionContext, 'activeFilePath'> | undefined {
		const latestUserMessage = [...(session?.messages ?? [])]
			.reverse()
			.find((message) => message.role === 'user' && !message.metadata?.hiddenFromModel);
		const selectedTextContext = latestUserMessage?.metadata?.selectedTextContext;
		if (!selectedTextContext || typeof selectedTextContext !== 'object') {
			return undefined;
		}
		const filePath = typeof selectedTextContext.filePath === 'string'
			&& selectedTextContext.filePath.trim().length > 0
			? selectedTextContext.filePath.trim()
			: undefined;
		const range = selectedTextContext.range;
		const selectedTextRange = range
			&& typeof range === 'object'
			&& typeof range.from === 'number'
			&& typeof range.to === 'number'
				? {
					from: range.from,
					to: range.to,
					...(typeof range.startLine === 'number' ? { startLine: range.startLine } : {}),
					...(typeof range.endLine === 'number' ? { endLine: range.endLine } : {}),
				}
				: undefined;
		if (!filePath && !selectedTextRange) {
			return undefined;
		}
		return {
			selectedTextFilePath: filePath,
			selectedTextRange,
		};
	}

	private createScopedGetTools(options?: ResolveToolRuntimeOptions) {
		return async () => {
			const nextRuntime = await this.resolveToolRuntime(options);
			return nextRuntime.requestTools;
		};
	}

	private isDefaultVisibleTool(tool: ToolDefinition): boolean {
		return tool.discovery?.discoveryVisibility === 'default';
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
				this.options.executeSkillExecution,
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
		const existingNames = new Set<string>();
		const disabledBuiltinToolNames =
			this.options.settingsAccessor.getAiRuntimeSettings().mcp?.disabledBuiltinToolNames ?? [];
		const toolSurfaceFlags = this.getToolSurfaceFlags();
		const executorOptions = {
			enableRuntimeArgumentCompletion: toolSurfaceFlags.runtimeArgCompletionV2,
			runtimeArgumentContext: this.resolveRuntimeArgumentContext(session),
		};

		let builtinExecutor: BuiltinToolExecutor | null = null;
		let mcpExecutor: McpToolExecutor | null = null;

		const builtinRuntime = await this.ensureBuiltinToolsRuntime(session);
		if (builtinRuntime) {
			const allBuiltinTools = await builtinRuntime.listTools();
			const surfacedBuiltinTools = allBuiltinTools
				.filter((tool) => !disabledBuiltinToolNames.includes(tool.name))
				.filter((tool) => isBuiltinToolEnabledForDefaultSurface(tool.name, toolSurfaceFlags))
				.map((tool) => createBuiltinToolDefinition({
					...tool,
					description: BUILTIN_FILESYSTEM_TOOL_NAMES.has(tool.name)
						? `${BUILTIN_FILESYSTEM_ROUTING_HINT}\n\n${tool.description}`
						: tool.description,
				}, {
					surfaceFlags: toolSurfaceFlags,
				}));
			const filteredBuiltinTools = surfacedBuiltinTools
				.filter((tool) => {
					if (hasExplicitFilters) {
						const matchedByName = options?.explicitToolNames?.includes(tool.name) ?? false;
						const matchedByServer = normalizedExplicitServerIds.includes(BUILTIN_SERVER_ID);
						return matchedByName || matchedByServer;
					}
					return this.isDefaultVisibleTool(tool);
				});

			for (const tool of filteredBuiltinTools) {
				requestTools.push(compileExecutableToolDefinition(tool));
				existingNames.add(tool.name);
			}

			if (filteredBuiltinTools.length > 0) {
				builtinExecutor = new BuiltinToolExecutor(
					builtinRuntime.getRegistry(),
					builtinRuntime.getContext(),
					this.options.planSyncService.createBuiltinCallTool(builtinRuntime, session),
					executorOptions,
				);
			}
		}

		if (mcpManager) {
			const selectedServerIds = options?.explicitMcpServerIds;
			const selectedToolNames = options?.explicitToolNames;
			const scopedServerIds = toolSurfaceFlags.scopedMcpResolve && selectedServerIds && selectedServerIds.length > 0
				? selectedServerIds
				: undefined;
			const serverNameById = new Map(
				mcpManager.getEnabledServerSummaries().map((server) => [server.id, server.name]),
			);
			const allMcpTools = await mcpManager.getToolsForModelContext(
				scopedServerIds ? { serverIds: scopedServerIds } : undefined,
			);
			const filteredMcpTools = hasExplicitFilters
				? allMcpTools.filter((tool) => {
					const matchedByName = selectedToolNames?.includes(tool.name) ?? false;
					const matchedByServer = selectedServerIds?.includes(tool.serverId) ?? false;
					return matchedByName || matchedByServer;
				})
				: [];

			for (const tool of filteredMcpTools) {
				if (existingNames.has(tool.name)) {
					DebugLogger.warn(
						'[ChatService] 检测到同名工具，已跳过外部 MCP 工具并保留 builtin 优先',
						{ toolName: tool.name, serverId: tool.serverId },
					);
					continue;
				}
				existingNames.add(tool.name);
				requestTools.push(compileExecutableToolDefinition(
					createMcpToolDefinition(tool, serverNameById.get(tool.serverId)),
				));
			}

			const mcpCallTool = createActualMcpCallTool(mcpManager);
			if (mcpCallTool) {
				mcpExecutor = new McpToolExecutor(mcpCallTool, executorOptions);
			}

			if (hasExplicitFilters && filteredMcpTools.length === 0) {
				const hasEnabledMcpServer = mcpManager.getSettings().servers.some((server) => server.enabled);
				if (hasEnabledMcpServer) {
					this.options.showMcpNoticeOnce('MCP 已启用，但当前没有可用工具，请检查服务器状态与配置。');
				}
			}
		}

		if (options?.includeSubAgents !== false) {
			const scanResult = await this.options.subAgentScannerService.scan();
			const subAgentTools = [
				createSubAgentDiscoveryTool(createDiscoverSubAgentsToolDefinition()),
				createSubAgentDiscoveryTool(createDelegateSubAgentToolDefinition()),
			].filter((tool) => {
				if (hasExplicitFilters) {
					return options?.explicitToolNames?.includes(tool.name) ?? false;
				}
				return this.isDefaultVisibleTool(tool);
			});
			for (const tool of subAgentTools) {
				if (existingNames.has(tool.name)) {
					DebugLogger.warn('[ChatService] Sub Agent 工具名称冲突，已跳过', {
						toolName: tool.name,
					});
					continue;
				}
				existingNames.add(tool.name);
				requestTools.push(compileExecutableToolDefinition(tool));
			}
			if (scanResult.agents.length > 0) {
				executors.push(new SubAgentToolExecutor(
					this.options.subAgentScannerService,
					this.options.chatServiceAdapter,
					options?.parentSessionId ?? session?.id ?? '',
					options?.subAgentStateCallback ?? (() => {}),
				));
			}
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
			getTools: this.createScopedGetTools(options),
			maxToolCallLoops: this.options.getMaxToolCallLoops(),
		};
	}

	async buildDiscoveryCatalog(options?: DiscoveryCatalogBuildOptions): Promise<DiscoveryCatalog> {
		const session = options?.session ?? this.options.getActiveSession() ?? undefined;
		const builtinRuntime = await this.ensureBuiltinToolsRuntime(session);
		const disabledBuiltinToolNames =
			this.options.settingsAccessor.getAiRuntimeSettings().mcp?.disabledBuiltinToolNames ?? [];
		const toolSurfaceFlags = this.getToolSurfaceFlags();
		const builtinTools = builtinRuntime
			? (await builtinRuntime.listTools())
				.filter((tool) => !disabledBuiltinToolNames.includes(tool.name))
				.filter((tool) => isBuiltinToolEnabledForDefaultSurface(tool.name, toolSurfaceFlags))
				.map((tool) => createBuiltinToolDefinition({
					...tool,
					description: BUILTIN_FILESYSTEM_TOOL_NAMES.has(tool.name)
						? `${BUILTIN_FILESYSTEM_ROUTING_HINT}\n\n${tool.description}`
						: tool.description,
				}, {
					surfaceFlags: toolSurfaceFlags,
				}))
			: [];
		const mcpManager = this.options.runtimeDeps.getMcpClientManager();
		const mcpTools = mcpManager
			? (() => {
				const serverNameById = new Map(
					mcpManager.getEnabledServerSummaries().map((server) => [server.id, server.name]),
				);
				return mcpManager.getToolsForModelContext()
					.then((tools) => tools.map((tool) =>
						createMcpToolDefinition(tool, serverNameById.get(tool.serverId)),
					));
			})()
			: Promise.resolve([]);
		const subAgents = options?.includeSubAgents === false
			? []
			: (await this.options.subAgentScannerService.scan()).agents;
		const subAgentTools = subAgents.length > 0
			? [
				createSubAgentDiscoveryTool(createDiscoverSubAgentsToolDefinition()),
				createSubAgentDiscoveryTool(createDelegateSubAgentToolDefinition()),
			]
			: [];
		return buildToolDiscoveryCatalog({
			tools: [...builtinTools, ...(await mcpTools), ...subAgentTools],
			serverEntries: mcpManager?.getEnabledServerSummaries() ?? [],
			subAgents,
		});
	}

	async getBuiltinToolsForSettings(): Promise<Awaited<ReturnType<BuiltinToolsRuntime['listTools']>>> {
		const runtime = await this.ensureBuiltinToolsRuntime(this.options.getActiveSession());
		if (!runtime) {
			return [];
		}
		const toolSurfaceFlags = this.getToolSurfaceFlags();
		return (await runtime.listTools())
			.filter((tool) => isBuiltinToolEnabledForDefaultSurface(tool.name, toolSurfaceFlags));
	}

	dispose(): void {
		void this.closeBuiltinToolsRuntime();
	}
}
