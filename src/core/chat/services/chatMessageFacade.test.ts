import assert from 'node:assert/strict';
import test from 'node:test';
import {
	createChatMessageMutationFacade,
	createChatMessageOperationFacade,
} from './chat-message-facade';
import type { ChatMessageOperationDeps } from './chat-message-operations';
import type { ChatMessageMutationDeps } from './chat-message-mutations';
import type { MultiModelChatService } from './multi-model-chat-service';

const createOperationDeps = (
	multiModelService: MultiModelChatService | null,
): ChatMessageOperationDeps => ({
	state: null as never,
	imageResolver: null as never,
	attachmentSelectionService: null as never,
	messageService: null as never,
	sessionManager: null as never,
	multiModelService,
	notify: () => {},
	emitState: () => {},
	createNewSession: () => null as never,
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

const createMutationDeps = (
	multiModelService: MultiModelChatService | null,
): ChatMessageMutationDeps => ({
	state: null as never,
	sessionManager: null as never,
	multiModelService,
	emitState: () => {},
	notify: () => {},
	insertTextIntoMarkdownEditor: () => ({ inserted: false }),
	invalidateSessionContextCompaction: () => {},
	queueSessionPlanSync: () => {},
	generateAssistantResponse: async () => {},
	detectImageGenerationIntent: () => false,
	isCurrentModelSupportImageGeneration: () => false,
});

test('createChatMessageOperationFacade 每次调用都读取最新 multiModelService', async () => {
	let multiModelService: MultiModelChatService | null = null;
	let capturedService: MultiModelChatService | null | undefined;
	let getterCalls = 0;

	const facade = createChatMessageOperationFacade(
		() => {
			getterCalls += 1;
			return createOperationDeps(multiModelService);
		},
		{
			prepareChatRequest: async (deps) => {
				capturedService = deps.multiModelService;
				return null;
			},
			sendMessage: async (deps) => {
				capturedService = deps.multiModelService;
			},
			saveSkillExecutionResult: async (deps) => {
				capturedService = deps.multiModelService;
			},
		},
	);

	await facade.sendMessage('first');
	assert.equal(capturedService, null);

	multiModelService = { sendCompareMessage: async () => {} } as never;
	await facade.sendMessage('second');

	assert.equal(capturedService, multiModelService);
	assert.equal(getterCalls, 2);
	assert.equal(await facade.prepareChatRequest('third'), null);
	assert.equal(getterCalls, 3);
	assert.equal(capturedService, multiModelService);
});

test('createChatMessageMutationFacade 每次调用都读取最新 multiModelService', async () => {
	let multiModelService: MultiModelChatService | null = null;
	let capturedService: MultiModelChatService | null | undefined;
	let getterCalls = 0;

	const facade = createChatMessageMutationFacade(
		() => {
			getterCalls += 1;
			return createMutationDeps(multiModelService);
		},
		{
			editMessage: async (deps) => {
				capturedService = deps.multiModelService;
			},
			editAndRegenerate: async (deps) => {
				capturedService = deps.multiModelService;
			},
			deleteMessage: async (deps) => {
				capturedService = deps.multiModelService;
			},
			togglePinnedMessage: async (deps) => {
				capturedService = deps.multiModelService;
			},
			insertMessageToEditor: (deps) => {
				capturedService = deps.multiModelService;
			},
			regenerateFromMessage: async (deps) => {
				capturedService = deps.multiModelService;
			},
			refreshProviderSettings: (deps) => {
				capturedService = deps.multiModelService;
			},
		},
	);

	await facade.deleteMessage('first');
	assert.equal(capturedService, null);

	multiModelService = { retryModel: async () => {} } as never;
	await facade.regenerateFromMessage('second');

	assert.equal(capturedService, multiModelService);
	assert.equal(getterCalls, 2);
	facade.refreshProviderSettings({ providers: [] } as never);
	assert.equal(getterCalls, 3);
	assert.equal(capturedService, multiModelService);
});
