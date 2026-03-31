import assert from 'node:assert/strict';
import test from 'node:test';
import type { ChatSession } from '../types/chat';
import { MessageService } from './message-service';
import { HistoryService } from './history-service';
import { buildHistorySessionFrontmatter } from './history-service-support';

test('buildHistorySessionFrontmatter 不再写入模板系统提示词开关', () => {
	const session: ChatSession = {
		id: 'session-1',
		title: 'Chat',
		modelId: 'model-a',
		messages: [],
		createdAt: 1,
		updatedAt: 2,
	};

	const frontmatter = buildHistorySessionFrontmatter(
		{
			formatTimestamp: (value: number) => String(value),
		} as never,
		session,
	);

	assert.equal('enableTemplateAsSystemPrompt' in frontmatter, false)
})

test('HistoryService.loadSession 会忽略旧 frontmatter 中的模板系统提示词字段', async () => {
	const historyService = new HistoryService(
		{
			deleteVaultPath: async () => {},
			ensureVaultFolder: async () => {},
			getFrontmatter: () => null,
			getVaultEntry: () => ({
				kind: 'file',
				path: 'System/AI Data/chat/history/session-1.md',
				name: 'session-1.md',
			}),
			listFolderEntries: () => [],
			parseYaml: () => ({
				id: 'session-1',
				title: 'Legacy Session',
				model: 'model-a',
				enableTemplateAsSystemPrompt: true,
			}),
			pathExists: async () => true,
			readVaultFile: async () => [
				'---',
				'id: session-1',
				'title: Legacy Session',
				'model: model-a',
				'enableTemplateAsSystemPrompt: true',
				'---',
				'',
			].join('\n'),
			statPath: async () => ({ ctime: 1, mtime: 2, size: 0 }),
			stringifyYaml: () => '',
			writeVaultFile: async () => {},
		},
		new MessageService(null as never),
		'System/AI Data/chat/history',
	)

	const session = await historyService.loadSession('System/AI Data/chat/history/session-1.md')

	assert.ok(session)
	assert.equal(session?.id, 'session-1')
	assert.equal(session?.title, 'Legacy Session')
})
