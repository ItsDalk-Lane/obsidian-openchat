import assert from 'node:assert/strict';
import test from 'node:test';
import { ChatStateStore } from './chat-state-store';
import { createChatSkillExecutionService } from './chat-skill-execution';
import type { ChatServiceInternals } from './chat-service-internals';
import type { ChatSession } from '../types/chat';
import type {
	LoadedSkillContent,
	SkillDefinition,
	SkillScanResult,
} from 'src/domains/skills/types';
import type { GenerateAssistantOptions } from './chat-service-types';
import type { ResolvedToolRuntime } from 'src/tools/sub-agents/types';

const SKILL: SkillDefinition = {
	metadata: {
		name: 'code-audit',
		description: '审查代码实现',
		execution: { mode: 'isolated_resume' },
	},
	skillFilePath: 'System/AI Data/skills/code-audit/SKILL.md',
	basePath: 'System/AI Data/skills/code-audit',
};

const LOADED_SKILL: LoadedSkillContent = {
	definition: SKILL,
	fullContent: '---\nname: code-audit\n---\n请审查下面的实现',
	bodyContent: '请审查下面的实现',
};

const createStateStore = () => new ChatStateStore({
	activeSession: {
		id: 'chat-main',
		title: '主任务',
		modelId: 'model-a',
		messages: [{
			id: 'user-main',
			role: 'user',
			content: '请继续主任务',
			timestamp: 1,
		}],
		createdAt: 1,
		updatedAt: 1,
		selectedFiles: [{
			id: 'docs/spec.md',
			name: 'spec.md',
			path: 'docs/spec.md',
			extension: 'md',
			type: 'file',
		}],
	},
	isGenerating: false,
	inputValue: '继续主任务',
	selectedModelId: 'model-a',
	selectedModels: ['model-a'],
	enableReasoningToggle: false,
	enableWebSearchToggle: false,
	contextNotes: ['note-a'],
	selectedImages: [],
	selectedFiles: [{
		id: 'docs/spec.md',
		name: 'spec.md',
		path: 'docs/spec.md',
		extension: 'md',
		type: 'file',
	}],
	selectedFolders: [],
	selectedText: '选中文本',
	selectedTextContext: {
		filePath: 'docs/spec.md',
		range: { from: 1, to: 4 },
		triggerSource: 'selection',
	},
	shouldSaveHistory: true,
	multiModelMode: 'single',
	parallelResponses: undefined,
	layoutMode: 'horizontal',
	skillSessionState: null,
});

test('createChatSkillExecutionService 的 inline 模式复用现有 sendMessage 主干', async () => {
	const stateStore = createStateStore();
	const sentMessages: string[] = [];
	const internals = {
		stateStore,
		runtimeDeps: {
			getSkillScannerService: () => ({
				findByName: () => SKILL,
				loadSkillContent: async () => LOADED_SKILL,
			}),
			ensureSkillsInitialized: async () => {},
			scanSkills: async () => ({ skills: [SKILL], errors: [] }),
		},
		service: {
			createNewSession: () => stateStore.getMutableState().activeSession!,
			sendMessage: async (content?: string) => {
				sentMessages.push(content ?? '');
				stateStore.getMutableState().activeSession?.messages.push({
					id: 'assistant-inline',
					role: 'assistant',
					content: 'inline-result',
					timestamp: 2,
				});
			},
		},
	} as unknown as ChatServiceInternals;

	const executionService = createChatSkillExecutionService(internals);
	const packet = await executionService.execute({
		skillName: 'code-audit',
		args: '请检查改动',
		executionMode: 'inline',
		trigger: 'slash_command',
	});

	assert.deepEqual(sentMessages, ['请检查改动']);
	assert.equal(stateStore.getMutableState().selectedPromptTemplate?.name, 'code-audit');
	assert.equal(packet.content, 'inline-result');
	assert.equal(packet.status, 'completed');
});

