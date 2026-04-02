import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import { cloneAiRuntimeSettings } from 'src/domains/settings/config-ai-runtime';
import type { ToolSurfaceSettings } from 'src/domains/settings/types-ai-runtime';
import { BuiltinToolRegistry, type BuiltinToolInfo } from 'src/tools/runtime/tool-registry';
import type { BuiltinTool } from 'src/tools/runtime/types';
import {
	DISCOVER_SKILLS_TOOL_NAME,
	INVOKE_SKILL_TOOL_NAME,
} from 'src/tools/skill/skill-tools';
import { createTimeTools } from 'src/tools/time/time-tools';
import { createTimeWrapperTools } from 'src/tools/time/time-wrapper-tools';
import { createFetchTools } from 'src/tools/web/fetch-tools';
import { createFetchWrapperTools } from 'src/tools/web/fetch-wrapper-tools';
import {
	listDirectorySchema,
	structuredOutputSchema,
} from 'src/tools/vault/filesystemToolSchemas';
import {
	listDirectoryFlatSchema,
	listDirectoryTreeSchema,
	listVaultOverviewSchema,
} from 'src/tools/vault/filesystemWrapperSupport';
import type { ToolDefinition } from 'src/types/tool';
import {
	buildDiscoveryCatalog,
	compileExecutableToolDefinition,
	createBuiltinToolDefinition,
} from './chat-tool-discovery-catalog';
import { resolveToolSurfaceSettings } from './chat-tool-feature-flags';
import { ChatToolSelectionCoordinator } from './chat-tool-selection-coordinator';
import type { ChatSettingsAccessor } from './chat-service-types';
import type { ChatToolRuntimeResolver } from './chat-tool-runtime-resolver';
import type { ChatSession } from '../types/chat';
import {
	TOOL_SELECTION_REGRESSION_CASES,
	type ToolSelectionRegressionCase,
} from './__fixtures__/tool-selection-regression';

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

function createBuiltinStub(
	name: string,
	inputSchema: BuiltinTool['inputSchema'],
): BuiltinTool {
	return {
		name,
		title: name,
		description: name,
		inputSchema,
		outputSchema: structuredOutputSchema,
		execute: async () => null,
	};
}

function createBuiltinInfos(tools: BuiltinTool[]): BuiltinToolInfo[] {
	const registry = new BuiltinToolRegistry();
	registry.registerAll(tools);
	return registry.listTools('builtin');
}

function createSurfaceDefinitions(toolSurface?: ToolSurfaceSettings): ToolDefinition[] {
	const surfaceFlags = resolveToolSurfaceSettings({ toolSurface });
	const builtinToolInfos = createBuiltinInfos([
		createBuiltinStub('read_file', z.object({
			file_path: z.string(),
		})),
		createBuiltinStub('find_paths', z.object({
			query: z.string(),
		})),
		createBuiltinStub('search_content', z.object({
			pattern: z.string(),
		})),
		createBuiltinStub('query_index', z.object({
			data_source: z.string(),
			query: z.string(),
		})),
		createBuiltinStub('bing_search', z.object({
			query: z.string(),
		})),
		createBuiltinStub('run_shell', z.object({
			command: z.string(),
		})),
		createBuiltinStub('write_plan', z.object({
			items: z.array(z.string()).optional(),
		})),
		createBuiltinStub(INVOKE_SKILL_TOOL_NAME, z.object({
			skillName: z.string().optional(),
			task: z.string().optional(),
		})),
		createBuiltinStub(DISCOVER_SKILLS_TOOL_NAME, z.object({
			query: z.string().optional(),
		})),
		createBuiltinStub('discover_sub_agents', z.object({
			query: z.string().optional(),
		})),
		createBuiltinStub('delegate_sub_agent', z.object({
			agent: z.string().optional(),
			task: z.string().optional(),
		})),
		createBuiltinStub('list_directory', listDirectorySchema),
		createBuiltinStub('list_directory_flat', listDirectoryFlatSchema),
		createBuiltinStub('list_directory_tree', listDirectoryTreeSchema),
		createBuiltinStub('list_vault_overview', listVaultOverviewSchema),
	]);
	const registry = new BuiltinToolRegistry();
	registry.registerAll([
		...createTimeTools({ defaultTimezone: 'UTC' }),
		...createTimeWrapperTools({ defaultTimezone: 'UTC' }),
		...createFetchTools({ runtime: {
			fetchSingleUrl: async () => 'legacy',
			fetchBatch: async () => [],
		} }),
		...createFetchWrapperTools({ runtime: {
			fetchSingleUrl: async () => 'wrapper',
			fetchBatch: async () => [],
		} }),
	]);
	const coreTools = registry.listTools('builtin').map((tool) =>
		createBuiltinToolDefinition(tool, { surfaceFlags }),
	);
	const stubbedTools = builtinToolInfos.map((tool) =>
		createBuiltinToolDefinition(tool, { surfaceFlags }),
	);
	return [...coreTools, ...stubbedTools].map((tool) => compileExecutableToolDefinition(tool));
}

function createCoordinator(caseItem: ToolSelectionRegressionCase): ChatToolSelectionCoordinator {
	const allTools = createSurfaceDefinitions(caseItem.toolSurface);
	const fakeResolver = {
		async buildDiscoveryCatalog() {
			return buildDiscoveryCatalog({ tools: allTools, serverEntries: [] });
		},
		async resolveToolRuntime(options?: { explicitToolNames?: string[] }) {
			const requestTools = allTools.filter((tool) =>
				options?.explicitToolNames?.includes(tool.name),
			);
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