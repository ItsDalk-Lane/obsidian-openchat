import { moment, type App } from 'obsidian';
import type { SkillScannerService } from 'src/features/skills/SkillScannerService';
import type { McpSettings } from 'src/features/tars/mcp';
import { DEFAULT_MCP_SETTINGS } from 'src/features/tars/mcp/types';
import {
	BUILTIN_SERVER_ID,
	BUILTIN_SERVER_NAME,
} from './constants';
import type {
	PlanSnapshot,
	PlanStateListener,
} from './runtime/plan-state';
import {
	clonePlanSnapshot,
	PlanState,
} from './runtime/plan-state';
import { ScriptRuntime } from './runtime/script-runtime';
import { BuiltinToolRegistry, type BuiltinToolInfo } from './runtime/tool-registry';
import {
	normalizeStructuredToolResult,
	serializeMcpToolResult,
} from './runtime/tool-result';
import type { ToolContext } from './runtime/types';
import { createLinkTools } from './tools/link-tools';
import { createPlanTools } from './tools/plan-tools';
import { createScriptTools } from './tools/script-tools';
import {
	createSkillTools,
} from './tools/skill-tools';
import { createTimeTools } from './tools/time-tools';
import { createBingSearchTools } from './tools/web/bing-search-tools';
import {
	createFetchTools,
	type FetchToolsOptions,
} from './tools/web/fetch-tools';
import { registerFilesystemTools } from './filesystem-mcp-server';

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
}

export async function createBuiltinToolsRuntime(
	options: CreateBuiltinToolsRuntimeOptions
): Promise<BuiltinToolsRuntime> {
	const settings = options.settings ?? DEFAULT_MCP_SETTINGS;
	const registry = new BuiltinToolRegistry();
	const planState = new PlanState();

	let context!: ToolContext;
	const scriptRuntime = new ScriptRuntime({
		callTool: async (name, args) => await registry.call(name, args, context),
		momentFactory: (...args: unknown[]) =>
			(moment as unknown as (...innerArgs: unknown[]) => unknown)(...args),
	});

	context = {
		app: options.app,
		callTool: async (name, args) => await registry.call(name, args, context),
	};

	if (settings.builtinCoreToolsEnabled !== false) {
		registry.registerAll(createScriptTools(options.app, scriptRuntime));
		registry.registerAll(createPlanTools(planState));
		registry.registerAll(createTimeTools({
			defaultTimezone:
				settings.builtinTimeDefaultTimezone
				?? DEFAULT_MCP_SETTINGS.builtinTimeDefaultTimezone!,
		}));
		registry.registerAll(createLinkTools());
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
		registry.registerAll(createSkillTools(options.skillScanner));
	}

	const listTools = async (): Promise<BuiltinToolInfo[]> => {
		return registry.listTools(BUILTIN_SERVER_ID);
	};

	const callTool = async (
		name: string,
		args: Record<string, unknown>
	): Promise<string> => {
		const result = await registry.call(name, args, context);
		return serializeMcpToolResult(normalizeStructuredToolResult(result));
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
