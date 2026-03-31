import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_CHAT_SETTINGS } from 'src/domains/chat/config';
import { ChatStateStore } from './chat-state-store';
import { createChatServiceStateApi } from './chat-service-state-api';
import type { ChatServiceInternals } from './chat-service-internals';

const createStateStore = () => new ChatStateStore({
	activeSession: null,
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

test('updateSettings 在 autosaveChat 变更时同步 shouldSaveHistory', () => {
	const stateStore = createStateStore();
	let emitCount = 0;
	let historyFolder = '';

	const internals = {
		settings: { ...DEFAULT_CHAT_SETTINGS },
		stateStore,
		settingsAccessor: {
			getAiDataFolder: () => 'System/AI Data',
		} as ChatServiceInternals['settingsAccessor'],
		sessionManager: {
			setHistoryFolder: (nextFolder: string) => {
				historyFolder = nextFolder;
			},
		} as ChatServiceInternals['sessionManager'],
		service: {
			getDefaultProviderTag: () => 'model-default',
			emitState: () => {
				emitCount += 1;
			},
		} as ChatServiceInternals['service'],
	} as ChatServiceInternals;

	const api = createChatServiceStateApi(internals);

	api.updateSettings({ autosaveChat: false });
	assert.equal(internals.settings.autosaveChat, false);
	assert.equal(stateStore.getMutableState().shouldSaveHistory, false);
	assert.equal(stateStore.getMutableState().selectedModelId, 'model-default');
	assert.notEqual(historyFolder, '');

	api.updateSettings({ autosaveChat: true });
	assert.equal(internals.settings.autosaveChat, true);
	assert.equal(stateStore.getMutableState().shouldSaveHistory, true);
	assert.equal(emitCount, 2);
});

test('createNewSession 不再在 session 上写入模板系统提示词标记', () => {
	const stateStore = createStateStore();
	stateStore.getMutableState().selectedModelId = 'model-a';

	const internals = {
		stateStore,
		subAgentScannerService: {
			clearCache: () => {},
		} as ChatServiceInternals['subAgentScannerService'],
		attachmentSelectionService: {
			clearSelection: () => {},
		} as ChatServiceInternals['attachmentSelectionService'],
		service: {
			getDefaultProviderTag: () => 'model-default',
			stopGeneration: () => {},
			emitState: () => {},
			queueSessionPlanSync: () => {},
		} as ChatServiceInternals['service'],
	} as ChatServiceInternals;

	const api = createChatServiceStateApi(internals);
	const session = api.createNewSession('新的聊天');

	assert.equal(session.modelId, 'model-a');
})

	test('deleteManagedImportedSelectedFile 会清理受管导入附件文件', async () => {
	const stateStore = createStateStore();
	stateStore.getMutableState().selectedFiles = [{
		id: 'System/AI Data/chat-history/files/imported.md',
		name: 'imported.md',
		path: 'System/AI Data/chat-history/files/imported.md',
		extension: 'md',
		type: 'file',
		attachmentSource: 'managed-import',
	}];
	const deletedPaths: string[] = [];

	const internals = {
		stateStore,
		attachmentSelectionService: {
			removeSelectedFile: (fileId: string) => {
				stateStore.getMutableState().selectedFiles = stateStore.getMutableState().selectedFiles
					.filter((file) => file.id !== fileId);
			},
		} as ChatServiceInternals['attachmentSelectionService'],
		obsidianApi: {
			pathExists: async () => true,
			deleteVaultPath: async (path: string) => {
				deletedPaths.push(path);
			},
			notify: () => {},
		} as ChatServiceInternals['obsidianApi'],
	} as ChatServiceInternals;

	const api = createChatServiceStateApi(internals);
	api.deleteManagedImportedSelectedFile('System/AI Data/chat-history/files/imported.md');
	await new Promise((resolve) => setTimeout(resolve, 0));

	assert.deepEqual(deletedPaths, ['System/AI Data/chat-history/files/imported.md']);
	assert.equal(stateStore.getMutableState().selectedFiles.length, 1);
});

test('removeSelectedFile 仅更新选择状态而不删除文件', async () => {
	const stateStore = createStateStore();
	stateStore.getMutableState().selectedFiles = [{
		id: 'docs/spec.md',
		name: 'spec.md',
		path: 'docs/spec.md',
		extension: 'md',
		type: 'file',
	}];
	const deletedPaths: string[] = [];

	const internals = {
		stateStore,
		attachmentSelectionService: {
			removeSelectedFile: (fileId: string) => {
				stateStore.getMutableState().selectedFiles = stateStore.getMutableState().selectedFiles
					.filter((file) => file.id !== fileId);
			},
		} as ChatServiceInternals['attachmentSelectionService'],
		obsidianApi: {
			pathExists: async () => true,
			deleteVaultPath: async (path: string) => {
				deletedPaths.push(path);
			},
			notify: () => {},
		} as ChatServiceInternals['obsidianApi'],
	} as ChatServiceInternals;

	const api = createChatServiceStateApi(internals);
	api.removeSelectedFile('docs/spec.md');
	await new Promise((resolve) => setTimeout(resolve, 0));

	assert.deepEqual(deletedPaths, []);
	assert.equal(stateStore.getMutableState().selectedFiles.length, 0);
});

	test('deleteManagedImportedSelectedFile 不删除普通 Vault 附件文件', async () => {
	const stateStore = createStateStore();
	stateStore.getMutableState().selectedFiles = [{
		id: 'docs/spec.md',
		name: 'spec.md',
		path: 'docs/spec.md',
		extension: 'md',
		type: 'file',
	}];
	const deletedPaths: string[] = [];

	const internals = {
		stateStore,
		attachmentSelectionService: {
			removeSelectedFile: () => {},
		} as ChatServiceInternals['attachmentSelectionService'],
		obsidianApi: {
			pathExists: async () => true,
			deleteVaultPath: async (path: string) => {
				deletedPaths.push(path);
			},
			notify: () => {},
		} as ChatServiceInternals['obsidianApi'],
	} as ChatServiceInternals;

	const api = createChatServiceStateApi(internals);
	api.deleteManagedImportedSelectedFile('docs/spec.md');
	await new Promise((resolve) => setTimeout(resolve, 0));

	assert.deepEqual(deletedPaths, []);
	assert.equal(stateStore.getMutableState().selectedFiles.length, 1);
});
