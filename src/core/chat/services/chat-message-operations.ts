import { localInstance } from 'src/i18n/locals';
import { DebugLogger } from 'src/utils/DebugLogger';
import type { ProviderSettings } from 'src/types/provider';
import type { ChatAttachmentSelectionService } from './chat-attachment-selection-service';
import type { ChatImageResolver } from './chat-image-resolver';
import type { ChatSessionManager } from './chat-session-manager';
import type { MessageService } from './message-service';
import type { MultiModelChatService } from './multi-model-chat-service';
import type { ChatTriggerSource, PreparedChatRequest } from './chat-service-types';
import type { ChatSession, ChatState } from '../types/chat';

export interface ChatMessageOperationDeps {
	state: ChatState;
	imageResolver: ChatImageResolver;
	attachmentSelectionService: ChatAttachmentSelectionService;
	messageService: MessageService;
	sessionManager: ChatSessionManager;
	multiModelService: MultiModelChatService | null;
	notify: (message: string, timeout?: number) => void;
	buildGlobalSystemPrompt: (featureId: string) => Promise<string>;
	emitState: () => void;
	createNewSession: () => ChatSession;
	syncSessionMultiModelState: (session?: ChatSession) => void;
	consumePendingTriggerSource: () => ChatTriggerSource;
	resolveProvider: () => ProviderSettings | null;
	detectImageGenerationIntent: (content: string) => boolean;
	isCurrentModelSupportImageGeneration: () => boolean;
	ensurePlanSyncReady: () => Promise<void>;
	generateAssistantResponse: (session: ChatSession) => Promise<void>;
}

