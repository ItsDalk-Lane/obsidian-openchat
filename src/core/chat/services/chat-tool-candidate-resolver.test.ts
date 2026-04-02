import assert from 'node:assert/strict';
import test from 'node:test';
import { DeterministicCandidateScopeResolver } from './chat-tool-candidate-resolver';
import type { ChatSession, ToolCall } from '../types/chat';
import type { DiscoveryCatalog, DiscoveryEntry } from './chat-tool-selection-types';

const resolver = new DeterministicCandidateScopeResolver();

const createCatalog = (
	overrides?: Partial<DiscoveryCatalog>,
): DiscoveryCatalog => ({
	version: 1,
	entries: [],
	workflowEntries: [],
	serverEntries: [],
	...(overrides ?? {}),
});

const createSession = (params?: {
	readonly content?: string;
	readonly toolCalls?: ToolCall[];
}): ChatSession => ({
	id: 'session-resolver',
	title: 'Session',
	modelId: 'model-a',
	messages: [
		{
			id: 'msg-1',
			role: 'user',
			content: params?.content ?? 'noop',
			timestamp: 1,
			images: [],
			isError: false,
			metadata: {},
			toolCalls: [],
		},
		...(params?.toolCalls
			? [{
				id: 'assistant-1',
				role: 'assistant' as const,
				content: '',
				timestamp: 2,
				images: [],
				isError: false,
				metadata: {},
				toolCalls: params.toolCalls,
			}]
			: []),
	],
	createdAt: 1,
	updatedAt: 1,
	contextNotes: [],
	selectedImages: [],
	selectedFiles: [],
	selectedFolders: [],
	livePlan: null,
	contextCompaction: null,
	requestTokenState: null,
});

const createFindPathsResult = (paths: Array<{ path: string; type?: 'file' | 'directory' }>): string => {
	return JSON.stringify({
		matches: paths.map((item) => ({
			path: item.path,
			name: item.path.split('/').pop(),
			type: item.type ?? 'file',
		})),
		meta: {
			returned: paths.length,
		},
	});
};

const createEntry = (
	toolName: string,
	familyId: string,
	overrides?: Partial<DiscoveryEntry>,
): DiscoveryEntry => ({
	stableId: toolName,
	toolName,
	familyId,
	displayName: toolName,
	oneLinePurpose: toolName,
	visibility: 'default',
	capabilityTags: [],
	source: 'builtin',
	sourceId: 'builtin',
	riskLevel: 'read-only',
	argumentComplexity: 'low',
	requiredArgsSummary: [],
	whenToUse: [],
	whenNotToUse: [],
	...(overrides ?? {}),
});

test('DeterministicCandidateScopeResolver 在没有原子工具命中时不再 fallback 全量 MCP server', () => {
	const scope = resolver.resolve({
		query: '这是一条与任何工具都无关的请求',
		session: createSession(),
		catalog: createCatalog({
			entries: [createEntry('find_paths', 'builtin.vault.discovery')],
			serverEntries: [{
				serverId: 'github',
				displayName: 'GitHub',
				oneLinePurpose: 'GitHub 工作流',
				capabilityTags: ['github', 'pull-request'],
			}],
		}),
		workflowModeV1: false,
		workflowToolsDefaultHidden: true,
	});

	assert.equal(scope.mode, 'atomic-tools');
	assert.deepEqual(scope.candidateToolNames, ['find_paths']);
	assert.deepEqual(scope.candidateServerIds, []);
	assert.equal(scope.fallbackMode, 'conservative');
	assert.equal(scope.routingTrace?.taskSignature.nextAction, 'unknown');
});

test('DeterministicCandidateScopeResolver 只在 query 命中 server tag 时注入 MCP server 候选', () => {
	const scope = resolver.resolve({
		query: '请继续处理 github pull request review comments',
		session: createSession(),
		catalog: createCatalog({
			entries: [
				createEntry('github_review_comments', 'mcp.github', {
					source: 'mcp',
					sourceId: 'github',
					capabilityTags: ['github', 'pull-request', 'review', 'comments'],
				}),
			],
			serverEntries: [{
				serverId: 'github',
				displayName: 'GitHub',
				oneLinePurpose: 'GitHub 工作流',
				capabilityTags: ['github', 'pull-request', 'review'],
			}],
		}),
		workflowModeV1: false,
		workflowToolsDefaultHidden: true,
	});

	assert.equal(scope.mode, 'atomic-tools');
	assert.deepEqual(scope.candidateToolNames, ['github_review_comments']);
	assert.deepEqual(scope.candidateServerIds, ['github']);
	assert.deepEqual(scope.selectedDomainIds, ['external.mcp']);
});

