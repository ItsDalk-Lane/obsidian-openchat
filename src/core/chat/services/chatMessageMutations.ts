import { MarkdownView, Notice } from 'obsidian';
import { buildEditedUserMessage, getEditableUserMessageContent } from 'src/core/chat/utils/userMessageEditing';
import { localInstance } from 'src/i18n/locals';
import { DebugLogger } from 'src/utils/DebugLogger';
import type { AiRuntimeSettings } from 'src/settings/ai-runtime';
import type { MultiModelChatService } from './MultiModelChatService';
import type { ChatSessionManager } from './ChatSessionManager';
import type { PreparedChatRequest } from './ChatServiceCore';
import type { ChatSession, ChatState } from '../types/chat';

export interface ChatMessageMutationDeps {
	app: import('obsidian').App;
	state: ChatState;
	sessionManager: ChatSessionManager;
	multiModelService: MultiModelChatService | null;
	emitState: () => void;
	invalidateSessionContextCompaction: (session: ChatSession) => void;
	queueSessionPlanSync: (session: ChatSession | null) => void;
	generateAssistantResponse: (session: ChatSession) => Promise<void>;
	detectImageGenerationIntent: (content: string) => boolean;
	isCurrentModelSupportImageGeneration: () => boolean;
}

export const editMessage = async (
	deps: ChatMessageMutationDeps,
	messageId: string,
	content: string
): Promise<void> => {
	const session = deps.state.activeSession;
	if (!session) {
		return;
	}

	const message = session.messages.find((item) => item.id === messageId);
	if (!message || message.role !== 'user') {
		return;
	}

	const editedMessage = buildEditedUserMessage(message, content);
	message.content = editedMessage.content;
	message.metadata = editedMessage.metadata;
	message.timestamp = Date.now();
	session.updatedAt = Date.now();
	deps.invalidateSessionContextCompaction(session);
	deps.emitState();

	if (!session.filePath) {
		return;
	}

	try {
		await deps.sessionManager.rewriteMessagesOnly(session.filePath, session.messages);
	} catch (error) {
		DebugLogger.error('[ChatService] 更新消息编辑失败', error);
		new Notice(localInstance.chat_file_update_failed_message_edited);
	}
};

export const editAndRegenerate = async (
	deps: ChatMessageMutationDeps,
	messageId: string,
	content: string
): Promise<void> => {
	const session = deps.state.activeSession;
	if (!session || deps.state.isGenerating) {
		return;
	}

	const messageIndex = session.messages.findIndex((item) => item.id === messageId);
	if (messageIndex === -1) {
		return;
	}

	const message = session.messages[messageIndex];
	if (!message || message.role !== 'user') {
		return;
	}

	const editedMessage = buildEditedUserMessage(message, content);
	message.content = editedMessage.content;
	message.metadata = { ...(editedMessage.metadata ?? {}) };
	message.timestamp = Date.now();
	session.messages = session.messages.slice(0, messageIndex + 1);
	session.updatedAt = Date.now();
	deps.invalidateSessionContextCompaction(session);
	deps.emitState();

	if (session.filePath) {
		try {
			await deps.sessionManager.rewriteMessagesOnly(session.filePath, session.messages);
		} catch (error) {
			DebugLogger.error('[ChatService] 更新消息编辑失败', error);
		}
	}

	if (deps.state.multiModelMode === 'compare' && deps.multiModelService) {
		const editableContent = getEditableUserMessageContent(message);
		const prepared: PreparedChatRequest = {
			session,
			userMessage: message,
			currentSelectedFiles: [...(session.selectedFiles ?? [])],
			currentSelectedFolders: [...(session.selectedFolders ?? [])],
			originalUserInput: editableContent,
			isImageGenerationIntent: deps.detectImageGenerationIntent(editableContent),
			isModelSupportImageGeneration:
				deps.isCurrentModelSupportImageGeneration(),
			triggerSource: 'chat_input',
		};
		await deps.multiModelService.sendCompareMessage(prepared);
		return;
	}

	await deps.generateAssistantResponse(session);
};

export const deleteMessage = async (
	deps: ChatMessageMutationDeps,
	messageId: string
): Promise<void> => {
	const session = deps.state.activeSession;
	if (!session) {
		return;
	}

	const index = session.messages.findIndex((item) => item.id === messageId);
	if (index === -1) {
		return;
	}

	session.messages.splice(index, 1);
	session.updatedAt = Date.now();
	deps.invalidateSessionContextCompaction(session);
	deps.emitState();

	if (!session.filePath) {
		return;
	}

	try {
		await deps.sessionManager.rewriteMessagesOnly(session.filePath, session.messages);
	} catch (error) {
		DebugLogger.error('[ChatService] 更新消息删除失败', error);
		new Notice(localInstance.chat_file_update_failed_message_deleted);
	}
};

