import assert from 'node:assert/strict';
import test from 'node:test';
import type { ChatMessage } from 'src/domains/chat/types';
import type { ToolDefinition } from 'src/types/tool';
import type { SubAgentScannerService } from './SubAgentScannerService';
import { SubAgentToolExecutor } from './SubAgentToolExecutor';
import type {
	ResolvedToolRuntime,
	SubAgentChatServiceAdapter,
	SubAgentDefinition,
	SubAgentStateUpdate,
	ToolRuntimeResolutionOptions,
} from './types';
import {
	DISCOVER_SUB_AGENTS_TOOL_NAME,
	DELEGATE_SUB_AGENT_TOOL_NAME,
} from './types';

const TOOL_DEFINITIONS: ToolDefinition[] = [];

function createAssistantMessage(content: string): ChatMessage {
	return {
		id: 'assistant-message',
		role: 'assistant',
		content,
		timestamp: Date.now(),
		images: [],
		isError: false,
		metadata: {},
		toolCalls: [],
	};
}

function createScanner(agents: readonly SubAgentDefinition[]): SubAgentScannerService {
	const byName = new Map(agents.map((agent) => [agent.metadata.name, agent]));
	const scanResult = {
		agents: [...agents],
		errors: [],
	};

	const scanner = {
		async scan() {
			return scanResult;
		},
		async findByName(name: string) {
			return byName.get(name.trim()) ?? null;
		},
	};

	return scanner as unknown as SubAgentScannerService;
}

test('discover_sub_agents 会按 query 过滤并返回 agent 元数据', async () => {
	const reviewer: SubAgentDefinition = {
		metadata: {
			name: 'reviewer',
			description: 'Review the current changes for bugs.',
			tools: ['read_file'],
			mcps: ['github'],
			models: 'claude-reviewer',
			maxTokens: 2048,
		},
		agentFilePath: 'agents/reviewer.md',
		systemPrompt: 'Review changes carefully.',
	};
	const planner: SubAgentDefinition = {
		metadata: {
			name: 'planner',
			description: 'Break large tasks into execution steps.',
		},
		agentFilePath: 'agents/planner.md',
		systemPrompt: 'Plan before acting.',
	};
	const chatService: SubAgentChatServiceAdapter = {
		getCurrentModelTag: () => 'default-model',
		resolveToolRuntime: async () => ({ requestTools: [] }),
		generateAssistantResponseForModel: async () => createAssistantMessage('unused'),
	};
	const executor = new SubAgentToolExecutor(
		createScanner([reviewer, planner]),
		chatService,
		'parent-session',
		() => {},
	);

	const result = await executor.execute({
		id: 'call-1',
		name: DISCOVER_SUB_AGENTS_TOOL_NAME,
		arguments: JSON.stringify({ query: 'review' }),
	}, TOOL_DEFINITIONS);
	const payload = JSON.parse(result.content) as {
		agents: Array<{ name: string; description: string; tools: string[]; mcps: string[] }>;
		meta: { query: string | null; returned: number; total: number };
	};

	assert.equal(result.status, 'completed');
	assert.deepEqual(payload, {
		agents: [{
			name: 'reviewer',
			description: 'Review the current changes for bugs.',
			tools: ['read_file'],
			mcps: ['github'],
			model: 'claude-reviewer',
			maxTokens: 2048,
		}],
		meta: {
			query: 'review',
			returned: 1,
			total: 2,
		},
	});
});

test('legacy sub_agent_* 名称仍可通过 delegate 路径执行', async () => {
	const reviewer: SubAgentDefinition = {
		metadata: {
			name: 'reviewer',
			description: 'Review the current changes for bugs.',
			tools: ['read_file'],
			mcps: ['github'],
			models: 'claude-reviewer',
			maxTokens: 2048,
		},
		agentFilePath: 'agents/reviewer.md',
		systemPrompt: 'Review changes carefully.',
	};
	const resolveCalls: Array<ToolRuntimeResolutionOptions | undefined> = [];
	const generateCalls: Array<{
		modelTag: string;
		systemPromptOverride?: string;
		maxTokensOverride?: number;
		toolRuntimeOverride?: ResolvedToolRuntime;
	}> = [];
	const updates: SubAgentStateUpdate[] = [];
	const resolvedRuntime: ResolvedToolRuntime = { requestTools: [] };
	const chatService: SubAgentChatServiceAdapter = {
		getCurrentModelTag: () => 'fallback-model',
		resolveToolRuntime: async (options) => {
			resolveCalls.push(options);
			return resolvedRuntime;
		},
		generateAssistantResponseForModel: async (_session, modelTag, options) => {
			generateCalls.push({
				modelTag,
				systemPromptOverride: options?.systemPromptOverride,
				maxTokensOverride: options?.maxTokensOverride,
				toolRuntimeOverride: options?.toolRuntimeOverride,
			});
			return createAssistantMessage('Delegate result');
		},
	};
	const executor = new SubAgentToolExecutor(
		createScanner([reviewer]),
		chatService,
		'parent-session',
		(update) => updates.push(update),
	);

	const result = await executor.execute({
		id: 'call-2',
		name: 'sub_agent_reviewer',
		arguments: JSON.stringify({ task: 'Review the current diff' }),
	}, TOOL_DEFINITIONS);

	assert.equal(result.name, 'sub_agent_reviewer');
	assert.equal(result.content, 'Delegate result');
	assert.deepEqual(resolveCalls[0], {
		includeSubAgents: false,
		explicitToolNames: ['read_file'],
		explicitMcpServerIds: ['github'],
		parentSessionId: 'parent-session',
	});
	assert.deepEqual(generateCalls[0], {
		modelTag: 'claude-reviewer',
		systemPromptOverride: 'Review changes carefully.',
		maxTokensOverride: 2048,
		toolRuntimeOverride: resolvedRuntime,
	});
	assert.deepEqual(updates.map((update) => update.state.status), ['running', 'completed']);
});

