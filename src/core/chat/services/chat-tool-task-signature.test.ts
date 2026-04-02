import assert from 'node:assert/strict';
import test from 'node:test';
import type { ChatSession, ToolCall } from '../types/chat';
import { buildTaskSignature } from './chat-tool-task-signature';

const createSession = (params?: {
	readonly content?: string;
	readonly selectedText?: string;
	readonly selectedTextContext?: {
		readonly filePath?: string;
		readonly range?: { readonly from: number; readonly to: number };
	};
	readonly selectedFiles?: Array<{ path: string; name: string; extension: string }>;
	readonly toolCalls?: ToolCall[];
}): ChatSession => ({
	id: 'session-signature',
	title: 'Session',
	modelId: 'model-a',
	messages: [
		{
			id: 'user-1',
			role: 'user',
			content: params?.content ?? 'noop',
			timestamp: 1,
			images: [],
			isError: false,
			metadata: {
				...(params?.selectedText ? { selectedText: params.selectedText } : {}),
				...(params?.selectedTextContext
					? { selectedTextContext: params.selectedTextContext }
					: {}),
			},
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
	selectedFiles: (params?.selectedFiles ?? []).map((file, index) => ({
		id: `file-${index}`,
		name: file.name,
		path: file.path,
		extension: file.extension,
		type: 'file' as const,
	})),
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

const createQueryIndexResult = (params: {
	readonly dataSource: 'file' | 'property' | 'tag' | 'task';
	readonly columns: string[];
	readonly rows: Array<Record<string, unknown>>;
}): string => JSON.stringify({
	columns: params.columns,
	rows: params.rows,
	meta: {
		data_source: params.dataSource,
		returned: params.rows.length,
	},
});

const createBingSearchResult = (query: string, urls: string[]): string => JSON.stringify({
	query,
	results: urls.map((url, index) => ({
		id: `result-${index + 1}`,
		title: `Result ${index + 1}`,
		url,
		snippet: `Snippet ${index + 1}`,
	})),
});

test('buildTaskSignature 会把显式文件读取识别为 read + explicit target', () => {
	const signature = buildTaskSignature({
		query: '请读取 README.md 文件的内容并总结要点',
		session: createSession(),
	});

	assert.equal(signature.nextAction, 'read');
	assert.equal(signature.targetKind, 'file');
	assert.equal(signature.targetExplicitness, 'explicit');
	assert.equal(signature.scope, 'single');
	assert.equal(signature.writeIntent, 'none');
	assert.equal(signature.confidence, 'high');
});

test('buildTaskSignature 只有存在活动笔记时才把当前活动笔记识别为 contextual read', () => {
	const withActiveFile = buildTaskSignature({
		query: '请总结当前活动笔记',
		session: createSession(),
		routingContext: {
			activeFilePath: 'docs/current-note.md',
		},
	});
	const withoutActiveFile = buildTaskSignature({
		query: '请总结当前活动笔记',
		session: createSession(),
	});

	assert.equal(withActiveFile.nextAction, 'read');
	assert.equal(withActiveFile.targetKind, 'file');
	assert.equal(withActiveFile.targetExplicitness, 'contextual');
	assert.ok(withActiveFile.reasons.includes('active-file-context'));
	assert.equal(withoutActiveFile.nextAction, 'locate');
	assert.equal(withoutActiveFile.targetExplicitness, 'unknown');
});

test('buildTaskSignature 会把上一轮 find_paths 结果摘要纳入环境上下文', () => {
	const signature = buildTaskSignature({
		query: '请读取第一个候选文件的内容',
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
	});

	assert.equal(signature.environment.recentDiscovery?.toolName, 'find_paths');
	assert.equal(signature.environment.recentDiscovery?.hasResults, true);
	assert.equal(signature.environment.recentDiscovery?.resultCount, 2);
	assert.equal(signature.environment.recentDiscovery?.targetKind, 'file');
	assert.equal(signature.targetExplicitness, 'contextual');
	assert.ok(signature.reasons.includes('recent-discovery:find_paths'));
});

test('buildTaskSignature 会细化 query_index 文件结果的字段级摘要', () => {
	const signature = buildTaskSignature({
		query: '请读取上一轮结果里的第一个候选文件',
		session: createSession({
			toolCalls: [{
				id: 'call-1',
				name: 'query_index',
				arguments: {},
				result: createQueryIndexResult({
					dataSource: 'file',
					columns: ['path', 'title'],
					rows: [
						{ path: 'docs/plan.md', title: 'Plan' },
						{ path: 'docs/spec.md', title: 'Spec' },
					],
				}),
				status: 'completed',
				timestamp: 2,
			}],
		}),
	});

	assert.equal(signature.environment.recentDiscovery?.toolName, 'query_index');
	assert.equal(signature.environment.recentDiscovery?.dataSource, 'file');
	assert.deepEqual(signature.environment.recentDiscovery?.resultFields, ['path', 'title']);
	assert.deepEqual(
		signature.environment.recentDiscovery?.resultReferencePaths,
		['docs/plan.md', 'docs/spec.md'],
	);
	assert.equal(signature.nextAction, 'read');
	assert.ok(signature.reasons.includes('recent-query-index:file'));
});

test('buildTaskSignature 会把 query_index 的非文件结果继续识别为 metadata 流程', () => {
	const signature = buildTaskSignature({
		query: '请读取上一轮结果',
		session: createSession({
			toolCalls: [{
				id: 'call-1',
				name: 'query_index',
				arguments: {},
				result: createQueryIndexResult({
					dataSource: 'tag',
					columns: ['tag', 'count'],
					rows: [
						{ tag: '#ai', count: 4 },
						{ tag: '#obsidian', count: 2 },
					],
				}),
				status: 'completed',
				timestamp: 2,
			}],
		}),
	});

	assert.equal(signature.targetKind, 'vault');
	assert.equal(signature.nextAction, 'metadata');
	assert.ok(signature.reasons.includes('recent-query-index:tag'));
});

test('buildTaskSignature 会保留 bing_search 的查询词与顶部链接', () => {
	const signature = buildTaskSignature({
		query: '请打开第一个搜索结果',
		session: createSession({
			toolCalls: [{
				id: 'call-1',
				name: 'bing_search',
				arguments: {},
				result: createBingSearchResult('obsidian plugin api', [
					'https://docs.obsidian.md/',
					'https://forum.obsidian.md/',
				]),
				status: 'completed',
				timestamp: 2,
			}],
		}),
	});

	assert.equal(signature.environment.recentDiscovery?.toolName, 'bing_search');
	assert.equal(signature.environment.recentDiscovery?.queryText, 'obsidian plugin api');
	assert.deepEqual(
		signature.environment.recentDiscovery?.resultReferenceUrls,
		['https://docs.obsidian.md/', 'https://forum.obsidian.md/'],
	);
	assert.ok(signature.reasons.includes('recent-bing-query'));
});

test('buildTaskSignature 会把选区范围与所在文件路径纳入环境上下文', () => {
	const signature = buildTaskSignature({
		query: '请解释这段选中文本',
		session: createSession({
			selectedText: 'some selection',
			selectedTextContext: {
				filePath: 'docs/current-note.md',
				range: { from: 12, to: 24 },
			},
		}),
	});

	assert.equal(signature.environment.selectedTextFilePath, 'docs/current-note.md');
	assert.deepEqual(signature.environment.selectedTextRange, { from: 12, to: 24 });
	assert.ok(signature.reasons.includes('selection-file-context'));
	assert.ok(signature.reasons.includes('selection-range-context'));
});

test('buildTaskSignature 会把模糊历史回忆请求识别为 locate 而不是 read', () => {
	const signature = buildTaskSignature({
		query: '我之前记录的 React 性能优化方案有哪些',
		session: createSession(),
	});

	assert.equal(signature.nextAction, 'locate');
	assert.equal(signature.targetExplicitness, 'unknown');
	assert.equal(signature.scope, 'vault');
	assert.equal(signature.targetKind, 'vault');
	assert.equal(signature.confidence, 'medium');
	assert.ok(signature.reasons.includes('target-not-yet-resolved'));
});

test('buildTaskSignature 会标记 destructive 写意图', () => {
	const signature = buildTaskSignature({
		query: '请删除 temp 目录下的所有文件',
		session: createSession(),
	});

	assert.equal(signature.nextAction, 'write');
	assert.equal(signature.targetKind, 'directory');
	assert.equal(signature.writeIntent, 'destructive');
	assert.equal(signature.confidence, 'high');
	assert.ok(signature.reasons.includes('destructive-intent'));
});

test('buildTaskSignature 在已知 skill 名称时直达 invoke_skill', () => {
	const signature = buildTaskSignature({
		query: '请使用 skill code-audit 检查当前项目的规范问题',
		session: createSession(),
	});

	assert.equal(signature.nextAction, 'workflow');
	assert.equal(signature.targetKind, 'skill');
	assert.equal(signature.targetExplicitness, 'explicit');
	assert.equal(signature.explicitToolName, 'invoke_skill');
	assert.equal(signature.confidence, 'high');
	assert.ok(signature.reasons.includes('explicit-skill-target'));
});

test('buildTaskSignature 在未知 skill 名称时保留 workflow discovery 阶段', () => {
	const signature = buildTaskSignature({
		query: '请帮我找一下当前有哪些 skill 可以用来做审计',
		session: createSession(),
	});

	assert.equal(signature.nextAction, 'workflow');
	assert.equal(signature.targetKind, 'skill');
	assert.equal(signature.targetExplicitness, 'unknown');
	assert.equal(signature.explicitToolName, 'discover_skills');
	assert.ok(signature.reasons.includes('workflow-target-unknown'));
});

test('buildTaskSignature 会从上一轮工具记录识别 post-discovery 阶段', () => {
	const signature = buildTaskSignature({
		query: '请读取第一个候选文件的内容',
		session: createSession({
			toolCalls: [{
				id: 'call-1',
				name: 'find_paths',
				arguments: {},
				result: createFindPathsResult([{ path: 'docs/plan.md' }]),
				status: 'completed',
				timestamp: 2,
			}],
		}),
	});

	assert.equal(signature.environment.workflowStage, 'post-discovery');
	assert.equal(signature.nextAction, 'read');
	assert.equal(signature.confidence, 'high');
	assert.ok(signature.reasons.includes('workflow-stage:post-discovery'));
});