export const togglePinnedMessage = async (
	deps: ChatMessageMutationDeps,
	messageId: string
): Promise<void> => {
	const session = deps.state.activeSession;
	if (!session) {
		return;
	}

	const message = session.messages.find((item) => item.id === messageId);
	if (!message || message.metadata?.hidden || message.metadata?.transient) {
		return;
	}

	const metadata = { ...(message.metadata ?? {}) } as Record<string, unknown>;
	if (metadata.pinned === true) {
		delete metadata.pinned;
	} else {
		metadata.pinned = true;
	}
	message.metadata = metadata;
	session.updatedAt = Date.now();
	deps.invalidateSessionContextCompaction(session);
	deps.emitState();

	if (!session.filePath) {
		return;
	}

	try {
		await deps.sessionManager.rewriteMessagesOnly(session.filePath, session.messages);
	} catch (error) {
		DebugLogger.error('[ChatService] 更新消息置顶状态失败', error);
		new Notice(localInstance.chat_pinned_state_sync_failed);
	}
};

export const insertMessageToEditor = (
	deps: ChatMessageMutationDeps,
	messageId: string
): void => {
	const session = deps.state.activeSession;
	if (!session) {
		return;
	}

	const message = session.messages.find((item) => item.id === messageId);
	if (!message) {
		return;
	}

	const markdownLeaves = deps.app.workspace.getLeavesOfType('markdown');
	const activeMarkdownView = deps.app.workspace.getActiveViewOfType(MarkdownView);
	if (activeMarkdownView?.editor) {
		activeMarkdownView.editor.replaceSelection(message.content);
		new Notice(localInstance.chat_inserted_current_editor);
		return;
	}

	if (markdownLeaves.length > 0) {
		let targetLeaf = markdownLeaves.find(
			(leaf) => leaf === deps.app.workspace.activeLeaf
		);
		if (!targetLeaf) {
			targetLeaf = markdownLeaves[0];
		}

		if (targetLeaf) {
			const targetView = targetLeaf.view as MarkdownView;
			if (targetView.editor) {
				targetView.editor.replaceSelection(message.content);
				const fileName =
					targetView.file?.basename || localInstance.chat_unknown_file;
				new Notice(
					localInstance.chat_inserted_file.replace('{fileName}', fileName)
				);
				return;
			}
		}
	}

	new Notice(localInstance.chat_insert_target_missing);
};

export const regenerateFromMessage = async (
	deps: ChatMessageMutationDeps,
	messageId: string
): Promise<void> => {
	const session = deps.state.activeSession;
	if (!session || deps.state.isGenerating) {
		return;
	}

	const index = session.messages.findIndex((item) => item.id === messageId);
	if (index === -1) {
		return;
	}

	const target = session.messages[index];
	if (target.role !== 'assistant') {
		new Notice(localInstance.chat_regenerate_only_ai_message);
		return;
	}

	if (deps.state.multiModelMode === 'compare') {
		await deps.multiModelService?.retryModel(messageId);
		return;
	}

	session.messages = session.messages.slice(0, index);
	session.updatedAt = Date.now();
	deps.invalidateSessionContextCompaction(session);
	session.livePlan = null;
	deps.queueSessionPlanSync(session);
	deps.emitState();

	if (session.filePath) {
		try {
			await deps.sessionManager.rewriteMessagesOnly(
				session.filePath,
				session.messages,
				null
			);
		} catch (error) {
			DebugLogger.error('[ChatService] 更新消息删除失败', error);
		}
	}

	await deps.generateAssistantResponse(session);
};

export const refreshProviderSettings = (
	deps: ChatMessageMutationDeps,
	aiRuntimeSettings: AiRuntimeSettings
): void => {
	if (!aiRuntimeSettings.providers.length) {
		deps.state.selectedModelId = null;
		deps.state.selectedModels = [];
	} else if (!deps.state.selectedModelId) {
		deps.state.selectedModelId = aiRuntimeSettings.providers[0].tag;
		if (deps.state.selectedModels.length === 0) {
			deps.state.selectedModels = [aiRuntimeSettings.providers[0].tag];
		}
	} else {
		const providerTags = new Set(
			aiRuntimeSettings.providers.map((provider) => provider.tag)
		);
		if (!providerTags.has(deps.state.selectedModelId)) {
			deps.state.selectedModelId = aiRuntimeSettings.providers[0].tag;
		}
		deps.state.selectedModels = deps.state.selectedModels.filter((tag) =>
			providerTags.has(tag)
		);
		if (
			deps.state.selectedModels.length === 0
			&& deps.state.selectedModelId
		) {
			deps.state.selectedModels = [deps.state.selectedModelId];
		}
	}

	deps.emitState();
};