test('delegate_sub_agent 在缺少 agent 参数时返回明确错误', async () => {
	const chatService: SubAgentChatServiceAdapter = {
		getCurrentModelTag: () => 'default-model',
		resolveToolRuntime: async () => ({ requestTools: [] }),
		generateAssistantResponseForModel: async () => createAssistantMessage('unused'),
	};
	const executor = new SubAgentToolExecutor(
		createScanner([]),
		chatService,
		'parent-session',
		() => {},
	);

	const result = await executor.execute({
		id: 'call-3',
		name: DELEGATE_SUB_AGENT_TOOL_NAME,
		arguments: JSON.stringify({ task: 'Review the current diff' }),
	}, TOOL_DEFINITIONS);

	assert.equal(result.content, 'Sub Agent 调用失败：缺少有效的 agent 参数。');
});

test('delegate_sub_agent 在 task 过长时会拒绝执行', async () => {
	let resolveCalled = 0;
	const chatService: SubAgentChatServiceAdapter = {
		getCurrentModelTag: () => 'default-model',
		resolveToolRuntime: async () => {
			resolveCalled += 1;
			return { requestTools: [] };
		},
		generateAssistantResponseForModel: async () => createAssistantMessage('unused'),
	};
	const executor = new SubAgentToolExecutor(
		createScanner([]),
		chatService,
		'parent-session',
		() => {},
	);

	const result = await executor.execute({
		id: 'call-4',
		name: DELEGATE_SUB_AGENT_TOOL_NAME,
		arguments: JSON.stringify({
			agent: 'reviewer',
			task: 'x'.repeat(4001),
		}),
	}, TOOL_DEFINITIONS);

	assert.equal(result.content, 'Sub Agent 调用失败：task 参数过长，最多 4000 个字符。');
	assert.equal(resolveCalled, 0);
});

test('delegate_sub_agent 在 agent 过长时会拒绝执行', async () => {
	let resolveCalled = 0;
	const chatService: SubAgentChatServiceAdapter = {
		getCurrentModelTag: () => 'default-model',
		resolveToolRuntime: async () => {
			resolveCalled += 1;
			return { requestTools: [] };
		},
		generateAssistantResponseForModel: async () => createAssistantMessage('unused'),
	};
	const executor = new SubAgentToolExecutor(
		createScanner([]),
		chatService,
		'parent-session',
		() => {},
	);

	const result = await executor.execute({
		id: 'call-5',
		name: DELEGATE_SUB_AGENT_TOOL_NAME,
		arguments: JSON.stringify({
			agent: 'a'.repeat(121),
			task: 'Review the current diff',
		}),
	}, TOOL_DEFINITIONS);

	assert.equal(result.content, 'Sub Agent 调用失败：agent 参数过长，最多 120 个字符。');
	assert.equal(resolveCalled, 0);
});

test('discover_sub_agents 在 query 过长时会拒绝执行', async () => {
	const chatService: SubAgentChatServiceAdapter = {
		getCurrentModelTag: () => 'default-model',
		resolveToolRuntime: async () => ({ requestTools: [] }),
		generateAssistantResponseForModel: async () => createAssistantMessage('unused'),
	};
	const executor = new SubAgentToolExecutor(
		createScanner([]),
		chatService,
		'parent-session',
		() => {},
	);

	const result = await executor.execute({
		id: 'call-6',
		name: DISCOVER_SUB_AGENTS_TOOL_NAME,
		arguments: JSON.stringify({ query: 'q'.repeat(201) }),
	}, TOOL_DEFINITIONS);

	assert.equal(result.content, 'Sub Agent 调用失败：query 参数过长，最多 200 个字符。');
});
