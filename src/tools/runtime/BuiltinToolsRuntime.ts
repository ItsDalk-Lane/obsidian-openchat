import { moment, type App } from 'obsidian';
import type { SkillScannerService } from 'src/services/skills/SkillScannerService';
import type { McpSettings } from 'src/services/mcp';
import { DEFAULT_MCP_SETTINGS } from 'src/services/mcp/types';
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
import {
	normalizeStructuredToolResult,
	serializeMcpToolResult,
} from './tool-result';
import type { ToolContext } from './types';
import { createLinkTools } from '../link/link-tools';
import { createPlanTools } from '../plan/plan-tools';
import { createScriptTools } from '../script/script-tools';
import {
	createSkillTools,
} from '../skill/skill-tools';
import { createTimeTools } from '../time/time-tools';
import { createBingSearchTools } from '../web/bing-search-tools';
import {
	createFetchTools,
	type FetchToolsOptions,
} from '../web/fetch-tools';
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
}

export async function createBuiltinToolsRuntime(
	options: CreateBuiltinToolsRuntimeOptions
): Promise<BuiltinToolsRuntime> {
	const settings = options.settings ?? DEFAULT_MCP_SETTINGS;
	const registry = new BuiltinToolRegistry();
	const planState = new PlanState();

	// eslint-disable-next-line prefer-const -- context 与 scriptRuntime 存在循环依赖
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
				?? DEFAULT_MCP_SETTINGS.builtinTimeDefaultTimezone
				?? 'UTC',
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
