import type { ToolDefinition, ToolExecutionRecord } from 'src/types/tool';
import type { ChatMessage, ChatSession, ChatSettings } from '../types/chat';
import type { FileContentOptions } from './file-content-service';
import type {
	ChatServiceInternals,
} from './chat-service-internals';
import {
	detectChatImageGenerationIntent,
	findProviderByTagExact,
	getDefaultProviderTag,
	getModelDisplayName,
	isCurrentModelSupportImageGeneration,
	normalizeOllamaBaseUrl,
	normalizeToolExecutionRecord,
	providerSupportsImageGeneration,
	resolveProvider,
	resolveProviderByTag,
	resolveSkillsSystemPromptBlock,
	rethrowImageGenerationError,
	showMcpNoticeOnce,
} from './chat-service-deps-support';

export const buildGenerationDeps = (internals: ChatServiceInternals) => ({
	state: internals.stateStore.getMutableState(),
	messageService: internals.messageService,
	imageResolver: internals.imageResolver,
	sessionManager: internals.sessionManager,
	ollamaCapabilityCache: internals.ollamaCapabilityCache,
	notify: (message: string, timeout?: number) => internals.obsidianApi.notify(message, timeout),
	getAvailableAttachmentPath: async (filename: string) =>
		await internals.obsidianApi.getAvailableAttachmentPath(filename),
	writeVaultBinary: async (filePath: string, content: ArrayBuffer) =>
		await internals.obsidianApi.writeVaultBinary(filePath, content),
	getDefaultProviderTag: () => getDefaultProviderTag(internals),
	findProviderByTagExact: (tag?: string) => findProviderByTagExact(internals, tag),
	getModelDisplayName: (provider: import('src/types/provider').ProviderSettings) =>
		getModelDisplayName(internals, provider),
	createSubAgentStateUpdater: (
		assistantMessage: ChatMessage,
		session: ChatSession,
		shouldAttachToSession: boolean,
	) => internals.service.createSubAgentStateUpdater(assistantMessage, session, shouldAttachToSession),
	resolveToolRuntime: (options?: Parameters<typeof internals.service.resolveToolRuntime>[0]) =>
		internals.service.resolveToolRuntime(options),
	buildProviderMessagesWithOptions: (
		session: ChatSession,
		options?: Parameters<typeof internals.service.buildProviderMessagesWithOptions>[1],
	) => internals.service.buildProviderMessagesWithOptions(session, options),
	normalizeToolExecutionRecord: (record: ToolExecutionRecord) =>
		normalizeToolExecutionRecord(internals, record),
	showMcpNoticeOnce: (message: string) => showMcpNoticeOnce(internals, message),
	getOllamaCapabilities: async (baseURL: string, model: string) =>
		await internals.service.getOllamaCapabilities(baseURL, model),
	normalizeOllamaBaseUrl: (baseURL?: string) => normalizeOllamaBaseUrl(internals, baseURL),
	providerSupportsImageGeneration: (provider: import('src/types/provider').ProviderSettings) =>
		providerSupportsImageGeneration(internals, provider),
	rethrowImageGenerationError: (error: unknown): never => rethrowImageGenerationError(error),
	saveActiveSession: () => internals.service.saveActiveSession(),
	emitState: () => internals.service.emitState(),
	getController: () => internals.controller,
	setController: (controller: AbortController | null) => {
		internals.controller = controller;
	},
});

export const buildMessageOperationDeps = (internals: ChatServiceInternals) => ({
	state: internals.stateStore.getMutableState(),
	imageResolver: internals.imageResolver,
	attachmentSelectionService: internals.attachmentSelectionService,
	messageService: internals.messageService,
	sessionManager: internals.sessionManager,
	multiModelService: internals.multiModelService,
	notify: (message: string, timeout?: number) => internals.obsidianApi.notify(message, timeout),
	buildGlobalSystemPrompt: async (featureId: string) =>
		await internals.obsidianApi.buildGlobalSystemPrompt(featureId),
	emitState: () => internals.service.emitState(),
	createNewSession: () => internals.service.createNewSession(),
	syncSessionMultiModelState: (session?: ChatSession) =>
		internals.service.syncSessionMultiModelState(session),
	consumePendingTriggerSource: () => internals.service.consumePendingTriggerSource(),
	resolveProvider: () => resolveProvider(internals),
	detectImageGenerationIntent: (content: string) => detectChatImageGenerationIntent(content),
	isCurrentModelSupportImageGeneration: () => isCurrentModelSupportImageGeneration(internals),
	ensurePlanSyncReady: () => internals.service.ensurePlanSyncReady(),
	generateAssistantResponse: async (session: ChatSession) => {
		await internals.service.generateAssistantResponse(session);
	},
});

