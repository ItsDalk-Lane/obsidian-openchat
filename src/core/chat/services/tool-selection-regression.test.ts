import assert from 'node:assert/strict';
import Module from 'node:module';
import test from 'node:test';
import { cloneAiRuntimeSettings } from 'src/domains/settings/config-ai-runtime';
import type { SkillScannerService } from 'src/domains/skills/service';
import type {
	LoadedSkillContent,
	SkillDefinition,
	SkillScanResult,
} from 'src/domains/skills/types';
import type { ToolSurfaceSettings } from 'src/domains/settings/types-ai-runtime';
import { PlanState } from 'src/tools/runtime/plan-state';
import { ScriptRuntime } from 'src/tools/runtime/script-runtime';
import { BuiltinToolRegistry } from 'src/tools/runtime/tool-registry';
import { createWritePlanTool } from 'src/tools/plan/write-plan/tool';
import { createSkillTools } from 'src/tools/skill/skill-tools';
import {
	createDelegateSubAgentToolDefinition,
	createDiscoverSubAgentsToolDefinition,
} from 'src/tools/sub-agents/subAgentTools';
import { createTimeTools } from 'src/tools/time/time-tools';
import { createTimeWrapperTools } from 'src/tools/time/time-wrapper-tools';
import { createFetchTools } from 'src/tools/web/fetch-tools';
import { createFetchWrapperTools } from 'src/tools/web/fetch-wrapper-tools';
import type { ToolDefinition } from 'src/types/tool';
import {
	buildDiscoveryCatalog,
	compileExecutableToolDefinition,
	createBuiltinToolDefinition,
	createSubAgentDiscoveryTool,
} from './chat-tool-discovery-catalog';
import { resolveToolSurfaceSettings } from './chat-tool-feature-flags';
import { ChatToolSelectionCoordinator } from './chat-tool-selection-coordinator';
import type { ChatSettingsAccessor } from './chat-service-types';
import type { ChatToolRuntimeResolver } from './chat-tool-runtime-resolver';
import {
	TOOL_SELECTION_REGRESSION_CASES,
	type ToolSelectionRegressionCase,
} from './__fixtures__/tool-selection-regression';
import type { ChatSession } from '../types/chat';

function createSession(content: string): ChatSession {
	return {
		id: 'session-regression',
		title: 'Regression Session',
		modelId: 'model-a',
		messages: [{
			id: 'msg-1',
			role: 'user',
			content,
			timestamp: 1,
			images: [],
			isError: false,
			metadata: {},
			toolCalls: [],
		}],
		createdAt: 1,
		updatedAt: 1,
		livePlan: null,
		contextCompaction: null,
		requestTokenState: null,
		contextNotes: [],
		selectedImages: [],
		selectedFiles: [],
		selectedFolders: [],
	};
}

const SKILL_DEFINITION: SkillDefinition = {
	metadata: {
		name: 'pdf',
		description: 'Inspect PDF files and attachments.',
	},
	skillFilePath: 'System/AI Data/skills/pdf/SKILL.md',
	basePath: 'System/AI Data/skills/pdf',
};

const installObsidianStub = (): void => {
	const globalScope = globalThis as typeof globalThis & {
		__obsidianRegressionStubInstalled?: boolean;
	};
	if (globalScope.__obsidianRegressionStubInstalled) {
		return;
	}
	const moduleLoader = Module as typeof Module & {
		_load: (request: string, parent: object | null, isMain: boolean) => unknown;
	};
	const originalLoad = moduleLoader._load;
	moduleLoader._load = (request, parent, isMain) => {
		if (request === 'obsidian') {
			class FileSystemAdapter {
				constructor(private readonly basePath = process.cwd()) {}

				getBasePath(): string {
					return this.basePath;
				}
			}

			class TAbstractFile {}
			class TFile extends TAbstractFile {}
			class TFolder extends TAbstractFile {}

			return {
				App: class App {},
				FileSystemAdapter,
				Platform: {
					isDesktopApp: true,
					isDesktop: true,
				},
				TAbstractFile,
				TFile,
				TFolder,
				normalizePath: (value: string) =>
					value.replace(/\\/gu, '/').replace(/\/+/gu, '/'),
				requestUrl: async () => ({
					status: 200,
					headers: {},
					text: '',
				}),
			};
		}
		return originalLoad(request, parent, isMain);
	};
	globalScope.__obsidianRegressionStubInstalled = true;
};

const loadToolFactories = async () => {
	installObsidianStub();
	const [
		{ createRunScriptTool },
		{ createRunShellTool },
		{ createFindPathsTool },
		{ createListDirectoryFlatTool },
		{ createListDirectoryTreeTool },
		{ createListDirectoryTool },
		{ createListVaultOverviewTool },
		{ createQueryIndexTool },
		{ createReadFileTool },
		{ createSearchContentTool },
		{ createBingSearchTools },
	] = await Promise.all([
		import('src/tools/script/run-script/tool'),
		import('src/tools/script/run-shell/tool'),
		import('src/tools/vault/find-paths/tool'),
		import('src/tools/vault/list-directory-flat/tool'),
		import('src/tools/vault/list-directory-tree/tool'),
		import('src/tools/vault/list-directory/tool'),
		import('src/tools/vault/list-vault-overview/tool'),
		import('src/tools/vault/query-index/tool'),
		import('src/tools/vault/read-file/tool'),
		import('src/tools/vault/search-content/tool'),
		import('src/tools/web/bing-search-tools'),
	]);
	return {
		createRunScriptTool,
		createRunShellTool,
		createFindPathsTool,
		createListDirectoryFlatTool,
		createListDirectoryTreeTool,
		createListDirectoryTool,
		createListVaultOverviewTool,
		createQueryIndexTool,
		createReadFileTool,
		createSearchContentTool,
		createBingSearchTools,
	};
};

