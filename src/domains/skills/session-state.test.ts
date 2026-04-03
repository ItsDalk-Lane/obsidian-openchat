import assert from 'node:assert/strict';
import test from 'node:test';
import type { ChatState } from 'src/domains/chat/types';
import {
	beginSkillSession,
	restoreMainTaskState,
	writeSkillReturnPacket,
} from './session-state';

const createChatState = (): ChatState => ({
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
		multiModelMode: 'single',
		layoutMode: 'horizontal',
		livePlan: null,
		contextCompaction: null,
		requestTokenState: null,
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
	error: 'old-error',
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

test('session-state 可以冻结主任务、写回返回包并恢复主状态', () => {
	const state = createChatState();
	const skillSessionState = beginSkillSession(state, {
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
		timestamp: 100,
		invocationId: 'invoke-1',
	});

	assert.equal(skillSessionState.activeInvocation?.status, 'running');
	assert.equal(
		skillSessionState.activeInvocation?.mainTask.state.inputValue,
		'继续主任务',
	);
	assert.equal(
		skillSessionState.activeInvocation?.mainTask.state.selectedPromptTemplate?.name,
		'main',
	);

	state.activeSession = {
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
	state.inputValue = '技能输入';
	state.selectedPromptTemplate = undefined;
	state.skillSessionState = writeSkillReturnPacket(skillSessionState, {
		invocationId: 'invoke-1',
		status: 'completed',
		content: '技能总结',
		messageCount: 1,
		producedAt: 200,
	});

	const returnPacket = restoreMainTaskState(state, state.skillSessionState);

	assert.equal(returnPacket?.content, '技能总结');
	assert.equal(returnPacket?.status, 'completed');
	assert.equal(state.activeSession?.id, 'chat-main');
	assert.equal(state.inputValue, '继续主任务');
	assert.equal(
		(state.selectedPromptTemplate as { name?: string } | undefined)?.name,
		'main',
	);
	assert.equal(state.skillSessionState, null);
	assert.equal(state.isGenerating, false);
});

test('writeSkillReturnPacket 会拒绝错误的 invocationId', () => {
	const state = createChatState();
	const skillSessionState = beginSkillSession(state, {
		skillId: 'skills/code-audit',
		skillName: 'code-audit',
		executionMode: 'isolated_resume',
		invocationId: 'invoke-1',
		timestamp: 100,
	});

	assert.throws(
		() => writeSkillReturnPacket(skillSessionState, {
			invocationId: 'invoke-2',
			status: 'failed',
			content: '技能失败',
		}),
		/invocation/i,
	);
});
