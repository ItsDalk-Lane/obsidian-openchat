import assert from 'node:assert/strict';
import test from 'node:test';
import type { ChatSession, ChatState } from '../types/chat';
import {
	prepareChatRequest,
	type ChatMessageOperationDeps,
} from './chat-message-operations';

const createSession = (): ChatSession => ({
	id: 'session-1',
	title: 'Chat',
	modelId: 'model-a',
	messages: [],
	createdAt: 1,
	updatedAt: 1,
});

const createState = (overrides: Partial<ChatState> = {}): ChatState => ({
	activeSession: null,
	isGenerating: false,
	inputValue: '',
	selectedModelId: 'model-a',
	selectedModels: ['model-a'],
	enableReasoningToggle: false,
	enableWebSearchToggle: false,
	contextNotes: [],
	selectedImages: [],
	selectedFiles: [],
	selectedFolders: [],
	shouldSaveHistory: false,
	multiModelMode: 'single',
	layoutMode: 'horizontal',
	...overrides,
});

const createDeps = (
	state: ChatState,
	session: ChatSession,
): ChatMessageOperationDeps => ({
	state,
	imageResolver: {
		resolveImagesFromInputReferences: async () => [],
		mergeSelectedImages: (currentImages: string[]) => [...currentImages],
	} as never,
	attachmentSelectionService: {
		syncSelectionToSession: () => {},
		getSelectionSnapshot: () => ({ selectedFiles: [], selectedFolders: [] }),
		clearSelection: () => {},
	} as never,
	messageService: {
		createMessage: (role, content, extras) => ({
			id: 'message-1',
			role,
			content: content.trim(),
			timestamp: 1,
			images: extras?.images ?? [],
			isError: extras?.isError ?? false,
			metadata: extras?.metadata ?? {},
			toolCalls: extras?.toolCalls ?? [],
		}),
	} as never,
	sessionManager: null as never,
	multiModelService: null,
	notify: () => {},
	emitState: () => {},
	createNewSession: () => session,
	syncSessionMultiModelState: () => {},
	consumePendingTriggerSource: () => 'chat_input',
	resolveProvider: () => null,
	detectImageGenerationIntent: () => false,
	isCurrentModelSupportImageGeneration: () => false,
	ensurePlanSyncReady: async () => {},
	generateAssistantResponse: async () => {},
});

test('prepareChatRequest 将选中模板作为用户消息的一部分发送', async () => {
	const session = createSession();
	const state = createState({
		activeSession: session,
		selectedPromptTemplate: {
			path: 'AI Prompts/review.md',
			name: 'review',
			content: '请审查下面的实现：{{}}',
		},
		selectedText: '代码片段',
	});

	const prepared = await prepareChatRequest(
		createDeps(state, session),
		'请检查这个改动',
	);

	assert.ok(prepared)
	assert.equal(prepared?.userMessage.content, '请检查这个改动\n\n[[review]]')
	assert.equal(prepared?.userMessage.metadata?.taskUserInput, '请检查这个改动')
	assert.equal(prepared?.userMessage.metadata?.taskTemplate, '请审查下面的实现：{{}}')
	assert.equal(state.selectedPromptTemplate, undefined)
	assert.equal(session.messages.length, 1)
})

test('prepareChatRequest 在只有模板时也会生成用户消息', async () => {
	const session = createSession();
	const state = createState({
		activeSession: session,
		selectedPromptTemplate: {
			path: 'AI Prompts/skill.md',
			name: 'skill',
			content: '只执行模板内容',
		},
	});

	const prepared = await prepareChatRequest(createDeps(state, session), '')

	assert.ok(prepared)
	assert.equal(prepared?.userMessage.content, '[[skill]]')
	assert.equal(prepared?.userMessage.metadata?.taskUserInput, '')
	assert.equal(prepared?.userMessage.metadata?.taskTemplate, '只执行模板内容')
	assert.equal(session.messages.length, 1)
})
