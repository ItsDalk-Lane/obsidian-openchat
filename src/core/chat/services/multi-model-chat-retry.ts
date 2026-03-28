import { v4 as uuidv4 } from 'uuid';
import { localInstance } from 'src/i18n/locals';
import { buildRetryContextMessages } from 'src/core/chat/utils/compare-context';
import type { ChatMessage } from '../types/chat';
import type { MultiModelChatWorkflowDeps } from './multi-model-chat-workflows';
import {
	clearAllPendingParallelUpdates,
	createErrorMessage,
	getModelDisplayName,
	isAbortError,
} from './multi-model-chat-helpers';

export const stopAllGenerationImpl = (
	deps: MultiModelChatWorkflowDeps,
): void => {
	deps.setCompareStopRequested(true);
	for (const controller of deps.abortControllers.values()) {
		controller.abort();
	}
	deps.abortControllers.clear();
	clearAllPendingParallelUpdates(
		deps.pendingResponsePatches,
		deps.pendingFlushTimers,
	);
	deps.chatService.setGeneratingState(false);
};

export const retryModelImpl = async (
	deps: MultiModelChatWorkflowDeps,
	messageId: string,
): Promise<void> => {
	const session = deps.chatService.getActiveSession();
	if (!session) {
		return;
	}
	const target = session.messages.find((message) => message.id === messageId);
	if (!target || !target.modelTag) {
		deps.notify(localInstance.multi_model_retry_target_not_found);
		return;
	}
	const index = session.messages.findIndex((message) => message.id === messageId);
	if (index === -1) {
		return;
	}
	const modelTag = target.modelTag;
	const parallelGroupId = target.parallelGroupId ?? `compare-retry-${uuidv4()}`;
	const retryContextSession = {
		...session,
		messages: buildRetryContextMessages(session.messages, index),
	};
	const userMessageId =
		retryContextSession.messages[retryContextSession.messages.length - 1]?.id ?? '';
	const draftMessage: ChatMessage = {
		...target,
		content: '',
		isError: false,
		timestamp: Date.now(),
	};
	session.messages.splice(index, 1, draftMessage);
	session.updatedAt = Date.now();
	deps.chatService.setErrorState(undefined);
	deps.chatService.setParallelResponses({
		groupId: parallelGroupId,
		userMessageId,
		responses: [
			{
				modelTag,
				modelName: draftMessage.modelName ?? getModelDisplayName(modelTag, deps.chatService),
				content: '',
				isComplete: false,
				isError: false,
				messageId: target.id,
			},
		],
	});
	deps.chatService.setGeneratingState(true);
	const controller = new AbortController();
	deps.abortControllers.set(modelTag, controller);
	try {
		const message = await deps.chatService.generateAssistantResponseForModel(
			retryContextSession,
			modelTag,
			{
				abortSignal: controller.signal,
				taskDescription: target.taskDescription,
				executionIndex: target.executionIndex,
				createMessageInSession: false,
				manageGeneratingState: false,
				onChunk: (_chunk, currentMessage) => {
					draftMessage.content = currentMessage.content;
					draftMessage.timestamp = Date.now();
					draftMessage.isError = false;
					session.updatedAt = Date.now();
					deps.chatService.setParallelResponses({
						groupId: parallelGroupId,
						userMessageId,
						responses: [
							{
								modelTag,
								modelName:
									currentMessage.modelName
									?? getModelDisplayName(modelTag, deps.chatService),
								content: currentMessage.content,
								isComplete: false,
								isError: false,
								messageId: target.id,
							},
						],
					});
				},
			},
		);
		message.id = target.id;
		message.parallelGroupId = target.parallelGroupId;
		message.timestamp = Date.now();
		message.metadata = {
			...(message.metadata ?? {}),
			hiddenFromModel: true,
		};
		session.messages.splice(index, 1, message);
		session.updatedAt = Date.now();
		await deps.chatService.rewriteSessionMessages(session);
	} catch (error) {
		if (isAbortError(error)) {
			if (draftMessage.content.trim().length === 0) {
				session.messages.splice(index, 1, target);
			}
		} else {
			const failedMessage = createErrorMessage(modelTag, error, deps.chatService, {
				taskDescription: target.taskDescription,
				executionIndex: target.executionIndex,
				parallelGroupId: target.parallelGroupId,
			});
			failedMessage.id = target.id;
			failedMessage.timestamp = Date.now();
			session.messages.splice(index, 1, failedMessage);
		}
		session.updatedAt = Date.now();
		await deps.chatService.rewriteSessionMessages(session);
	} finally {
		deps.abortControllers.delete(modelTag);
		deps.chatService.clearParallelResponses();
		if (deps.abortControllers.size === 0) {
			deps.chatService.setGeneratingState(false);
		}
		deps.chatService.notifyStateChange();
	}
};

export const retryAllFailedImpl = async (
	deps: MultiModelChatWorkflowDeps,
): Promise<void> => {
	const session = deps.chatService.getActiveSession();
	if (!session) {
		return;
	}
	const failedMessages = session.messages.filter((message) => {
		return message.role === 'assistant' && message.isError && message.modelTag;
	});
	if (failedMessages.length > 0) {
		deps.notify(
			localInstance.retrying_failed.replace(
				'{count}',
				String(failedMessages.length),
			),
		);
	}
	for (const message of failedMessages) {
		await retryModelImpl(deps, message.id);
	}
};