function createSkillScanner(): SkillScannerService {
	const scanResult: SkillScanResult = {
		skills: [SKILL_DEFINITION],
		errors: [],
	};

	return {
		scan: async () => scanResult,
		findByName: (name: string) =>
			name === SKILL_DEFINITION.metadata.name ? SKILL_DEFINITION : undefined,
		normalizePath: (path: string) => path,
		loadSkillContent: async (): Promise<LoadedSkillContent> => ({
			definition: SKILL_DEFINITION,
			fullContent: SKILL_DEFINITION.metadata.description,
			bodyContent: SKILL_DEFINITION.metadata.description,
		}),
	} as unknown as SkillScannerService;
}

function createAppStub() {
	return {
		vault: {
			adapter: {
				getBasePath: () => process.cwd(),
			},
		},
		workspace: {
			getActiveFile: () => null,
		},
	} as never;
}

function createSettingsAccessor(toolSurface?: ToolSurfaceSettings): ChatSettingsAccessor {
	const aiRuntimeSettings = cloneAiRuntimeSettings();
	aiRuntimeSettings.toolSurface = {
		...(aiRuntimeSettings.toolSurface ?? {}),
		...(toolSurface ?? {}),
	};
	return {
		getManifestId: () => 'obsidian-openchat',
		getAiDataFolder: () => '.ai',
		getPluginSettings: () => ({}) as never,
		getChatSettings: () => ({}) as never,
		setChatSettings: () => {},
		getAiRuntimeSettings: () => aiRuntimeSettings,
		setAiRuntimeSettings: () => {},
		saveSettings: async () => {},
		openSettingsTab: () => {},
	};
}

async function createSurfaceDefinitions(toolSurface?: ToolSurfaceSettings): Promise<ToolDefinition[]> {
	const {
		createRunScriptTool,
		createRunShellTool,
		createFindPathsTool,
		createListDirectoryFlatTool,
		createListDirectoryTreeTool,
		createListDirectoryTool,
		createListVaultOverviewTool,
		createQueryIndexTool,
		createReadFileTool,
		createSearchContentTool,
		createBingSearchTools,
	} = await loadToolFactories();
	const app = createAppStub();
	const scriptRuntime = new ScriptRuntime({
		callTool: async () => null,
		momentFactory: () => null,
	});
	const registry = new BuiltinToolRegistry();
	registry.registerAll([
		...createTimeTools({ defaultTimezone: 'UTC' }),
		...createTimeWrapperTools({ defaultTimezone: 'UTC' }),
		...createFetchTools(),
		...createFetchWrapperTools(),
		createReadFileTool(app),
		createFindPathsTool(app),
		createSearchContentTool(app),
		createQueryIndexTool(app),
		...createBingSearchTools(),
		createRunShellTool(app),
		createRunScriptTool(scriptRuntime),
		createWritePlanTool(new PlanState()),
		...createSkillTools(createSkillScanner()),
		createListDirectoryTool(app),
		createListDirectoryFlatTool(app),
		createListDirectoryTreeTool(app),
		createListVaultOverviewTool(app),
	]);
	const surfaceFlags = resolveToolSurfaceSettings({ toolSurface });
	const builtinTools = registry.listTools('builtin').map((tool) =>
		createBuiltinToolDefinition(tool, { surfaceFlags }),
	);
	const subAgentTools = [
		createSubAgentDiscoveryTool(createDiscoverSubAgentsToolDefinition()),
		createSubAgentDiscoveryTool(createDelegateSubAgentToolDefinition()),
	];
	return [...builtinTools, ...subAgentTools]
		.map((tool) => compileExecutableToolDefinition(tool));
}

function createCoordinator(caseItem: ToolSelectionRegressionCase): ChatToolSelectionCoordinator {
	const allToolsPromise = createSurfaceDefinitions(caseItem.toolSurface);
	const fakeResolver = {
		async buildDiscoveryCatalog() {
			const allTools = await allToolsPromise;
			return buildDiscoveryCatalog({ tools: allTools, serverEntries: [] });
		},
		async resolveToolRuntime(options?: { explicitToolNames?: string[] }) {
			const allTools = await allToolsPromise;
			const requestTools = options?.explicitToolNames?.length
				? allTools.filter((tool) => options.explicitToolNames?.includes(tool.name))
				: allTools;
			return {
				requestTools,
				getTools: async () => requestTools,
			};
		},
	} as unknown as ChatToolRuntimeResolver;

	return new ChatToolSelectionCoordinator({
		toolRuntimeResolver: fakeResolver,
		settingsAccessor: createSettingsAccessor(caseItem.toolSurface),
		getActiveFilePath: () => caseItem.activeFilePath ?? null,
	});
}

for (const caseItem of TOOL_SELECTION_REGRESSION_CASES) {
	test(`回归语料: ${caseItem.name}`, async () => {
		const coordinator = createCoordinator(caseItem);
		const prepared = await coordinator.prepareTurn({
			session: createSession(caseItem.prompt),
			includeSubAgents: false,
		});

		assert.equal(prepared.mode, caseItem.expectedMode);
		for (const toolName of caseItem.expectedToolNames) {
			assert.ok(
				prepared.candidateScope.candidateToolNames.includes(toolName),
				`缺少候选工具 ${toolName}`,
			);
		}
		for (const toolName of caseItem.excludedToolNames ?? []) {
			assert.ok(
				!prepared.candidateScope.candidateToolNames.includes(toolName),
				`候选工具不应包含 ${toolName}`,
			);
		}
	});
}