test('DeterministicCandidateScopeResolver 在 Vault 总览查询下会过滤 legacy list_directory 候选', () => {
	const scope = resolver.resolve({
		query: '请给我整个 vault 的文件路径总览，只看 md 文件',
		session: createSession(),
		catalog: createCatalog({
			entries: [
				createEntry('list_directory', 'builtin.vault.discovery'),
				createEntry('list_directory_flat', 'builtin.vault.discovery'),
				createEntry('list_vault_overview', 'builtin.vault.discovery'),
			],
		}),
		workflowModeV1: false,
		workflowToolsDefaultHidden: true,
	});

	assert.equal(scope.mode, 'atomic-tools');
	assert.deepEqual(scope.candidateToolNames, ['list_vault_overview']);
	assert.deepEqual(scope.selectedDomainIds, ['vault.discovery']);
});

test('DeterministicCandidateScopeResolver 在单层目录查询下会优先 flat 而不是 vault overview', () => {
	const scope = resolver.resolve({
		query: '请列出 projects 目录当前一层的内容',
		session: createSession(),
		catalog: createCatalog({
			entries: [
				createEntry('list_directory_flat', 'builtin.vault.discovery'),
				createEntry('list_vault_overview', 'builtin.vault.discovery'),
			],
		}),
		workflowModeV1: false,
		workflowToolsDefaultHidden: true,
	});

	assert.equal(scope.mode, 'atomic-tools');
	assert.deepEqual(scope.candidateToolNames, ['list_directory_flat']);
	assert.equal(scope.routingTrace?.taskSignature.targetKind, 'directory');
});

test('DeterministicCandidateScopeResolver 在树形目录查询下会过滤当前层目录候选', () => {
	const scope = resolver.resolve({
		query: '请递归列出 src 目录的树形结构',
		session: createSession(),
		catalog: createCatalog({
			entries: [
				createEntry('list_directory', 'builtin.vault.discovery'),
				createEntry('list_directory_flat', 'builtin.vault.discovery'),
				createEntry('list_directory_tree', 'builtin.vault.discovery'),
			],
		}),
		workflowModeV1: false,
		workflowToolsDefaultHidden: true,
	});

	assert.equal(scope.mode, 'atomic-tools');
	assert.deepEqual(scope.candidateToolNames, ['list_directory_tree']);
});

test('DeterministicCandidateScopeResolver 在单层目录查询下会优先 flat 而不是 tree', () => {
	const scope = resolver.resolve({
		query: '请列出 src 目录当前一层的内容',
		session: createSession(),
		catalog: createCatalog({
			entries: [
				createEntry('list_directory_flat', 'builtin.vault.discovery'),
				createEntry('list_directory_tree', 'builtin.vault.discovery'),
			],
		}),
		workflowModeV1: false,
		workflowToolsDefaultHidden: true,
	});

	assert.equal(scope.mode, 'atomic-tools');
	assert.deepEqual(scope.candidateToolNames, ['list_directory_flat']);
});

test('DeterministicCandidateScopeResolver 在时间 wrapper 命中时会过滤 legacy get_time', () => {
	const scope = resolver.resolve({
		query: '请把 Asia/Shanghai 的 09:30 转换到 Europe/London 时间',
		session: createSession(),
		catalog: createCatalog({
			entries: [
				createEntry('get_time', 'builtin.time'),
				createEntry('get_current_time', 'builtin.time'),
				createEntry('convert_time', 'builtin.time'),
			],
		}),
		workflowModeV1: false,
		workflowToolsDefaultHidden: true,
	});

	assert.equal(scope.mode, 'atomic-tools');
	assert.ok(!scope.candidateToolNames.includes('get_time'));
	assert.ok(scope.candidateToolNames.includes('convert_time'));
	assert.deepEqual(scope.selectedDomainIds, ['time']);
});

