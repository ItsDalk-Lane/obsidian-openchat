import {
	createChatGenerationFacade,
	type ChatGenerationFacade,
} from './chat-generation-facade';
import {
	createChatMessageMutationFacade,
	createChatMessageOperationFacade,
	type ChatMessageMutationFacade,
	type ChatMessageOperationFacade,
} from './chat-message-facade';
import {
	createChatProviderMessageFacade,
	type ChatProviderMessageFacade,
} from './chat-provider-message-facade';
import {
	createChatPersistenceFacade,
	type ChatPersistenceFacade,
} from './chat-persistence-facade';
import {
	createChatCommandFacade,
	type ChatCommandFacade,
} from './chat-command-facade';
import type { ChatServiceInternals } from './chat-service-internals';
import {
	executeSkillCommand as executeSkillCommandHelper,
	executeSubAgentCommand as executeSubAgentCommandHelper,
} from './chat-commands';
import {
	generateAssistantResponse as generateAssistantResponseHelper,
	generateAssistantResponseForModel as generateAssistantResponseForModelHelper,
} from './chat-generation';
import {
	buildProviderMessages as buildProviderMessagesHelper,
	buildProviderMessagesForAgent as buildProviderMessagesForAgentHelper,
	buildProviderMessagesWithOptions as buildProviderMessagesWithOptionsHelper,
	getChatDefaultFileContentOptions as getChatDefaultFileContentOptionsHelper,
	getChatMessageManagementSettings as getChatMessageManagementSettingsHelper,
	resolveChatContextBudget as resolveChatContextBudgetHelper,
} from './chat-provider-messages';
import {
	prepareChatRequest as prepareChatRequestHelper,
	sendMessage as sendMessageHelper,
} from './chat-message-operations';
import {
	deleteMessage as deleteMessageHelper,
	editAndRegenerate as editAndRegenerateHelper,
	editMessage as editMessageHelper,
	insertMessageToEditor as insertMessageToEditorHelper,
	refreshProviderSettings as refreshProviderSettingsHelper,
	regenerateFromMessage as regenerateFromMessageHelper,
	togglePinnedMessage as togglePinnedMessageHelper,
} from './chat-message-mutations';
import {
	persistActiveSessionMultiModelFrontmatter as persistActiveSessionMultiModelFrontmatterHelper,
	persistChatSettings as persistChatSettingsHelper,
	persistGlobalSystemPromptsEnabled as persistGlobalSystemPromptsEnabledHelper,
	persistLayoutMode as persistLayoutModeHelper,
	persistMcpSettings as persistMcpSettingsHelper,
	persistSessionMultiModelFrontmatter as persistSessionMultiModelFrontmatterHelper,
	readPersistedLayoutMode as readPersistedLayoutModeHelper,
	restoreMultiModelStateFromSession as restoreMultiModelStateFromSessionHelper,
	rewriteSessionMessages as rewriteSessionMessagesHelper,
	syncSessionMultiModelState as syncSessionMultiModelStateHelper,
} from './chat-settings-persistence';
import {
	getChatPersistenceDeps,
	buildGenerationDeps,
	buildMessageMutationDeps,
	buildMessageOperationDeps,
	getProviderMessageDeps,
} from './chat-service-dependency-builders';

export const getGenerationFacade = (internals: ChatServiceInternals): ChatGenerationFacade => {
	if (!internals.generationFacade) {
		internals.generationFacade = createChatGenerationFacade(
			() => buildGenerationDeps(internals),
			{
				generateAssistantResponse: generateAssistantResponseHelper,
				generateAssistantResponseForModel: generateAssistantResponseForModelHelper,
			},
		);
	}
	return internals.generationFacade;
};

export const getMessageOperationFacade = (
	internals: ChatServiceInternals,
): ChatMessageOperationFacade => {
	if (!internals.messageOperationFacade) {
		internals.messageOperationFacade = createChatMessageOperationFacade(
			() => buildMessageOperationDeps(internals),
			{
				prepareChatRequest: prepareChatRequestHelper,
				sendMessage: sendMessageHelper,
			},
		);
	}
	return internals.messageOperationFacade;
};

