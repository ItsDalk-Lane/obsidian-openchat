import assert from 'node:assert/strict';
import test from 'node:test';
import {
	filterChatInputSelectorItems,
	findLatestTriggerMatch,
	replaceTriggerText,
	type ChatInputSelectorItem,
	type ChatInputTriggerSource,
} from './chatInputSelectorUtils';
import {
	buildPromptTemplatePreview,
	listPromptTemplateEntries,
} from './promptTemplateUtils';

const createSource = (
	key: string,
	trigger: string,
): Pick<ChatInputTriggerSource, 'key' | 'trigger'> => ({
	key,
	trigger,
});

test('findLatestTriggerMatch 仅识别合法前缀并返回最近触发符', () => {
	const sources = [createSource('slash', '/'), createSource('mention', '@')];

	assert.deepEqual(
		findLatestTriggerMatch('先执行 /plan 再 @act', '先执行 /plan 再 @act'.length, sources),
		{
			sourceKey: 'mention',
			trigger: '@',
			startIndex: 12,
			filterText: 'act',
		},
	);
	assert.equal(findLatestTriggerMatch('email@test', 'email@test'.length, sources), null);
	assert.equal(findLatestTriggerMatch('@ active', '@ active'.length, sources), null);
	assert.equal(findLatestTriggerMatch('line\n@active', 'line\n@active'.length, sources)?.sourceKey, 'mention');
});

test('filterChatInputSelectorItems 支持描述与关键词匹配并优先前缀', () => {
	const items: ChatInputSelectorItem[] = [
		{
			id: 'skill-plan',
			name: 'plan',
			description: 'Create a live plan',
			kind: 'skill',
			typeLabel: 'Skill',
			keywords: ['planning'],
			payload: null,
		},
		{
			id: 'active-note',
			name: 'Active',
			description: 'meeting-notes.md',
			kind: 'active-file',
			typeLabel: 'Active',
			keywords: ['meeting', 'notes'],
			payload: null,
		},
		{
			id: 'agent-reviewer',
			name: 'reviewer',
			description: 'Code review agent',
			kind: 'agent',
			typeLabel: 'Agent',
			keywords: ['review'],
			payload: null,
		},
	];

	assert.deepEqual(
		filterChatInputSelectorItems(items, 'pl').map((item) => item.id),
		['skill-plan'],
	);
	assert.deepEqual(
		filterChatInputSelectorItems(items, 'meet').map((item) => item.id),
		['active-note'],
	);
	assert.deepEqual(
		filterChatInputSelectorItems(items, 're').map((item) => item.id),
		['agent-reviewer', 'skill-plan'],
	);
});

test('filterChatInputSelectorItems 按空查询与搜索查询切换可见项并按优先级排序', () => {
	const items: ChatInputSelectorItem[] = [
		{
			id: 'action-template',
			name: '提示模板',
			description: '打开模板菜单',
			kind: 'action-template',
			typeLabel: 'Template',
			showWhenSearching: false,
			sortPriority: 0,
			payload: null,
		},
		{
			id: 'active-file',
			name: 'Active',
			description: 'daily/note.md',
			kind: 'active-file',
			typeLabel: 'Active',
			showWhenSearching: false,
			sortPriority: 3,
			payload: null,
		},
		{
			id: 'template-search',
			name: 'plan/review.md',
			description: 'Review current codebase state',
			kind: 'prompt-template',
			typeLabel: 'Template',
			showWhenEmpty: false,
			sortPriority: 0,
			payload: null,
		},
		{
			id: 'folder-search',
			name: 'planning',
			description: 'notes/projects',
			kind: 'vault-folder',
			typeLabel: 'Folder',
			showWhenEmpty: false,
			sortPriority: 1,
			payload: null,
		},
		{
			id: 'file-search',
			name: 'review-notes',
			description: 'notes/projects',
			kind: 'vault-file',
			typeLabel: 'File',
			showWhenEmpty: false,
			sortPriority: 2,
			payload: null,
		},
	];

	assert.deepEqual(
		filterChatInputSelectorItems(items, '').map((item) => item.id),
		['action-template', 'active-file'],
	);
	assert.deepEqual(
		filterChatInputSelectorItems(items, 're').map((item) => item.id),
		['template-search', 'file-search'],
	);
});

test('listPromptTemplateEntries 递归收集 markdown 模板并生成相对路径与预览', async () => {
	const folderEntries = new Map<string, Array<{ path: string; name: string; kind: 'file' | 'folder' }>>([
		['System/AI Data/ai prompts', [
			{ path: 'System/AI Data/ai prompts/review.md', name: 'review.md', kind: 'file' },
			{ path: 'System/AI Data/ai prompts/nested', name: 'nested', kind: 'folder' },
			{ path: 'System/AI Data/ai prompts/ignore.txt', name: 'ignore.txt', kind: 'file' },
		]],
		['System/AI Data/ai prompts/nested', [
			{ path: 'System/AI Data/ai prompts/nested/plan.md', name: 'plan.md', kind: 'file' },
		]],
	]);
	const fileContents = new Map<string, string>([
		['System/AI Data/ai prompts/review.md', '  Review   the\ncurrent repository state and summarize the risks.  '],
		['System/AI Data/ai prompts/nested/plan.md', 'Create a plan with concrete, testable steps.'],
	]);

	const templates = await listPromptTemplateEntries(
		{
			listFolderEntries(folderPath: string) {
				return folderEntries.get(folderPath) ?? [];
			},
			async readVaultFile(filePath: string) {
				return fileContents.get(filePath) ?? '';
			},
		},
		'System/AI Data',
	);

	assert.deepEqual(
		templates.map((item) => item.label),
		['nested/plan.md', 'review.md'],
	);
	assert.equal(
		templates[1]?.preview,
		'Review the current repository state and summarize the risks.',
	);
	assert.equal(
		buildPromptTemplatePreview('a'.repeat(102)),
		`${'a'.repeat(100)}...`,
	);
});

test('replaceTriggerText 删除当前触发 token 并返回新的光标位置', () => {
	const next = replaceTriggerText('分析 @active 后继续', 10, { startIndex: 3 });

	assert.equal(next.value, '分析  后继续');
	assert.equal(next.selectionStart, 3);
});