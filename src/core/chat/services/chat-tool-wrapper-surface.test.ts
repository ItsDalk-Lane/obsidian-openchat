import assert from 'node:assert/strict';
import test from 'node:test';
import { cloneAiRuntimeSettings } from 'src/domains/settings/config-ai-runtime';
import type { ToolSurfaceSettings } from 'src/domains/settings/types-ai-runtime';
import { buildBuiltinTool } from 'src/tools/runtime/build-tool';
import { BuiltinToolRegistry, type BuiltinToolInfo } from 'src/tools/runtime/tool-registry';
import type { BuiltinTool, ToolContext } from 'src/tools/runtime/types';
import { createTimeTools } from 'src/tools/time/time-tools';
import { createTimeWrapperTools } from 'src/tools/time/time-wrapper-tools';
import {
	listDirectorySchema,
	structuredOutputSchema,
} from 'src/tools/vault/filesystemToolSchemas';
import {
	buildListDirectoryFlatArgs,
	buildListDirectoryTreeArgs,
	buildListVaultOverviewArgs,
	listDirectoryFlatSchema,
	listDirectoryTreeSchema,
	listVaultOverviewSchema,
} from 'src/tools/vault/filesystemWrapperSupport';
import { createFetchTools } from 'src/tools/web/fetch-tools';
import { createFetchWrapperTools } from 'src/tools/web/fetch-wrapper-tools';
import type {
	FetchExecutionRuntimeOverrides,
} from 'src/tools/web/fetch-tool-support';
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

