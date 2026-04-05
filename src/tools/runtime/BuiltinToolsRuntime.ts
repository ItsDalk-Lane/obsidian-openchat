import { moment, type App } from 'obsidian';
import type { SkillExecutionRequest } from 'src/domains/skills/execution';
import type { SkillReturnPacket } from 'src/domains/skills/session-state';
import type { McpRuntimeManager } from 'src/domains/mcp/types';
import type { SkillScannerService } from 'src/domains/skills/service';
import {
	DEFAULT_MCP_SETTINGS,
	type McpSettings,
} from 'src/services/mcp/types';
import {
	BUILTIN_SERVER_ID,
	BUILTIN_SERVER_NAME,
} from './constants';
import type {
	PlanSnapshot,
	PlanStateListener,
} from './plan-state';
import {
	clonePlanSnapshot,
	PlanState,
} from './plan-state';
import { ScriptRuntime } from './script-runtime';
import { BuiltinToolRegistry, type BuiltinToolInfo } from './tool-registry';
import type {
	BuiltinToolExecutionContext,
	ToolContext,
} from './types';
import { createCanvasTools } from '../canvas/canvas-tools';
import { createLinkTools } from '../link/link-tools';
import { createGraphTools } from '../graph/graph-tools';
import { createIntegrationTools } from '../integration/integration-tools';
import { createMcpResourceTools } from '../mcp/resources/mcp-resource-tools';
import { createPlanTools } from '../plan/plan-tools';
import { createObsidianCommandTools } from '../obsidian/commands/obsidian-tools';
import { createScriptTools } from '../script/script-tools';
import { createDiscoverSkillsTool } from '../skill/discover-skills/tool';
import { createInvokeSkillTool } from '../skill/invoke-skill/tool';
import { createTimeTools } from '../time/time-tools';
import { createBingSearchTools } from '../web/bing-search-tools';
import { createFetchTools } from '../web/fetch-tools';
import type { FetchToolsOptions } from '../web/fetch/schema';
import { createWorkflowTools } from '../workflow/workflow-tools';
import { registerFilesystemTools } from '../vault/filesystemTools';

export interface BuiltinToolsRuntime {
	readonly serverId: string;
	readonly serverName: string;
	listTools(): Promise<BuiltinToolInfo[]>;
	callTool(name: string, args: Record<string, unknown>): Promise<string>;
	getRegistry(): BuiltinToolRegistry;
	getContext(): ToolContext;
	resetState(): void;
	getPlanSnapshot(): PlanSnapshot | null;
	syncPlanSnapshot(snapshot: PlanSnapshot | null): PlanSnapshot | null;
	onPlanChange(listener: PlanStateListener): () => void;
	close(): Promise<void>;
}

export type BuiltinToolsRuntimeSettings = Pick<
	McpSettings,
	| 'builtinCoreToolsEnabled'
	| 'builtinFilesystemEnabled'
	| 'builtinFetchEnabled'
	| 'builtinFetchIgnoreRobotsTxt'
	| 'builtinBingSearchEnabled'
	| 'builtinTimeDefaultTimezone'
>;

interface CreateBuiltinToolsRuntimeOptions {
	app: App;
	settings?: BuiltinToolsRuntimeSettings;
	skillScanner?: SkillScannerService | null;
	executeSkillExecution?: ((request: SkillExecutionRequest) => Promise<SkillReturnPacket>) | null;
	mcpManager?: McpRuntimeManager | null;
}

export async function createBuiltinToolsRuntime(
	options: CreateBuiltinToolsRuntimeOptions
): Promise<BuiltinToolsRuntime> {
	const settings = options.settings ?? DEFAULT_MCP_SETTINGS;
	const registry = new BuiltinToolRegistry();
	const planState = new PlanState();

	// eslint-disable-next-line prefer-const -- context 与 scriptRuntime 存在循环依赖
	let context!: BuiltinToolExecutionContext<unknown>;
	const executeBuiltinCall = async (
		name: string,
		args: Record<string, unknown>,
		callContext: BuiltinToolExecutionContext<unknown>,
	) => await registry.execute(name, args, callContext, {
		abortSignal: callContext.abortSignal,
	});
	const callBuiltinTool = async (
		name: string,
		args: Record<string, unknown>,
		callContext: BuiltinToolExecutionContext<unknown>,
	): Promise<unknown> => {
		const result = await executeBuiltinCall(name, args, callContext);
		if (result.status === 'failed') {
			throw new Error(result.content);
		}
		return result.publicResult;
	};
	const scriptRuntime = new ScriptRuntime({
		callTool: async (name, args, callContext) =>
			await callBuiltinTool(name, args, callContext ?? context),
		momentFactory: (...args: unknown[]) =>
			(moment as unknown as (...innerArgs: unknown[]) => unknown)(...args),
	});

	context = {
		app: options.app,
		callTool: async (name, args) => await callBuiltinTool(name, args, context),
	};

	if (settings.builtinCoreToolsEnabled !== false) {
		registry.registerAll(createScriptTools(options.app, scriptRuntime));
		registry.registerAll(createPlanTools(planState));
		registry.registerAll(createTimeTools({
			defaultTimezone:
				settings.builtinTimeDefaultTimezone
				?? DEFAULT_MCP_SETTINGS.builtinTimeDefaultTimezone
				?? 'UTC',
		}));
		registry.registerAll(createCanvasTools(options.app));
		registry.registerAll(createLinkTools());
		registry.registerAll(createGraphTools(options.app));
		registry.registerAll(createIntegrationTools(options.app));
		registry.registerAll(createObsidianCommandTools(options.app));
		if (options.mcpManager) {
			registry.registerAll(createMcpResourceTools(options.mcpManager));
		}
		registry.registerAll(createWorkflowTools());
	}

	if (settings.builtinFilesystemEnabled !== false) {
		registerFilesystemTools(options.app, registry);
	}

	if (settings.builtinFetchEnabled !== false) {
		const fetchOptions: FetchToolsOptions = {
			ignoreRobotsTxt: settings.builtinFetchIgnoreRobotsTxt === true,
		};
		registry.registerAll(createFetchTools(fetchOptions));
	}

	if (settings.builtinBingSearchEnabled !== false) {
		registry.registerAll(createBingSearchTools());
	}

	if (options.skillScanner) {
		registry.register(createDiscoverSkillsTool(options.skillScanner));
	}

	if (options.skillScanner && options.executeSkillExecution) {
		registry.register(createInvokeSkillTool(options.executeSkillExecution));
	}

	const listTools = async (): Promise<BuiltinToolInfo[]> => {
		return registry.listTools(BUILTIN_SERVER_ID);
	};

	const callTool = async (
		name: string,
		args: Record<string, unknown>
	): Promise<string> => {
		const result = await executeBuiltinCall(name, args, context);
		return result.status === 'completed'
			? result.serializedResult
			: result.content;
	};

	const close = async (): Promise<void> => {
		registry.clear();
		scriptRuntime.reset();
		planState.reset();
	};

	return {
		serverId: BUILTIN_SERVER_ID,
		serverName: BUILTIN_SERVER_NAME,
		listTools,
		callTool,
		getRegistry: () => registry,
		getContext: () => context,
		resetState: () => {
			scriptRuntime.reset();
			planState.reset();
		},
		getPlanSnapshot: () => clonePlanSnapshot(planState.get()),
		syncPlanSnapshot: (snapshot) => planState.restore(clonePlanSnapshot(snapshot)),
		onPlanChange: (listener) => planState.subscribe(listener),
		close,
	};
}