export const getMessageMutationFacade = (
	internals: ChatServiceInternals,
): ChatMessageMutationFacade => {
	if (!internals.messageMutationFacade) {
		internals.messageMutationFacade = createChatMessageMutationFacade(
			() => buildMessageMutationDeps(internals),
			{
				editMessage: editMessageHelper,
				editAndRegenerate: editAndRegenerateHelper,
				deleteMessage: deleteMessageHelper,
				togglePinnedMessage: togglePinnedMessageHelper,
				insertMessageToEditor: insertMessageToEditorHelper,
				regenerateFromMessage: regenerateFromMessageHelper,
				refreshProviderSettings: refreshProviderSettingsHelper,
			},
		);
	}
	return internals.messageMutationFacade;
};

export const getProviderMessageFacade = (
	internals: ChatServiceInternals,
): ChatProviderMessageFacade => {
	if (!internals.providerMessageFacade) {
		internals.providerMessageFacade = createChatProviderMessageFacade(
			() => getProviderMessageDeps(internals),
			{
				buildProviderMessages: buildProviderMessagesHelper,
				buildProviderMessagesWithOptions: buildProviderMessagesWithOptionsHelper,
				buildProviderMessagesForAgent: buildProviderMessagesForAgentHelper,
				getMessageManagementSettings: getChatMessageManagementSettingsHelper,
				getDefaultFileContentOptions: getChatDefaultFileContentOptionsHelper,
				resolveContextBudget: resolveChatContextBudgetHelper,
			},
		);
	}
	return internals.providerMessageFacade;
};

export const getPersistenceFacade = (
	internals: ChatServiceInternals,
): ChatPersistenceFacade => {
	if (!internals.persistenceFacade) {
		internals.persistenceFacade = createChatPersistenceFacade(
			() => getChatPersistenceDeps(internals),
			{
				persistChatSettings: persistChatSettingsHelper,
				persistGlobalSystemPromptsEnabled: persistGlobalSystemPromptsEnabledHelper,
				persistMcpSettings: persistMcpSettingsHelper,
				rewriteSessionMessages: rewriteSessionMessagesHelper,
				readPersistedLayoutMode: readPersistedLayoutModeHelper,
				persistLayoutMode: persistLayoutModeHelper,
				syncSessionMultiModelState: (deps, session) =>
					syncSessionMultiModelStateHelper(deps.state, session),
				persistActiveSessionMultiModelFrontmatter:
					persistActiveSessionMultiModelFrontmatterHelper,
				persistSessionMultiModelFrontmatter:
					persistSessionMultiModelFrontmatterHelper,
				restoreMultiModelStateFromSession:
					restoreMultiModelStateFromSessionHelper,
			},
		);
	}
	return internals.persistenceFacade;
};

export const ensureCommandFacade = (internals: ChatServiceInternals): ChatCommandFacade => {
	if (!internals.commandFacade) {
		internals.commandFacade = createChatCommandFacade(
			{
				getExecuteSkillCommandParams: () => ({
					obsidianApi: internals.obsidianApi,
					state: internals.stateStore.getMutableState(),
					emitState: () => internals.service.emitState(),
					loadInstalledSkills: async () => await internals.service.loadInstalledSkills(),
					sendMessage: async (content?: string) => await internals.service.sendMessage(content),
				}),
				getExecuteSubAgentCommandParams: () => ({
					state: internals.stateStore.getMutableState(),
					notify: (message: string, timeout?: number) =>
						internals.obsidianApi.notify(message, timeout),
					providers: internals.settingsAccessor.getAiRuntimeSettings().providers,
					loadInstalledSubAgents:
						async () => await internals.service.loadInstalledSubAgents(),
					prepareChatRequest: async (
						content: string,
						options?: { skipImageSupportValidation?: boolean },
					) => await internals.service.prepareChatRequest(content, options),
					ensurePlanSyncReady: async () => await internals.service.ensurePlanSyncReady(),
					resolveProvider: () => internals.service.resolveProvider(),
					getDefaultProviderTag: () => internals.service.getDefaultProviderTag(),
					generateAssistantResponseForModel: async (session, modelTag, options) =>
						await internals.service.generateAssistantResponseForModel(session, modelTag, options),
					emitState: () => internals.service.emitState(),
				}),
			},
			{
				executeSkillCommand: executeSkillCommandHelper,
				executeSubAgentCommand: executeSubAgentCommandHelper,
			},
		);
	}
	return internals.commandFacade;
};