function createSession(content: string): ChatSession {
	return {
		id: 'session-wrapper',
		title: 'Wrapper Session',
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

function createToolContext(): ToolContext {
	return {
		app: {} as never,
		callTool: async () => null,
	};
}

function createBuiltinInfos(tools: BuiltinTool[]): BuiltinToolInfo[] {
	const registry = new BuiltinToolRegistry();
	registry.registerAll(tools);
	return registry.listTools('builtin');
}

function getSchemaProperties(toolName: string, tools: BuiltinTool[]): string[] {
	const registry = new BuiltinToolRegistry();
	registry.registerAll(tools);
	const tool = registry.listTools('builtin').find((item) => item.name === toolName);
	assert.ok(tool);
	const properties = tool.inputSchema.properties as Record<string, unknown>;
	return Object.keys(properties).sort();
}

function createSurfaceDefinitions(
	tools: BuiltinTool[],
	toolSurface?: ToolSurfaceSettings,
): ToolDefinition[] {
	const registry = new BuiltinToolRegistry();
	registry.registerAll(tools);
	const surfaceFlags = resolveToolSurfaceSettings({ toolSurface });
	return registry.listTools('builtin').map((tool) => createBuiltinToolDefinition(tool, {
		surfaceFlags,
	}));
}

test('time wrapper 会把 mode 拆成更窄的 schema', () => {
	const tools = [
		...createTimeTools({ defaultTimezone: 'UTC' }),
		...createTimeWrapperTools({ defaultTimezone: 'UTC' }),
	];

	assert.deepEqual(getSchemaProperties('get_current_time', tools), ['timezone']);
	assert.deepEqual(getSchemaProperties('convert_time', tools), [
		'source_timezone',
		'target_timezone',
		'time',
	]);
	assert.deepEqual(getSchemaProperties('calculate_time_range', tools), [
		'natural_time',
		'timezone',
	]);
	assert.ok(getSchemaProperties('get_time', tools).includes('mode'));
});

test('convert_time wrapper 与 legacy get_time(convert) 保持一致', async () => {
	const context = createToolContext();
	const legacyTool = createTimeTools({ defaultTimezone: 'UTC' })
		.find((tool) => tool.name === 'get_time');
	const wrapperTool = createTimeWrapperTools({ defaultTimezone: 'UTC' })
		.find((tool) => tool.name === 'convert_time');
	assert.ok(legacyTool);
	assert.ok(wrapperTool);

	const args = {
		source_timezone: 'Asia/Shanghai',
		target_timezone: 'Europe/London',
		time: '09:30',
	};

	const legacyResult = await legacyTool.execute({
		mode: 'convert',
		...args,
	}, context);
	const wrapperResult = await wrapperTool.execute(args, context);
	const { mode: _legacyMode, ...legacyPayload } = legacyResult as Record<string, unknown>;

	assert.deepEqual(wrapperResult, legacyPayload);
});

test('fetch wrapper 会缩小 schema 并与 legacy fetch 保持相同执行结果', async () => {
	const runtime: FetchExecutionRuntimeOverrides = {
		fetchSingleUrl: async (
			url,
			userAgent,
			ignoreRobotsTxt,
			blacklistSet,
			raw,
			maxLength,
			startIndex,
		) => {
			return JSON.stringify({
				kind: 'single',
				url,
				userAgent,
				ignoreRobotsTxt,
				blacklistSize: blacklistSet.size,
				raw,
				maxLength,
				startIndex,
			});
		},
		fetchBatch: async (
			urls,
			userAgent,
			ignoreRobotsTxt,
			blacklistSet,
			raw,
			maxLength,
			startIndex,
		) => {
			return urls.map((url) => ({
				url,
				success: true,
				content: JSON.stringify({
					kind: 'batch',
					url,
					userAgent,
					ignoreRobotsTxt,
					blacklistSize: blacklistSet.size,
					raw,
					maxLength,
					startIndex,
				}),
			}));
		},
	};
	const options = { runtime };
	const context = createToolContext();
	const tools = [
		...createFetchTools(options),
		...createFetchWrapperTools(options),
	];

	assert.deepEqual(getSchemaProperties('fetch_webpage', tools), [
		'max_length',
		'raw',
		'start_index',
		'url',
	]);
	assert.deepEqual(getSchemaProperties('fetch_webpages_batch', tools), [
		'max_length',
		'raw',
		'start_index',
		'urls',
	]);
	assert.ok(getSchemaProperties('fetch', tools).includes('url'));
	assert.ok(getSchemaProperties('fetch', tools).includes('urls'));

	const legacyFetch = createFetchTools(options).find((tool) => tool.name === 'fetch');
	const fetchWebpage = createFetchWrapperTools(options)
		.find((tool) => tool.name === 'fetch_webpage');
	const fetchBatch = createFetchWrapperTools(options)
		.find((tool) => tool.name === 'fetch_webpages_batch');
	assert.ok(legacyFetch);
	assert.ok(fetchWebpage);
	assert.ok(fetchBatch);

	const singleArgs = {
		url: 'https://example.com/article',
		max_length: 200,
		start_index: 10,
		raw: false,
	};
	assert.equal(
		await fetchWebpage.execute(singleArgs, context),
		await legacyFetch.execute(singleArgs, context),
	);

	const batchArgs = {
		urls: ['https://example.com/a', 'https://example.com/b'],
		max_length: 200,
		start_index: 10,
		raw: true,
	};
	assert.equal(
		await fetchBatch.execute(batchArgs, context),
		await legacyFetch.execute(batchArgs, context),
	);
});

test('vault wrapper 会提供独立的 flat schema，并隐藏 legacy list_directory 默认 surface', () => {
	const filesystemTools = [
		createBuiltinStub('list_directory', listDirectorySchema),
		createBuiltinStub('list_directory_flat', listDirectoryFlatSchema),
		createBuiltinStub('list_directory_tree', listDirectoryTreeSchema),
		createBuiltinStub('list_vault_overview', listVaultOverviewSchema),
	];
	const filesystemToolInfos = createBuiltinInfos(filesystemTools);
	assert.deepEqual(getSchemaProperties('list_directory_flat', filesystemTools), [
		'directory_path',
		'include_sizes',
		'limit',
		'offset',
		'regex',
		'sort_by',
	]);
	assert.deepEqual(getSchemaProperties('list_directory_tree', filesystemTools), [
		'directory_path',
		'exclude_patterns',
		'max_depth',
		'max_nodes',
	]);
	assert.deepEqual(getSchemaProperties('list_vault_overview', filesystemTools), [
		'file_extensions',
		'vault_limit',
	]);

	const toolSurface = { vaultWrappersV1: true };
	const surfaceFlags = resolveToolSurfaceSettings({ toolSurface });
	const compiledListDirectory = compileExecutableToolDefinition(
		createBuiltinToolDefinition(
			filesystemToolInfos.find((tool) => tool.name === 'list_directory')!,
			{ surfaceFlags },
		),
	);
	assert.equal(compiledListDirectory.discovery?.discoveryVisibility, 'hidden');
	assert.equal(compiledListDirectory.compatibility?.deprecationStatus, 'legacy');
	const legacyProperties = Object.keys(
		compiledListDirectory.inputSchema.properties as Record<string, unknown>,
	).sort();
	assert.ok(legacyProperties.includes('view'));
	assert.ok(!legacyProperties.includes('response_format'));
});

test('legacy wrapper 工具会标记为兼容入口', () => {
	const surfaceFlags = resolveToolSurfaceSettings({
		toolSurface: {
			timeWrappersV1: true,
			vaultWrappersV1: true,
			fetchWrappersV1: true,
		},
	});
	const legacyTime = createBuiltinToolDefinition(
		createBuiltinInfos(createTimeTools({ defaultTimezone: 'UTC' }))
			.find((tool) => tool.name === 'get_time')!,
		{ surfaceFlags },
	);
	const legacyFetch = createBuiltinToolDefinition(
		createBuiltinInfos(createFetchTools({ runtime: {
			fetchSingleUrl: async () => 'legacy',
			fetchBatch: async () => [],
		} }))
			.find((tool) => tool.name === 'fetch')!,
		{ surfaceFlags },
	);
	assert.equal(legacyTime.compatibility?.deprecationStatus, 'legacy');
	assert.equal(legacyFetch.compatibility?.deprecationStatus, 'legacy');
	assert.match(legacyTime.discovery?.oneLinePurpose ?? '', /get_current_time/);
	assert.match(legacyFetch.discovery?.oneLinePurpose ?? '', /fetch_webpage/);
});

test('builtin 邻近 surface/runtimePolicy 会进入 surface 与 executable 定义', () => {
	const registry = new BuiltinToolRegistry();
	registry.register(buildBuiltinTool({
		name: 'adjacent_surface_tool',
		description: 'adjacent tool',
		inputSchema: listDirectorySchema,
		surface: {
			family: 'builtin.test.surface',
			visibility: 'candidate-only',
			oneLinePurpose: '来自工具本体的单行用途',
			capabilityTags: ['adjacent'],
			requiredArgsSummary: ['directory_path'],
			argumentComplexity: 'low',
			riskLevel: 'read-only',
		},
		runtimePolicy: {
			defaultArgs: {
				response_format: 'json',
			},
			hiddenSchemaFields: ['response_format'],
		},
		execute: async () => null,
	}));

	const toolInfo = registry.listTools('builtin')
		.find((tool) => tool.name === 'adjacent_surface_tool');
	assert.ok(toolInfo);

	const compiled = compileExecutableToolDefinition(createBuiltinToolDefinition(toolInfo));
	assert.equal(compiled.identity?.familyId, 'builtin.test.surface');
	assert.equal(compiled.discovery?.oneLinePurpose, '来自工具本体的单行用途');
	assert.equal(compiled.discovery?.discoveryVisibility, 'candidate-only');
	assert.deepEqual(compiled.discovery?.capabilityTags, ['adjacent']);
	assert.deepEqual(compiled.runtimePolicy?.defaultArgs, {
		response_format: 'json',
	});
	assert.ok(!Object.keys(
		compiled.inputSchema.properties as Record<string, unknown>,
	).includes('response_format'));
});

test('vault wrapper 会把窄 schema 映射为 legacy list_directory 参数', () => {
	const flatArgs = listDirectoryFlatSchema.parse({
		directory_path: 'projects',
		include_sizes: true,
		sort_by: 'size',
		regex: '.*',
		limit: 20,
		offset: 5,
	});
	assert.deepEqual(buildListDirectoryFlatArgs(flatArgs), {
		directory_path: 'projects',
		view: 'flat',
		include_sizes: true,
		sort_by: 'size',
		regex: '.*',
		limit: 20,
		offset: 5,
		response_format: 'json',
	});

	const treeArgs = listDirectoryTreeSchema.parse({
		directory_path: 'projects',
		exclude_patterns: ['archive/**'],
		max_depth: 4,
		max_nodes: 20,
	});
	assert.deepEqual(buildListDirectoryTreeArgs(treeArgs), {
		directory_path: 'projects',
		view: 'tree',
		exclude_patterns: ['archive/**'],
		max_depth: 4,
		max_nodes: 20,
		response_format: 'json',
	});

	const overviewArgs = listVaultOverviewSchema.parse({
		file_extensions: ['md'],
		vault_limit: 10,
	});
	assert.deepEqual(buildListVaultOverviewArgs(overviewArgs), {
		directory_path: '/',
		view: 'vault',
		file_extensions: ['md'],
		vault_limit: 10,
		response_format: 'json',
	});
});

test('ChatToolSelectionCoordinator 会在时间与网页请求下优先选择 wrapper 工具', async () => {
	const toolSurface = {
		timeWrappersV1: true,
		vaultWrappersV1: true,
		fetchWrappersV1: true,
	};
	const surfaceFlags = resolveToolSurfaceSettings({ toolSurface });
	const filesystemSurfaceTools = [
		createBuiltinStub('list_directory', listDirectorySchema),
		createBuiltinStub('list_directory_flat', listDirectoryFlatSchema),
		createBuiltinStub('list_directory_tree', listDirectoryTreeSchema),
		createBuiltinStub('list_vault_overview', listVaultOverviewSchema),
	];
	const filesystemSurfaceToolInfos = createBuiltinInfos(filesystemSurfaceTools);
	const catalogTools = createSurfaceDefinitions([
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
	], toolSurface).concat(
		filesystemSurfaceToolInfos.map((tool) => createBuiltinToolDefinition(tool, {
			surfaceFlags,
		})),
	);
	const executableTools = catalogTools.map((tool) => compileExecutableToolDefinition(tool));
	const fakeResolver = {
		async buildDiscoveryCatalog() {
			return buildDiscoveryCatalog({ tools: catalogTools, serverEntries: [] });
		},
		async resolveToolRuntime(options?: { explicitToolNames?: string[] }) {
			const requestTools = executableTools.filter((tool) =>
				options?.explicitToolNames?.includes(tool.name),
			);
			return {
				requestTools,
				getTools: async () => requestTools,
			};
		},
	} as unknown as ChatToolRuntimeResolver;
	const coordinator = new ChatToolSelectionCoordinator({
		toolRuntimeResolver: fakeResolver,
		settingsAccessor: createSettingsAccessor(toolSurface),
	});

	const timeTurn = await coordinator.prepareTurn({
		session: createSession('请把 Asia/Shanghai 的 09:30 转换到 Europe/London 时间'),
		includeSubAgents: false,
	});
	assert.ok(timeTurn.candidateScope.candidateToolNames.includes('convert_time'));
	assert.ok(!timeTurn.candidateScope.candidateToolNames.includes('get_time'));
	assert.ok(timeTurn.executableToolSet.tools.every((tool) => tool.name !== 'get_time'));

	const fetchTurn = await coordinator.prepareTurn({
		session: createSession('请抓取 https://example.com/article 这个网页的正文内容'),
		includeSubAgents: false,
	});
	assert.ok(fetchTurn.candidateScope.candidateToolNames.includes('fetch_webpage'));
	assert.ok(!fetchTurn.candidateScope.candidateToolNames.includes('fetch'));
	assert.ok(fetchTurn.executableToolSet.tools.every((tool) => tool.name !== 'fetch'));

	const treeTurn = await coordinator.prepareTurn({
		session: createSession('请递归列出 projects 目录的树形结构'),
		includeSubAgents: false,
	});
	assert.ok(treeTurn.candidateScope.candidateToolNames.includes('list_directory_tree'));
	assert.ok(treeTurn.executableToolSet.tools.some((tool) => tool.name === 'list_directory_tree'));

	const flatTurn = await coordinator.prepareTurn({
		session: createSession('请列出 projects 目录当前一层的内容'),
		includeSubAgents: false,
	});
	assert.ok(flatTurn.candidateScope.candidateToolNames.includes('list_directory_flat'));
	assert.ok(!flatTurn.candidateScope.candidateToolNames.includes('list_directory'));
	assert.ok(flatTurn.executableToolSet.tools.some((tool) => tool.name === 'list_directory_flat'));

	const vaultTurn = await coordinator.prepareTurn({
		session: createSession('请给我整个 vault 的文件路径总览，只看 md 文件'),
		includeSubAgents: false,
	});
	assert.ok(vaultTurn.candidateScope.candidateToolNames.includes('list_vault_overview'));
	assert.ok(vaultTurn.executableToolSet.tools.some((tool) => tool.name === 'list_vault_overview'));
});
