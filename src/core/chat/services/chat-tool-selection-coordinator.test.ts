import assert from 'node:assert/strict';
import test from 'node:test';
import { estimateToolDefinitionTokens } from 'src/core/chat/utils/token';
import { cloneAiRuntimeSettings } from 'src/domains/settings/config-ai-runtime';
import type { ToolSurfaceSettings } from 'src/domains/settings/types-ai-runtime';
import type { ToolDefinition } from 'src/types/tool';
import {
	attachToolSurfaceMetadata,
	buildDiscoveryCatalog,
	compileExecutableToolDefinition,
} from './chat-tool-discovery-catalog';
import { ChatToolSelectionCoordinator } from './chat-tool-selection-coordinator';
import type { ChatSettingsAccessor } from './chat-service-types';
import type { ChatToolRuntimeResolver } from './chat-tool-runtime-resolver';
import type { ChatSession } from '../types/chat';

function createSession(content: string): ChatSession {
	return {
		id: 'session-1',
		title: 'Session',
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

function createTool(name: string, description: string, inputSchema: Record<string, unknown>): ToolDefinition {
	const requiredArgs = Array.isArray(inputSchema.required)
		? inputSchema.required.filter((field): field is string => typeof field === 'string')
		: [];
	const toolSurface = name === 'read_file'
		? {
			family: 'builtin.vault.read',
			visibility: 'default',
			argumentComplexity: 'medium',
			riskLevel: 'read-only',
			oneLinePurpose: '读取单个已知文件。',
			capabilityTags: ['read', 'file', 'content'],
			requiredArgsSummary: requiredArgs,
		}
		: name === 'find_paths'
			? {
				family: 'builtin.vault.discovery',
				visibility: 'default',
				argumentComplexity: 'medium',
				riskLevel: 'read-only',
				oneLinePurpose: '查找路径。',
				capabilityTags: ['find', 'path', 'locate'],
				requiredArgsSummary: requiredArgs,
			}
			: name === 'search_content'
				? {
					family: 'builtin.vault.search',
					visibility: 'default',
					argumentComplexity: 'medium',
					riskLevel: 'read-only',
					oneLinePurpose: '搜索正文内容。',
					capabilityTags: ['search', 'content', 'text'],
					requiredArgsSummary: requiredArgs,
				}
				: name === 'run_shell'
					? {
						family: 'escape.shell',
						visibility: 'workflow-only',
						argumentComplexity: 'high',
						riskLevel: 'escape-hatch',
						oneLinePurpose: '执行本机 shell 命令。',
						capabilityTags: ['shell', 'terminal', 'command'],
						requiredArgsSummary: requiredArgs,
					}
					: name === 'run_script'
						? {
							family: 'workflow.script',
							visibility: 'workflow-only',
							argumentComplexity: 'high',
							riskLevel: 'mutating',
							oneLinePurpose: '执行受限脚本编排。',
							capabilityTags: ['script', 'workflow', 'tool-calling'],
							requiredArgsSummary: requiredArgs,
						}
						: name === 'discover_sub_agents'
							? {
								family: 'builtin.delegate.discovery',
								visibility: 'default',
								argumentComplexity: 'medium',
								riskLevel: 'read-only',
								oneLinePurpose: '列出可委托的子代理。',
								capabilityTags: ['sub-agent', 'delegate', 'discover'],
								requiredArgsSummary: requiredArgs,
							}
							: {
								family: 'builtin.test.misc',
								visibility: 'default',
								argumentComplexity: 'medium',
								riskLevel: 'read-only',
								oneLinePurpose: description,
								capabilityTags: [],
								requiredArgsSummary: requiredArgs,
							};
	return compileExecutableToolDefinition(attachToolSurfaceMetadata({
		name,
		description,
		inputSchema,
		source: 'builtin',
		sourceId: 'builtin',
		surface: toolSurface,
	}));
}

test('ChatToolSelectionCoordinator 会按候选 scope 缩小首轮工具注入', async () => {
	const allTools = [
		createTool('read_file', '读取单个文件。'.repeat(20), {
			type: 'object',
			properties: {
				file_path: { type: 'string' },
				response_format: { type: 'string' },
			},
			required: ['file_path'],
		}),
		createTool('find_paths', '查找路径。'.repeat(20), {
			type: 'object',
			properties: {
				query: { type: 'string' },
				response_format: { type: 'string' },
			},
			required: ['query'],
		}),
		createTool('search_content', '搜索内容。'.repeat(20), {
			type: 'object',
			properties: {
				pattern: { type: 'string' },
				response_format: { type: 'string' },
			},
			required: ['pattern'],
		}),
		createTool('run_shell', '执行 shell。'.repeat(20), {
			type: 'object',
			properties: {
				command: { type: 'string' },
			},
			required: ['command'],
		}),
	];
	const runtimeCalls: Array<{ explicitToolNames?: string[]; explicitMcpServerIds?: string[] }> = [];
	const fakeResolver = {
		async buildDiscoveryCatalog() {
			return buildDiscoveryCatalog({
				tools: allTools,
				serverEntries: [],
			});
		},
		async resolveToolRuntime(options?: { explicitToolNames?: string[]; explicitMcpServerIds?: string[] }) {
			runtimeCalls.push({
				explicitToolNames: options?.explicitToolNames,
				explicitMcpServerIds: options?.explicitMcpServerIds,
			});
			const requestTools = options?.explicitToolNames?.length
				? allTools.filter((tool) => options.explicitToolNames?.includes(tool.name))
				: allTools;
			return {
				requestTools,
				getTools: async () => requestTools,
				maxToolCallLoops: 10,
			};
		},
	} as unknown as ChatToolRuntimeResolver;
	const coordinator = new ChatToolSelectionCoordinator({
		toolRuntimeResolver: fakeResolver,
		settingsAccessor: createSettingsAccessor(),
		getActiveFilePath: () => 'docs/current-note.md',
	});

	const prepared = await coordinator.prepareTurn({
		session: createSession('请读取当前文件并解释里面的代码逻辑'),
		includeSubAgents: false,
	});

	assert.equal(prepared.mode, 'atomic-tools');
	assert.equal(prepared.providerDiscoveryPayload.surfaceMode, 'current-loop');
	assert.equal(prepared.providerExecutablePayload.surfaceMode, 'current-loop');
	assert.ok(runtimeCalls[0]?.explicitToolNames?.includes('read_file'));
	assert.ok(!runtimeCalls[0]?.explicitToolNames?.includes('run_shell'));
	assert.ok(prepared.executableToolSet.tools.length < allTools.length);
	assert.ok(
		estimateToolDefinitionTokens(prepared.executableToolSet.tools)
			< estimateToolDefinitionTokens(allTools),
	);
	assert.equal(prepared.executableToolSet.maxToolCallLoops, 10);
	assert.deepEqual(
		await prepared.executableToolSet.getTools?.(),
		prepared.executableToolSet.tools,
	);
});

test('ChatToolSelectionCoordinator 遇到显式 workflow 意图时只暴露 workflow 工具', async () => {
	const allTools = [
		createTool('run_shell', '执行 shell。'.repeat(20), {
			type: 'object',
			properties: { command: { type: 'string' } },
			required: ['command'],
		}),
		createTool('read_file', '读取文件。'.repeat(20), {
			type: 'object',
			properties: { file_path: { type: 'string' } },
			required: ['file_path'],
		}),
	];
	const fakeResolver = {
		async buildDiscoveryCatalog() {
			return buildDiscoveryCatalog({ tools: allTools, serverEntries: [] });
		},
		async resolveToolRuntime(options?: { explicitToolNames?: string[] }) {
			const requestTools = allTools.filter((tool) => options?.explicitToolNames?.includes(tool.name));
			return {
				requestTools,
				getTools: async () => requestTools,
			};
		},
	} as unknown as ChatToolRuntimeResolver;
	const coordinator = new ChatToolSelectionCoordinator({
		toolRuntimeResolver: fakeResolver,
		settingsAccessor: createSettingsAccessor(),
	});

	const prepared = await coordinator.prepareTurn({
		session: createSession('请在终端里执行一个 shell 命令列出目录'),
		includeSubAgents: false,
	});

	assert.equal(prepared.mode, 'workflow');
	assert.ok(prepared.discoveryCatalog.workflowEntries.some((entry) => entry.toolName === 'run_shell'));
	assert.deepEqual(prepared.executableToolSet.tools.map((tool) => tool.name), ['run_shell']);
	assert.deepEqual(prepared.candidateScope.candidateToolNames, ['run_shell']);
});

test('ChatToolSelectionCoordinator 会把显式 run_script 意图收敛到 workflow 工具', async () => {
	const allTools = [
		createTool('run_script', '执行受限脚本编排。'.repeat(20), {
			type: 'object',
			properties: { script: { type: 'string' } },
			required: ['script'],
		}),
		createTool('read_file', '读取文件。'.repeat(20), {
			type: 'object',
			properties: { file_path: { type: 'string' } },
			required: ['file_path'],
		}),
	];
	const fakeResolver = {
		async buildDiscoveryCatalog() {
			return buildDiscoveryCatalog({ tools: allTools, serverEntries: [] });
		},
		async resolveToolRuntime(options?: { explicitToolNames?: string[] }) {
			const requestTools = allTools.filter((tool) => options?.explicitToolNames?.includes(tool.name));
			return {
				requestTools,
				getTools: async () => requestTools,
			};
		},
	} as unknown as ChatToolRuntimeResolver;
	const coordinator = new ChatToolSelectionCoordinator({
		toolRuntimeResolver: fakeResolver,
		settingsAccessor: createSettingsAccessor(),
	});

	const prepared = await coordinator.prepareTurn({
		session: createSession('请使用 run_script 编排读取和总结当前文件的流程'),
		includeSubAgents: false,
	});

	assert.equal(prepared.mode, 'workflow');
	assert.ok(prepared.discoveryCatalog.workflowEntries.some((entry) => entry.toolName === 'run_script'));
	assert.deepEqual(prepared.executableToolSet.tools.map((tool) => tool.name), ['run_script']);
	assert.deepEqual(prepared.candidateScope.candidateToolNames, ['run_script']);
});

test('ChatToolSelectionCoordinator 在关闭 workflow 模式时仍保持 escape-hatch 的 workflow 暴露语义', async () => {
	const workflowTool = createTool('run_shell', '执行 shell。'.repeat(20), {
		type: 'object',
		properties: { command: { type: 'string' } },
		required: ['command'],
	});
	const fakeResolver = {
		async buildDiscoveryCatalog() {
			return buildDiscoveryCatalog({
				tools: [workflowTool],
				serverEntries: [],
			});
		},
		async resolveToolRuntime(options?: { explicitToolNames?: string[] }) {
			const requestTools = options?.explicitToolNames?.includes(workflowTool.name)
				? [workflowTool]
				: [];
			return {
				requestTools,
				getTools: async () => requestTools,
			};
		},
	} as unknown as ChatToolRuntimeResolver;
	const coordinator = new ChatToolSelectionCoordinator({
		toolRuntimeResolver: fakeResolver,
		settingsAccessor: createSettingsAccessor({
			workflowModeV1: false,
			workflowToolsDefaultHidden: false,
		}),
	});

	const prepared = await coordinator.prepareTurn({
		session: createSession('请在终端里执行一个 shell 命令列出目录'),
		includeSubAgents: false,
	});

	assert.equal(prepared.mode, 'workflow');
	assert.deepEqual(prepared.candidateScope.candidateToolNames, ['run_shell']);
	assert.deepEqual(prepared.executableToolSet.tools.map((tool) => tool.name), ['run_shell']);
});

test('ChatToolSelectionCoordinator 在目标未明确时优先暴露 sub-agent discovery 工具', async () => {
	const workflowTool = createTool('discover_sub_agents', '列出当前可用的子代理。', {
		type: 'object',
		properties: { query: { type: 'string' } },
	});
	const fakeResolver = {
		async buildDiscoveryCatalog() {
			return buildDiscoveryCatalog({
				tools: [workflowTool],
				serverEntries: [],
				subAgents: [{
					metadata: {
						name: 'researcher',
						description: '委托研究子代理处理复杂任务。',
					},
				} as never],
			});
		},
		async resolveToolRuntime(options?: { explicitToolNames?: string[] }) {
			const requestTools = options?.explicitToolNames?.includes(workflowTool.name)
				? [workflowTool]
				: [];
			return {
				requestTools,
				getTools: async () => requestTools,
			};
		},
	} as unknown as ChatToolRuntimeResolver;
	const coordinator = new ChatToolSelectionCoordinator({
		toolRuntimeResolver: fakeResolver,
		settingsAccessor: createSettingsAccessor({
			workflowModeV1: false,
			workflowToolsDefaultHidden: false,
		}),
	});

	const prepared = await coordinator.prepareTurn({
		session: createSession('请委托其他代理继续完成这项研究任务'),
		includeSubAgents: true,
	});

	assert.equal(prepared.mode, 'atomic-tools');
	assert.deepEqual(prepared.candidateScope.candidateToolNames, ['discover_sub_agents']);
	assert.deepEqual(prepared.executableToolSet.tools.map((tool) => tool.name), ['discover_sub_agents']);
});

test('ChatToolSelectionCoordinator 不会把文件名中的 workflow 工具标识误判为 workflow 意图', async () => {
	const allTools = [
		createTool('run_shell', '执行 shell。'.repeat(20), {
			type: 'object',
			properties: { command: { type: 'string' } },
			required: ['command'],
		}),
		createTool('read_file', '读取文件。'.repeat(20), {
			type: 'object',
			properties: { file_path: { type: 'string' } },
			required: ['file_path'],
		}),
	];
	const fakeResolver = {
		async buildDiscoveryCatalog() {
			return buildDiscoveryCatalog({ tools: allTools, serverEntries: [] });
		},
		async resolveToolRuntime(options?: { explicitToolNames?: string[] }) {
			const requestTools = allTools.filter((tool) => options?.explicitToolNames?.includes(tool.name));
			return {
				requestTools,
				getTools: async () => requestTools,
			};
		},
	} as unknown as ChatToolRuntimeResolver;
	const coordinator = new ChatToolSelectionCoordinator({
		toolRuntimeResolver: fakeResolver,
		settingsAccessor: createSettingsAccessor(),
	});

	const prepared = await coordinator.prepareTurn({
		session: createSession('请读取 run_shell.ts 文件的内容并解释实现逻辑'),
		includeSubAgents: false,
	});

	assert.equal(prepared.mode, 'atomic-tools');
	assert.ok(prepared.candidateScope.candidateToolNames.includes('read_file'));
	assert.ok(!prepared.candidateScope.candidateToolNames.includes('run_shell'));
	assert.deepEqual(prepared.executableToolSet.tools.map((tool) => tool.name), ['read_file']);
});

test('ChatToolSelectionCoordinator 会把当前活动文件路径透传给候选路由', async () => {
	const allTools = [
		createTool('read_file', '读取文件。'.repeat(20), {
			type: 'object',
			properties: { file_path: { type: 'string' } },
			required: ['file_path'],
		}),
		createTool('find_paths', '查找路径。'.repeat(20), {
			type: 'object',
			properties: { query: { type: 'string' } },
			required: ['query'],
		}),
	];
	const fakeResolver = {
		async buildDiscoveryCatalog() {
			return buildDiscoveryCatalog({ tools: allTools, serverEntries: [] });
		},
		async resolveToolRuntime(options?: { explicitToolNames?: string[] }) {
			const requestTools = allTools.filter((tool) => options?.explicitToolNames?.includes(tool.name));
			return {
				requestTools,
				getTools: async () => requestTools,
			};
		},
	} as unknown as ChatToolRuntimeResolver;
	const coordinator = new ChatToolSelectionCoordinator({
		toolRuntimeResolver: fakeResolver,
		settingsAccessor: createSettingsAccessor(),
		getActiveFilePath: () => 'docs/current-note.md',
	});

	const prepared = await coordinator.prepareTurn({
		session: createSession('请总结当前活动笔记'),
		includeSubAgents: false,
	});

	assert.deepEqual(prepared.candidateScope.candidateToolNames, ['read_file']);
	assert.ok(prepared.candidateScope.routingTrace?.taskSignature.reasons.includes('active-file-context'));
});
