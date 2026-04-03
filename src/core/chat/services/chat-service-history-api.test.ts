import assert from 'node:assert/strict';
import Module from 'node:module';
import test from 'node:test';
import { ChatStateStore } from './chat-state-store';
import type { ChatServiceInternals } from './chat-service-internals';

const installObsidianStub = (): void => {
	const globalScope = globalThis as typeof globalThis & {
		__obsidianHistoryApiStubInstalled?: boolean;
	}
	if (globalScope.__obsidianHistoryApiStubInstalled) {
		return;
	}
	const moduleLoader = Module as typeof Module & {
		_load: (request: string, parent: object | null, isMain: boolean) => unknown;
	}
	const originalLoad = moduleLoader._load;
	moduleLoader._load = (request, parent, isMain) => {
		if (request === 'obsidian') {
			return {};
		}
		return originalLoad(request, parent, isMain);
	};
	globalScope.__obsidianHistoryApiStubInstalled = true;
};

const createStateStore = () => new ChatStateStore({
	activeSession: {
		id: 'chat-main',
		title: '主任务',
		modelId: 'model-a',
		messages: [{
			id: 'message-1',
			role: 'user',
			content: '原始任务',
			timestamp: 1,
		}],
		createdAt: 1,
		updatedAt: 1,
	},
	isGenerating: false,
	inputValue: '继续主任务',
	selectedModelId: 'model-a',
	selectedModels: ['model-a'],
	enableReasoningToggle: true,
	enableWebSearchToggle: false,
	contextNotes: ['note-a'],
	selectedImages: ['img-a'],
	selectedFiles: [{
		id: 'docs/spec.md',
		name: 'spec.md',
		path: 'docs/spec.md',
		extension: 'md',
		type: 'file',
	}],
	selectedFolders: [{
		id: 'docs',
		name: 'docs',
		path: 'docs',
		type: 'folder',
	}],
	selectedText: '选中文本',
	selectedTextContext: {
		filePath: 'docs/spec.md',
		range: { from: 1, to: 4 },
		triggerSource: 'selection',
	},
	selectedPromptTemplate: {
		path: 'AI Prompts/main.md',
		name: 'main',
		content: '主模板',
	},
	shouldSaveHistory: true,
	multiModelMode: 'single',
	parallelResponses: undefined,
	layoutMode: 'horizontal',
	skillSessionState: null,
});

test('history api 可以冻结主任务并在技能结束后恢复', async () => {
	installObsidianStub();
	const { createChatServiceHistoryApi } = await import('./chat-service-history-api');
	const stateStore = createStateStore();
	let emitCount = 0;
	const queuedSessionIds: Array<string | null> = [];
	const internals = {
		stateStore,
		service: {
			emitState: () => {
				emitCount += 1;
			},
			queueSessionPlanSync: (session) => {
				queuedSessionIds.push(session?.id ?? null);
			},
		},
	} as ChatServiceInternals;

	const api = createChatServiceHistoryApi(internals);
	const invocation = api.freezeSkillMainTask({
		skillId: 'skills/code-audit',
		skillName: 'code-audit',
		executionMode: 'isolated_resume',
		isolatedSession: {
			id: 'chat-skill',
			title: '技能会话',
			modelId: 'model-a',
			messages: [],
			createdAt: 2,
			updatedAt: 2,
		},
		invocationId: 'invoke-1',
		timestamp: 100,
	});

	assert.equal(invocation.skillName, 'code-audit');
	assert.equal(
		stateStore.getMutableState().skillSessionState?.activeInvocation?.invocationId,
		'invoke-1',
	);

	stateStore.getMutableState().activeSession = {
		id: 'chat-skill',
		title: '技能会话',
		modelId: 'model-b',
		messages: [{
			id: 'skill-message-1',
			role: 'assistant',
			content: '技能结果',
			timestamp: 3,
		}],
		createdAt: 2,
		updatedAt: 3,
	};
	stateStore.getMutableState().inputValue = '技能输入';
	stateStore.getMutableState().selectedPromptTemplate = undefined;

	api.writeActiveSkillReturnPacket({
		invocationId: 'invoke-1',
		status: 'completed',
		content: '技能总结',
		messageCount: 1,
		producedAt: 200,
	});
	const restoredPacket = api.restoreSkillMainTask();

	assert.equal(restoredPacket?.content, '技能总结');
	assert.equal(stateStore.getMutableState().activeSession?.id, 'chat-main');
	assert.equal(stateStore.getMutableState().inputValue, '继续主任务');
	assert.equal(stateStore.getMutableState().selectedPromptTemplate?.name, 'main');
	assert.equal(stateStore.getMutableState().skillSessionState, null);
	assert.equal(emitCount, 3);
	assert.deepEqual(queuedSessionIds, ['chat-main']);
});