export const prepareChatRequest = async (
	deps: ChatMessageOperationDeps,
	content?: string,
	options?: { skipImageSupportValidation?: boolean }
): Promise<PreparedChatRequest | null> => {
	if (deps.state.isGenerating) {
		deps.notify(localInstance.chat_request_in_progress);
		return null;
	}

	const contentToSend = content ?? deps.state.inputValue;
	const inputReferencedImages =
		await deps.imageResolver.resolveImagesFromInputReferences(contentToSend);
	if (inputReferencedImages.length > 0) {
		deps.state.selectedImages = deps.imageResolver.mergeSelectedImages(
			deps.state.selectedImages,
			inputReferencedImages
		);
	}

	const trimmed = contentToSend.trim();
	if (
		!trimmed
		&& deps.state.selectedImages.length === 0
		&& deps.state.selectedFiles.length === 0
		&& deps.state.selectedFolders.length === 0
	) {
		return null;
	}

	const originalUserInput = trimmed;
	const isImageGenerationIntent =
		deps.detectImageGenerationIntent(originalUserInput);
	const isModelSupportImageGeneration =
		deps.isCurrentModelSupportImageGeneration();

	if (
		!options?.skipImageSupportValidation
		&& isImageGenerationIntent
		&& !isModelSupportImageGeneration
	) {
		const provider = deps.resolveProvider();
		const modelName =
			provider?.options.model || localInstance.chat_current_model_fallback;
		deps.notify(
			localInstance.chat_image_generation_model_not_supported.replace(
				'{model}',
				modelName
			),
			10000
		);
		return null;
	}

	const session = deps.state.activeSession ?? deps.createNewSession();
	deps.syncSessionMultiModelState(session);
	deps.attachmentSelectionService.syncSelectionToSession(session);
	const triggerSource = deps.consumePendingTriggerSource();
	const selectionSnapshot =
		deps.attachmentSelectionService.getSelectionSnapshot();

	const selectedPromptTemplate = deps.state.selectedPromptTemplate;
	const useTemplateAsSystemPrompt =
		deps.state.enableTemplateAsSystemPrompt
		&& !!selectedPromptTemplate?.content;

	let finalUserMessage = originalUserInput;
	let taskTemplate: string | undefined;
	if (selectedPromptTemplate && !useTemplateAsSystemPrompt) {
		finalUserMessage = `${originalUserInput}\n\n[[${selectedPromptTemplate.name}]]`;
		taskTemplate = selectedPromptTemplate.content;
	}

	let systemPrompt: string | undefined;
	if (useTemplateAsSystemPrompt && selectedPromptTemplate) {
		systemPrompt = selectedPromptTemplate.content;
	} else {
		const built = await deps.buildGlobalSystemPrompt('ai_chat');
		if (built && built.trim().length > 0) {
			systemPrompt = built;
		}
	}

	let messageContent = finalUserMessage;
	if (
		selectionSnapshot.selectedFiles.length > 0
		|| selectionSnapshot.selectedFolders.length > 0
	) {
		const fileTags = selectionSnapshot.selectedFiles.map(
			(file) => `[[${file.name}]]`
		);
		const folderTags = selectionSnapshot.selectedFolders.map(
			(folder) => `#${folder.path}`
		);
		if (fileTags.length > 0 || folderTags.length > 0) {
			messageContent += `\n\n${[...fileTags, ...folderTags].join(' ')}`;
		}
	}

	const userMessage = deps.messageService.createMessage('user', messageContent, {
		images: deps.state.selectedImages,
		metadata: {
			taskUserInput: originalUserInput,
			taskTemplate,
			selectedText: deps.state.selectedText,
			triggerSource,
		},
	});

	if (messageContent.trim() || deps.state.selectedImages.length > 0) {
		session.messages.push(userMessage);
	}
	session.updatedAt = Date.now();
	session.systemPrompt = systemPrompt;
	session.enableTemplateAsSystemPrompt =
		deps.state.enableTemplateAsSystemPrompt;

	const currentSelectedFiles = [...selectionSnapshot.selectedFiles];
	const currentSelectedFolders = [...selectionSnapshot.selectedFolders];
	deps.state.inputValue = '';
	deps.state.selectedImages = [];
	deps.attachmentSelectionService.clearSelection(false);
	deps.state.selectedText = undefined;
	deps.state.selectedPromptTemplate = undefined;
	deps.emitState();

	if (deps.state.shouldSaveHistory) {
		if (
			session.messages.length === 1
			|| (systemPrompt && session.messages.length === 2)
		) {
			try {
				const firstMessage = session.messages[0];
				session.filePath =
					await deps.sessionManager.createNewSessionFileWithFirstMessage(
						session,
						firstMessage,
						currentSelectedFiles,
						currentSelectedFolders
					);
			} catch (error) {
				DebugLogger.error('[ChatService] 创建会话文件失败', error);
				deps.notify(localInstance.chat_session_file_create_failed_but_sent);
			}
		} else {
			try {
				const lastMessage = session.messages.last();
				if (lastMessage) {
					await deps.sessionManager.appendMessageToFile(
						session.filePath ?? '',
						lastMessage,
						currentSelectedFiles,
						currentSelectedFolders
					);
				}
			} catch (error) {
				DebugLogger.error('[ChatService] 追加用户消息失败', error);
			}
		}
	}

	return {
		session,
		userMessage,
		currentSelectedFiles,
		currentSelectedFolders,
		originalUserInput,
		isImageGenerationIntent,
		isModelSupportImageGeneration,
		triggerSource,
	};
};

export const sendMessage = async (
	deps: ChatMessageOperationDeps,
	content?: string
): Promise<void> => {
	const prepared = await prepareChatRequest(deps, content, {
		skipImageSupportValidation: deps.state.multiModelMode !== 'single',
	});
	if (!prepared) {
		return;
	}

	await deps.ensurePlanSyncReady();

	if (deps.state.multiModelMode === 'compare') {
		if (!deps.multiModelService) {
			deps.notify(localInstance.chat_multi_model_service_not_initialized);
			return;
		}
		await deps.multiModelService.sendCompareMessage(prepared);
		return;
	}

	if (
		prepared.isImageGenerationIntent
		&& prepared.isModelSupportImageGeneration
	) {
		const provider = deps.resolveProvider();
		const modelName =
			provider?.options.model || localInstance.chat_current_model_fallback;
		deps.notify(
			localInstance.chat_image_generation_pending.replace(
				'{model}',
				modelName
			)
		);
	}

	if (!deps.resolveProvider()) {
		deps.notify(localInstance.no_ai_model_configured);
		return;
	}

	await deps.generateAssistantResponse(prepared.session);
};
