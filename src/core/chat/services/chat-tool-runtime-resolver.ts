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
import {
	compileExecutableToolDefinition,
	createBuiltinToolDefinition,
	createMcpToolDefinition,
	createSubAgentToolDefinition,
} from './chat-tool-definition-factory';
import {
	BUILTIN_FILESYSTEM_ROUTING_HINT,
	BUILTIN_FILESYSTEM_TOOL_NAMES,
	createActualMcpCallTool,
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
		const existingNames = new Set<string>();
		const disabledBuiltinToolNames =
			this.options.settingsAccessor.getAiRuntimeSettings().mcp?.disabledBuiltinToolNames ?? [];
		const executorOptions = {
			enableRuntimeArgumentCompletion: true,
			runtimeArgumentContext: this.resolveRuntimeArgumentContext(session),
		};

		let builtinExecutor: BuiltinToolExecutor | null = null;
		let mcpExecutor: McpToolExecutor | null = null;

		const builtinRuntime = await this.ensureBuiltinToolsRuntime(session);
		if (builtinRuntime) {
			const builtinTools = (await builtinRuntime.listTools())
				.filter((tool) => !disabledBuiltinToolNames.includes(tool.name))
				.map((tool) => createBuiltinToolDefinition({
					...tool,
					description: BUILTIN_FILESYSTEM_TOOL_NAMES.has(tool.name)
						? `${BUILTIN_FILESYSTEM_ROUTING_HINT}\n\n${tool.description}`
						: tool.description,
				}));

			for (const tool of builtinTools) {
				requestTools.push(compileExecutableToolDefinition(tool));
				existingNames.add(tool.name);
			}

			if (builtinTools.length > 0) {
				builtinExecutor = new BuiltinToolExecutor(
					builtinRuntime.getRegistry(),
					builtinRuntime.getContext(),
					this.options.planSyncService.createBuiltinCallTool(builtinRuntime, session),
					executorOptions,
				);
			}
		}

		if (mcpManager) {
			const serverNameById = new Map(
				mcpManager.getEnabledServerSummaries().map((server) => [server.id, server.name]),
			);
			const allMcpTools = await mcpManager.getToolsForModelContext();

			for (const tool of allMcpTools) {
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
		}

		const subAgentTools = [
			createSubAgentToolDefinition(createDiscoverSubAgentsToolDefinition()),
			createSubAgentToolDefinition(createDelegateSubAgentToolDefinition()),
		];
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
		executors.push(new SubAgentToolExecutor(
			this.options.subAgentScannerService,
			this.options.chatServiceAdapter,
			options?.parentSessionId ?? session?.id ?? '',
			options?.subAgentStateCallback ?? (() => {}),
		));

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

	async getBuiltinToolsForSettings(): Promise<Awaited<ReturnType<BuiltinToolsRuntime['listTools']>>> {
		const runtime = await this.ensureBuiltinToolsRuntime(this.options.getActiveSession());
		if (!runtime) {
			return [];
		}
		const disabledBuiltinToolNames =
			this.options.settingsAccessor.getAiRuntimeSettings().mcp?.disabledBuiltinToolNames ?? [];
		return (await runtime.listTools())
			.filter((tool) => !disabledBuiltinToolNames.includes(tool.name));
	}

	dispose(): void {
		void this.closeBuiltinToolsRuntime();
	}
}