test('DeterministicCandidateScopeResolver 在目标未明确时优先暴露定位工具并压制读取工具', () => {
	const scope = resolver.resolve({
		query: '我之前记过哪些和缓存优化相关的笔记',
		session: createSession(),
		catalog: createCatalog({
			entries: [
				createEntry('find_paths', 'builtin.vault.discovery', {
					capabilityTags: ['find', 'path', '查找'],
				}),
				createEntry('read_file', 'builtin.vault.read', {
					requiredArgsSummary: ['file_path'],
				}),
				createEntry('edit_file', 'builtin.vault.write', {
					riskLevel: 'mutating',
					requiredArgsSummary: ['file_path'],
				}),
			],
		}),
		workflowModeV1: false,
		workflowToolsDefaultHidden: true,
	});

	assert.deepEqual(scope.candidateToolNames, ['find_paths']);
	assert.equal(scope.routingTrace?.taskSignature.nextAction, 'locate');
	assert.ok(!scope.candidateToolNames.includes('read_file'));
	assert.ok(!scope.candidateToolNames.includes('edit_file'));
	assert.equal(scope.fallbackMode, 'none');
});

test('DeterministicCandidateScopeResolver 会利用上一轮 discovery 进入 read 阶段', () => {
	const scope = resolver.resolve({
		query: '请读取第一个候选文件的内容',
		session: createSession({
			toolCalls: [{
				id: 'call-1',
				name: 'find_paths',
				arguments: {},
				result: '[]',
				status: 'completed',
				timestamp: 2,
			}],
		}),
		catalog: createCatalog({
			entries: [
				createEntry('find_paths', 'builtin.vault.discovery'),
				createEntry('read_file', 'builtin.vault.read', {
					requiredArgsSummary: ['file_path'],
				}),
			],
		}),
		workflowModeV1: false,
		workflowToolsDefaultHidden: true,
	});

	assert.deepEqual(scope.candidateToolNames, ['read_file']);
	assert.equal(scope.routingTrace?.taskSignature.environment.workflowStage, 'post-discovery');
	assert.deepEqual(scope.selectedDomainIds, ['vault.read']);
});

test('DeterministicCandidateScopeResolver 会利用活动笔记上下文把当前活动笔记路由到 read_file', () => {
	const scope = resolver.resolve({
		query: '请总结当前活动笔记',
		session: createSession(),
		catalog: createCatalog({
			entries: [
				createEntry('read_file', 'builtin.vault.read', {
					requiredArgsSummary: ['file_path'],
				}),
				createEntry('find_paths', 'builtin.vault.discovery'),
			],
		}),
		workflowModeV1: false,
		workflowToolsDefaultHidden: true,
		routingContext: {
			activeFilePath: 'docs/current-note.md',
		},
	});

	assert.deepEqual(scope.candidateToolNames, ['read_file']);
	assert.equal(scope.routingTrace?.taskSignature.targetExplicitness, 'contextual');
	assert.ok(scope.routingTrace?.taskSignature.reasons.includes('active-file-context'));
});

test('DeterministicCandidateScopeResolver 会利用上一轮搜索结果把第一个候选文件路由到 read_file', () => {
	const scope = resolver.resolve({
		query: '请打开第一个候选文件',
		session: createSession({
			toolCalls: [{
				id: 'call-1',
				name: 'find_paths',
				arguments: {},
				result: createFindPathsResult([
					{ path: 'docs/plan.md' },
					{ path: 'docs/spec.md' },
				]),
				status: 'completed',
				timestamp: 2,
			}],
		}),
		catalog: createCatalog({
			entries: [
				createEntry('find_paths', 'builtin.vault.discovery'),
				createEntry('read_file', 'builtin.vault.read', {
					requiredArgsSummary: ['file_path'],
				}),
			],
		}),
		workflowModeV1: false,
		workflowToolsDefaultHidden: true,
	});

	assert.deepEqual(scope.candidateToolNames, ['read_file']);
	assert.equal(scope.routingTrace?.taskSignature.environment.recentDiscovery?.resultCount, 2);
	assert.equal(scope.routingTrace?.taskSignature.targetExplicitness, 'contextual');
});