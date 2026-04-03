import assert from 'node:assert/strict';
import test from 'node:test';
import type { SkillReturnPacket } from 'src/domains/skills/session-state';
import type { ChatSession, ChatState } from '../types/chat';
import {
	saveSkillExecutionResult,
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
	selectedTextContext: undefined,
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
		createMessage: (
			role: ChatSession['messages'][number]['role'],
			content: string,
			extras?: {
				images?: string[];
				isError?: boolean;
				metadata?: Record<string, unknown>;
				toolCalls?: unknown[];
			},
		) => ({
			id: 'message-1',
			role,
			content: content.trim(),
			timestamp: 1,
			images: extras?.images ?? [],
			isError: extras?.isError ?? false,
			metadata: extras?.metadata ?? {},
			toolCalls: (extras?.toolCalls ?? []) as never[],
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
	saveActiveSession: async () => {},
	queueSessionPlanSync: () => {},
});

const createPacket = (overrides: Partial<SkillReturnPacket> = {}): SkillReturnPacket => ({
	invocationId: 'invoke-1',
	skillId: 'skills/code-audit/SKILL.md',
	skillName: 'code-audit',
	status: 'completed',
	content: 'isolated-result',
	sessionId: 'skill-session-1',
	messageCount: 2,
	producedAt: 10,
	metadata: { executionMode: 'isolated_resume' },
	...overrides,
})

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

test('prepareChatRequest 会把选区范围和文件路径写入用户消息 metadata', async () => {
	const session = createSession();
	const state = createState({
		activeSession: session,
		selectedText: '代码片段',
		selectedTextContext: {
			filePath: 'docs/spec.md',
			range: { from: 8, to: 16 },
			triggerSource: 'selection',
		},
	});

	const prepared = await prepareChatRequest(createDeps(state, session), '请解释这里')

	assert.ok(prepared)
	assert.deepEqual(prepared?.userMessage.metadata?.selectedTextContext, {
		filePath: 'docs/spec.md',
		range: { from: 8, to: 16 },
		triggerSource: 'selection',
	})
	assert.equal(state.selectedTextContext, undefined)
})

test('saveSkillExecutionResult 会把 Skill 返回包追加到当前主会话', async () => {
	const session = createSession();
	const queuedSessions: Array<string | null> = [];
	let saveCalls = 0;
	const state = createState({
		activeSession: session,
		shouldSaveHistory: true,
	});

	await saveSkillExecutionResult(
		{
			...createDeps(state, session),
			saveActiveSession: async () => {
				saveCalls += 1
			},
			queueSessionPlanSync: (nextSession) => {
				queuedSessions.push(nextSession?.id ?? null)
			},
		},
		createPacket(),
	)

	const skillExecution = session.messages[0]?.metadata?.skillExecution as
		| { skillName?: string }
		| undefined
	assert.equal(session.messages.length, 1)
	assert.equal(session.messages[0]?.role, 'assistant')
	assert.equal(session.messages[0]?.content, 'isolated-result')
	assert.equal(skillExecution?.skillName, 'code-audit')
	assert.equal(saveCalls, 1)
	assert.deepEqual(queuedSessions, ['session-1'])
})

test('saveSkillExecutionResult 在没有活动会话时会创建新主会话', async () => {
	const session = createSession();
	let createdSessions = 0;
	const state = createState({
		activeSession: null,
		shouldSaveHistory: false,
	});

	await saveSkillExecutionResult(
		{
			...createDeps(state, session),
			createNewSession: () => {
				createdSessions += 1
				state.activeSession = session
				return session
			},
		},
		createPacket(),
	)

	assert.equal(createdSessions, 1)
	assert.equal(state.activeSession, session)
	assert.equal(session.messages[0]?.content, 'isolated-result')
})

test('saveSkillExecutionResult 对同一返回包重复应用时不会重复追加消息', async () => {
	const session = createSession();
	const state = createState({
		activeSession: session,
		shouldSaveHistory: false,
	});
	const deps = createDeps(state, session)
	const packet = createPacket()

	await saveSkillExecutionResult(deps, packet)
	await saveSkillExecutionResult(deps, packet)

	const skillExecution = session.messages[0]?.metadata?.skillExecution as
		| { invocationId?: string }
		| undefined
	assert.equal(session.messages.length, 1)
	assert.equal(skillExecution?.invocationId, 'invoke-1')
})