export const buildMessageMutationDeps = (internals: ChatServiceInternals) => ({
	state: internals.stateStore.getMutableState(),
	sessionManager: internals.sessionManager,
	multiModelService: internals.multiModelService,
	emitState: () => internals.service.emitState(),
	notify: (message: string, timeout?: number) => internals.obsidianApi.notify(message, timeout),
	insertTextIntoMarkdownEditor: (content: string) =>
		internals.obsidianApi.insertTextIntoMarkdownEditor(content),
	invalidateSessionContextCompaction: (session: ChatSession) =>
		internals.service.invalidateSessionContextCompaction(session),
	queueSessionPlanSync: (session: ChatSession | null) =>
		internals.service.queueSessionPlanSync(session),
	generateAssistantResponse: async (session: ChatSession) => {
		await internals.service.generateAssistantResponse(session);
	},
	detectImageGenerationIntent: (content: string) => detectChatImageGenerationIntent(content),
	isCurrentModelSupportImageGeneration: () => isCurrentModelSupportImageGeneration(internals),
});

export const getProviderMessageDeps = (internals: ChatServiceInternals) => ({
	buildGlobalSystemPrompt: async (featureId: string) =>
		await internals.obsidianApi.buildGlobalSystemPrompt(featureId),
	getActiveFilePath: () => internals.obsidianApi.getActiveFilePath(),
	state: internals.stateStore.getMutableState(),
	settings: internals.settings,
	pluginChatSettings: internals.settingsAccessor.getChatSettings(),
	messageService: internals.messageService,
	messageContextOptimizer: internals.messageContextOptimizer,
	contextCompactionService: internals.contextCompactionService,
	getDefaultProviderTag: () => getDefaultProviderTag(internals),
	resolveProviderByTag: (tag?: string) => resolveProviderByTag(internals, tag),
	findProviderByTagExact: (tag?: string) => findProviderByTagExact(internals, tag),
	resolveSkillsSystemPromptBlock: async (requestTools: ToolDefinition[]) =>
		await resolveSkillsSystemPromptBlock(internals, requestTools),
	persistSessionContextCompactionFrontmatter: async (session: ChatSession) =>
		await internals.service.persistSessionContextCompactionFrontmatter(session),
});

export const getChatPersistenceDeps = (internals: ChatServiceInternals) => ({
	settingsAccessor: internals.settingsAccessor,
	obsidianApi: internals.obsidianApi,
	runtimeDeps: internals.runtimeDeps,
	state: internals.stateStore.getMutableState(),
	sessionManager: internals.sessionManager,
	toolRuntimeResolver: internals.toolRuntimeResolver,
	getDefaultProviderTag: () => getDefaultProviderTag(internals),
	updateSettings: (settings: Partial<ChatSettings>) => internals.service.updateSettings(settings),
	bindLivePlanStateSync: () => internals.service.bindLivePlanStateSync(),
	queueSessionPlanSync: (session: ChatSession | null) =>
		internals.service.queueSessionPlanSync(session),
	persistSessionContextCompactionFrontmatter: (session: ChatSession) =>
		internals.service.persistSessionContextCompactionFrontmatter(session),
	saveActiveSession: () => internals.service.saveActiveSession(),
	layoutModeStorageKey: 'openchat-chat-layout-mode',
});

export const getDefaultFileContentOptions = (
	internals: ChatServiceInternals,
): FileContentOptions => {
	return internals.service.getProviderMessageFacade().getDefaultFileContentOptions();
};
