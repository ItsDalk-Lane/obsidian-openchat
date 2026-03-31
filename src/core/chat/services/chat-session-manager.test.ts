import assert from 'node:assert/strict';
import test from 'node:test';
import type { ChatSession, ChatState } from '../types/chat';
import { MessageService } from './message-service';

const createSession = (): ChatSession => ({
	id: 'session-1',
	title: 'Chat',
	modelId: 'model-a',
	messages: [],
	createdAt: 1,
	updatedAt: 2,
	filePath: 'System/AI Data/chat-history/session-1.md',
});

const createState = (activeSession: ChatSession | null): ChatState => ({
	activeSession,
	isGenerating: false,
	inputValue: '',
	selectedModelId: null,
	selectedModels: [],
	enableReasoningToggle: false,
	enableWebSearchToggle: false,
	contextNotes: [],
	selectedImages: [],
	selectedFiles: [],
	selectedFolders: [],
	shouldSaveHistory: true,
	multiModelMode: 'single',
	layoutMode: 'horizontal',
});

test('ChatSessionManager.deleteHistory 删除历史后解绑当前会话并提示清理失败数', async () => {
	(globalThis as typeof globalThis & {
		window?: { localStorage: { getItem: (key: string) => string | null } };
	}).window = {
		localStorage: {
			getItem: () => 'en',
		},
	};
	const { ChatSessionManager } = await import('./chat-session-manager');
	const activeSession = createSession();
	const deletedPaths: string[] = [];
	const notices: string[] = [];
	let emitCount = 0;
	const manager = new ChatSessionManager(
		{
			deleteVaultPath: async (path: string) => {
				deletedPaths.push(path);
				if (path.endsWith('/files/b.md')) {
					throw new Error('locked');
				}
			},
			ensureVaultFolder: async () => {},
			getFrontmatter: () => ({
				managedImportedFiles: [
					'System/AI Data/chat-history/files/a.md',
					'System/AI Data/chat-history/files/b.md',
				],
			}),
			getVaultEntry: () => null,
			listFolderEntries: () => [],
			notify: (message: string) => {
				notices.push(message);
			},
			parseYaml: () => ({}),
			pathExists: async (path: string) => path.endsWith('/a.md') || path.endsWith('/b.md'),
			readLocalStorage: () => null,
			readVaultFile: async () => '',
			statPath: async () => null,
			stringifyYaml: () => '',
			writeLocalStorage: () => {},
			writeVaultFile: async () => {},
		},
		'System/AI Data',
		new MessageService(null as never),
		{
			getState: () => createState(activeSession),
			getSettings: () => ({}),
			getDefaultProviderTag: () => null,
			applySessionSelection: () => {},
			emitState: () => {
				emitCount += 1;
			},
			queueSessionPlanSync: () => {},
		},
	);

	await manager.deleteHistory(activeSession.filePath!);

	assert.equal(activeSession.filePath, undefined);
	assert.equal(emitCount, 1);
	assert.deepEqual(deletedPaths, [
		'System/AI Data/chat-history/session-1.md',
		'System/AI Data/chat-history/files/a.md',
		'System/AI Data/chat-history/files/b.md',
	]);
	assert.equal(notices.length, 1);
	assert.match(notices[0] ?? '', /1/u);
});