test('createChatSkillExecutionService 的 isolated 模式会构建独立会话并传入全量静态工具 runtime', async () => {
	const stateStore = createStateStore();
	let generatedSessionId = '';
	let generatedContext = '';
	let generatedTaskDescription = '';
	let generatedRuntime: ResolvedToolRuntime | undefined;
	const scanResult: SkillScanResult = { skills: [SKILL], errors: [] };
	const internals = {
		stateStore,
		messageService: {
			createMessage: (role: 'user' | 'assistant', content: string, extras?: Record<string, unknown>) => ({
				id: `${role}-${Date.now()}`,
				role,
				content,
				timestamp: 1,
				images: (extras?.images as string[]) ?? [],
				metadata: (extras?.metadata as Record<string, unknown>) ?? {},
				isError: false,
				toolCalls: [],
			}),
		},
		runtimeDeps: {
			getSkillScannerService: () => ({
				findByName: () => SKILL,
				loadSkillContent: async () => LOADED_SKILL,
			}),
			ensureSkillsInitialized: async () => {},
			scanSkills: async () => ({ skills: [SKILL], errors: scanResult.errors }),
		},
		service: {
			getCurrentModelTag: () => 'model-a',
			getDefaultProviderTag: () => 'model-a',
			generateAssistantResponseForModel: async (
				session: ChatSession,
				_modelTag: string,
				options?: GenerateAssistantOptions,
			) => {
				generatedSessionId = session.id;
				generatedContext = options?.context ?? '';
				generatedTaskDescription = options?.taskDescription ?? '';
				generatedRuntime = options?.toolRuntimeOverride;
				const message = {
					id: 'assistant-isolated',
					role: 'assistant' as const,
					content: 'isolated-result',
					timestamp: 2,
				};
				if (options?.createMessageInSession) {
					session.messages.push(message);
				}
				return message;
			},
			freezeSkillMainTask: () => ({
				invocationId: 'invoke-1',
				skillId: SKILL.skillFilePath,
				skillName: SKILL.metadata.name,
				executionMode: 'isolated_resume',
				startedAt: 1,
				updatedAt: 1,
				status: 'running',
				mainTask: {
					frameId: 'main-1',
					sessionId: 'chat-main',
					capturedAt: 1,
					state: stateStore.getMutableState(),
				},
				isolatedSession: null,
				returnPacket: null,
			}),
			writeActiveSkillReturnPacket: () => ({
				invocationId: 'invoke-1',
				skillId: SKILL.skillFilePath,
				skillName: SKILL.metadata.name,
				executionMode: 'isolated_resume',
				startedAt: 1,
				updatedAt: 1,
				status: 'returned',
				mainTask: {
					frameId: 'main-1',
					sessionId: 'chat-main',
					capturedAt: 1,
					state: stateStore.getMutableState(),
				},
				isolatedSession: null,
				returnPacket: null,
			}),
			restoreSkillMainTask: () => ({
				invocationId: 'invoke-1',
				skillId: SKILL.skillFilePath,
				skillName: SKILL.metadata.name,
				status: 'completed' as const,
				content: 'isolated-result',
				sessionId: generatedSessionId,
				messageCount: 2,
				producedAt: 3,
			}),
		},
	} as unknown as ChatServiceInternals;

	const executionService = createChatSkillExecutionService(internals);
	const packet = await executionService.execute({
		skillName: 'code-audit',
		trigger: 'invoke_skill',
	});

	assert.equal(packet.content, 'isolated-result');
	assert.ok(generatedSessionId.startsWith('skill-session-'));
	assert.match(generatedContext, /主任务当前输入/);
	assert.match(generatedContext, /主任务最近用户消息/);
	assert.equal(generatedTaskDescription, '执行 Skill: code-audit');
	assert.equal(generatedRuntime, undefined);
});

test('createChatSkillExecutionService 会拒绝执行已禁用的 Skill', async () => {
	const stateStore = createStateStore();
	let sendCalls = 0;
	const disabledSkill: SkillDefinition = {
		...SKILL,
		metadata: {
			...SKILL.metadata,
			enabled: false,
		},
	};
	const internals = {
		stateStore,
		runtimeDeps: {
			getSkillScannerService: () => ({
				findByName: (_name: string, options?: { includeDisabled?: boolean }) => {
					return options?.includeDisabled ? disabledSkill : undefined;
				},
				loadSkillContent: async () => ({
					...LOADED_SKILL,
					definition: disabledSkill,
				}),
				scanRuntimeSkills: async () => ({ skills: [], errors: [] }),
			}),
			ensureSkillsInitialized: async () => {},
			scanSkills: async () => ({ skills: [disabledSkill], errors: [] }),
		},
		service: {
			createNewSession: () => stateStore.getMutableState().activeSession!,
			sendMessage: async () => {
				sendCalls += 1;
			},
		},
	} as unknown as ChatServiceInternals;

	const executionService = createChatSkillExecutionService(internals);
	const packet = await executionService.execute({
		skillName: 'code-audit',
		executionMode: 'inline',
		trigger: 'slash_command',
	});

	assert.equal(packet.status, 'failed');
	assert.match(packet.content, /已禁用/);
	assert.equal(sendCalls, 0);
});
