import assert from 'node:assert/strict';
import test from 'node:test';
import {
	createChatGenerationFacade,
} from './chat-generation-facade';
import type { GenerateAssistantOptions } from './chat-service-types';
import type { ChatGenerationDeps } from './chat-generation';

const createGenerationDeps = (
	selectedModelId: string | null,
	controller: AbortController | null,
): ChatGenerationDeps => ({
	state: {
		selectedModelId,
	} as never,
	messageService: null as never,
	imageResolver: null as never,
	sessionManager: null as never,
	ollamaCapabilityCache: new Map(),
	notify: () => {},
	getAvailableAttachmentPath: async () => '',
	writeVaultBinary: async () => {},
	getDefaultProviderTag: () => selectedModelId,
	findProviderByTagExact: () => null,
	getModelDisplayName: () => '',
	createSubAgentStateUpdater: () => (() => {}) as never,
	resolveToolRuntime: async () => null as never,
	buildProviderMessagesWithOptions: async () => [],
	normalizeToolExecutionRecord: (record) => record,
	showMcpNoticeOnce: () => {},
	getOllamaCapabilities: async () => null as never,
	normalizeOllamaBaseUrl: () => '',
	providerSupportsImageGeneration: () => false,
	rethrowImageGenerationError: (error: unknown): never => {
		throw error instanceof Error ? error : new Error(String(error));
	},
	saveActiveSession: async () => {},
	emitState: () => {},
	getController: () => controller,
	setController: () => {},
});

test('createChatGenerationFacade 每次调用都读取最新 generation deps', async () => {
	let selectedModelId: string | null = 'model-a';
	let controller: AbortController | null = null;
	let getterCalls = 0;
	let capturedModelId: string | null | undefined;
	let capturedController: AbortController | null | undefined;

	const facade = createChatGenerationFacade(
		() => {
			getterCalls += 1;
			return createGenerationDeps(selectedModelId, controller);
		},
		{
			generateAssistantResponse: async (deps) => {
				capturedModelId = deps.state.selectedModelId;
				capturedController = deps.getController();
			},
			generateAssistantResponseForModel: async (deps) => {
				capturedModelId = deps.state.selectedModelId;
				capturedController = deps.getController();
				return null as never;
			},
		},
	);

	await facade.generateAssistantResponse(null as never);
	assert.equal(capturedModelId, 'model-a');
	assert.equal(capturedController, null);

	selectedModelId = 'model-b';
	controller = new AbortController();
	await facade.generateAssistantResponse(null as never);

	assert.equal(capturedModelId, 'model-b');
	assert.equal(capturedController, controller);
	assert.equal(getterCalls, 2);
	await facade.generateAssistantResponseForModel(null as never, 'model-b');
	assert.equal(getterCalls, 3);
	assert.equal(capturedModelId, 'model-b');
	assert.equal(capturedController, controller);
});

test('createChatGenerationFacade 透传 modelTag 与 options', async () => {
	let capturedModelTag: string | undefined;
	let capturedOptions: GenerateAssistantOptions | undefined;

	const facade = createChatGenerationFacade(
		() => createGenerationDeps('model-c', null),
		{
			generateAssistantResponse: async () => {},
			generateAssistantResponseForModel: async (
				_deps,
				_session,
				modelTag,
				options,
			) => {
				capturedModelTag = modelTag;
				capturedOptions = options;
				return null as never;
			},
		},
	);

	const options: GenerateAssistantOptions = {
		context: 'ctx',
		taskDescription: 'task',
		manageGeneratingState: false,
	};

	await facade.generateAssistantResponseForModel(null as never, 'model-c', options);

	assert.equal(capturedModelTag, 'model-c');
	assert.deepEqual(capturedOptions, options);
});
