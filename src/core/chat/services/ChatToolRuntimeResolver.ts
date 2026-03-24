import {
	BUILTIN_SERVER_ID,
	BUILTIN_SERVER_NAME,
	normalizeBuiltinServerId,
} from 'src/tools/runtime/constants';
import {
	createBuiltinToolsRuntime,
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
import type { McpClientManager } from 'src/services/mcp';
import { McpToolExecutor, mcpToolToToolDefinition } from 'src/services/mcp/McpToolExecutor';
import { DebugLogger } from 'src/utils/DebugLogger';
import type OpenChatPlugin from 'src/main';
import type { ChatRuntimeDeps } from '../runtime/ChatRuntimeDeps';
import type { ChatSession, McpToolMode } from '../types/chat';
import { ChatPlanSyncService } from './ChatPlanSyncService';

const BUILTIN_FILESYSTEM_ROUTING_HINT =
	'全局文件工具路由规则：只知道名称或路径片段时先用 find_paths；已经知道 directory_path 才用 list_directory；已经知道 file_path 要读内容时用 read_file；搜索正文内容用 search_content；查询标签、任务、属性或文件统计用 query_index。';

const BUILTIN_FILESYSTEM_TOOL_NAMES = new Set([
	'read_file',
	'read_media',
	'read_files',
	'write_file',
	'edit_file',
	'create_directory',
	'list_directory',
	'move_path',
	'delete_path',
	'find_paths',
	'search_content',
	'query_index',
	'get_file_info',
	'open_file',
]);

interface ResolveToolRuntimeOptions {
	includeSubAgents?: boolean;
	explicitToolNames?: string[];
	explicitMcpServerIds?: string[];
	parentSessionId?: string;
	subAgentStateCallback?: SubAgentStateCallback;
	session?: ChatSession;
}

interface ChatToolRuntimeResolverOptions {
	plugin: OpenChatPlugin;
	runtimeDeps: ChatRuntimeDeps;
	subAgentScannerService: SubAgentScannerService;
	planSyncService: ChatPlanSyncService;
	getActiveSession: () => ChatSession | null;
	getMcpToolMode: () => McpToolMode;
	getMcpSelectedServerIds: () => string[];
	getMaxToolCallLoops: () => number | undefined;
	showMcpNoticeOnce: (message: string) => void;
	chatServiceAdapter: SubAgentChatServiceAdapter;
}

export class ChatToolRuntimeResolver {
	private builtinToolsRuntime: BuiltinToolsRuntime | null = null;
	private builtinToolsRuntimePromise: Promise<BuiltinToolsRuntime | null> | null = null;
	private builtinRuntimeSessionId: string | null = null;
	private runtimeClosingPromise: Promise<void> | null = null;

	constructor(private readonly options: ChatToolRuntimeResolverOptions) {}

	private get app() {
		return this.options.plugin.app;
	}

	private getBuiltinToolSettings() {
		return this.options.plugin.settings.aiRuntime.mcp;
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
			console.warn('[ChatService] 关闭内置工具运行时失败:', error);
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
			const runtime = await createBuiltinToolsRuntime({
				app: this.app,
				settings: this.getBuiltinToolSettings(),
				skillScanner: this.options.runtimeDeps.getSkillScannerService(),
			});
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
			this.options.plugin.settings.aiRuntime.mcp?.disabledBuiltinToolNames ?? [];

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
		const mcpManager = this.options.runtimeDeps.getMcpClientManager();
		const externalServers = mcpManager?.getEnabledServerSummaries() ?? [];
		const builtinSettings = this.getBuiltinToolSettings();
		const hasBuiltinTools =
			builtinSettings?.builtinCoreToolsEnabled !== false
			|| builtinSettings?.builtinFilesystemEnabled !== false
			|| builtinSettings?.builtinFetchEnabled !== false
			|| builtinSettings?.builtinBingSearchEnabled !== false
			|| (this.options.runtimeDeps.getInstalledSkillsSnapshot()?.skills.length ?? 0) > 0;
		if (!hasBuiltinTools) {
			return externalServers;
		}
		return [
			{ id: BUILTIN_SERVER_ID, name: BUILTIN_SERVER_NAME },
			...externalServers,
		];
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

	private createActualMcpCallTool(
		mcpManager?: McpClientManager | null,
	): ((serverId: string, name: string, args: Record<string, unknown>) => Promise<string>) | null {
		if (!mcpManager) {
			return null;
		}

		return async (serverId: string, name: string, args: Record<string, unknown>) => {
			return await mcpManager.callActualTool(serverId, name, args);
		};
	}
}