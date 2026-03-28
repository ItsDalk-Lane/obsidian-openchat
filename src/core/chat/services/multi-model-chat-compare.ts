import { v4 as uuidv4 } from 'uuid';
import { localInstance } from 'src/i18n/locals';
import { DebugLogger } from 'src/utils/DebugLogger';
import type {
	ParallelResponseGroup,
} from '../types/multiModel';
import type { PreparedChatRequest } from './chat-service-types';
import type { MultiModelChatWorkflowDeps } from './multi-model-chat-workflows';
import {
	applyParallelResponsePatch,
	clearPendingParallelUpdates,
	createErrorMessage,
	flushQueuedParallelResponseUpdates,
	getModelDisplayName,
	isAbortError,
	queueParallelResponseUpdate,
	runWithConcurrency,
} from './multi-model-chat-helpers';

const resolveCompareModelTags = async (
	deps: MultiModelChatWorkflowDeps,
): Promise<string[]> => {
	const state = deps.chatService.getState();
	if (state.activeCompareGroupId) {
		const groups = await deps.configService.loadCompareGroups();
		const group = groups.find((item) => item.id === state.activeCompareGroupId);
		if (group?.modelTags.length) {
			return group.modelTags;
		}
	}
	return deps.chatService.getSelectedModels();
};

const resolveAvailableCompareModels = async (
	deps: MultiModelChatWorkflowDeps,
	modelTags: string[],
	prepared: PreparedChatRequest,
): Promise<string[]> => {
	const uniqueTags = Array.from(new Set(modelTags.filter(Boolean)));
	if (uniqueTags.length === 0) {
		return [];
	}
	if (uniqueTags.length > deps.maxCompareConcurrency) {
		deps.notify(
			localInstance.multi_model_compare_concurrency_notice
				.replace('{count}', String(uniqueTags.length))
				.replace('{max}', String(deps.maxCompareConcurrency)),
			6000,
		);
	}
	const validTags: string[] = [];
	const missingModels: string[] = [];
	const excludedImageModels: string[] = [];
	const disabledReasoningModels: string[] = [];
	for (const modelTag of uniqueTags) {
		const provider = deps.chatService.findProviderByTagExact(modelTag);
		if (!provider) {
			DebugLogger.warn('[MultiModelChatService] 模型配置不存在，已跳过:', modelTag);
			missingModels.push(modelTag);
			continue;
		}
		if (
			prepared.isImageGenerationIntent
			&& !deps.chatService.isProviderSupportImageGenerationByTag(modelTag)
		) {
			excludedImageModels.push(getModelDisplayName(modelTag, deps.chatService));
			continue;
		}
		const ollamaCapabilities =
			await deps.chatService.getOllamaCapabilitiesForModel(modelTag);
		if (ollamaCapabilities && !ollamaCapabilities.supported && ollamaCapabilities.shouldWarn) {
			disabledReasoningModels.push(ollamaCapabilities.modelName);
		}
		validTags.push(modelTag);
	}
	if (missingModels.length > 0) {
		deps.notify(
			localInstance.multi_model_missing_configs_notice.replace(
				'{models}',
				missingModels.join(', '),
			),
			5000,
		);
	}
	if (excludedImageModels.length > 0) {
		if (excludedImageModels.length === uniqueTags.length) {
			deps.notify(localInstance.all_models_excluded, 5000);
		} else {
			deps.notify(
				localInstance.models_excluded_image.replace(
					'{models}',
					excludedImageModels.join(', '),
				),
				7000,
			);
		}
	}
	if (disabledReasoningModels.length > 0) {
		deps.notify(
			localInstance.multi_model_reasoning_disabled_notice.replace(
				'{models}',
				disabledReasoningModels.join(', '),
			),
			5000,
		);
	}
	if (validTags.length === 0 && missingModels.length === uniqueTags.length) {
		deps.notify(localInstance.multi_model_all_invalid_notice, 5000);
	}
	return validTags;
};

export const sendCompareMessageImpl = async (
	deps: MultiModelChatWorkflowDeps,
	prepared: PreparedChatRequest,
): Promise<void> => {
	deps.setCompareStopRequested(false);
	const session = prepared.session;
	const requestedModelTags = await resolveCompareModelTags(deps);
	const modelTags = await resolveAvailableCompareModels(
		deps,
		requestedModelTags,
		prepared,
	);
	if (modelTags.length === 0) {
		deps.notify(localInstance.no_models_selected);
		return;
	}
	const parallelGroupId = `compare-${uuidv4()}`;
	const parallelResponses: ParallelResponseGroup = {
		groupId: parallelGroupId,
		userMessageId: prepared.userMessage.id,
		responses: modelTags.map((tag) => ({
			modelTag: tag,
			modelName: getModelDisplayName(tag, deps.chatService),
			content: '',
			isComplete: false,
			isError: false,
		})),
	};
	deps.chatService.setErrorState(undefined);
	deps.chatService.setParallelResponses(parallelResponses);
	deps.chatService.setGeneratingState(true);
	try {
		const results = await runWithConcurrency(
			modelTags,
			deps.maxCompareConcurrency,
			async (modelTag) => {
				if (deps.getCompareStopRequested()) {
					return null;
				}
				const controller = new AbortController();
				deps.abortControllers.set(modelTag, controller);
				try {
					const message =
						await deps.chatService.generateAssistantResponseForModel(
							session,
							modelTag,
							{
								abortSignal: controller.signal,
								createMessageInSession: false,
								manageGeneratingState: false,
								onChunk: (_chunk, currentMessage) => {
									queueParallelResponseUpdate(
										parallelGroupId,
										modelTag,
										{ content: currentMessage.content },
										deps.pendingResponsePatches,
										deps.pendingFlushTimers,
										deps.streamUpdateInterval,
										(groupId) =>
											flushQueuedParallelResponseUpdates(
												groupId,
												deps.pendingResponsePatches,
												deps.pendingFlushTimers,
												deps.chatService,
											),
									);
								},
							},
						);
					message.parallelGroupId = parallelGroupId;
					message.metadata = {
						...(message.metadata ?? {}),
						hiddenFromModel: true,
					};
					flushQueuedParallelResponseUpdates(
						parallelGroupId,
						deps.pendingResponsePatches,
						deps.pendingFlushTimers,
						deps.chatService,
					);
					applyParallelResponsePatch(
						parallelGroupId,
						modelTag,
						{
							content: message.content,
							isComplete: true,
							isError: false,
							error: undefined,
							errorMessage: undefined,
							messageId: message.id,
						},
						deps.chatService,
					);
					return message;
				} catch (error) {
					if (isAbortError(error)) {
						flushQueuedParallelResponseUpdates(
							parallelGroupId,
							deps.pendingResponsePatches,
							deps.pendingFlushTimers,
							deps.chatService,
						);
						applyParallelResponsePatch(
							parallelGroupId,
							modelTag,
							{
								isComplete: true,
								isError: false,
								error: undefined,
								errorMessage: undefined,
							},
							deps.chatService,
						);
						return null;
					}
					const failedMessage = createErrorMessage(modelTag, error, deps.chatService, {
						parallelGroupId,
					});
					flushQueuedParallelResponseUpdates(
						parallelGroupId,
						deps.pendingResponsePatches,
						deps.pendingFlushTimers,
						deps.chatService,
					);
					applyParallelResponsePatch(
						parallelGroupId,
						modelTag,
						{
							content: failedMessage.content,
							isComplete: true,
							isError: true,
							error: failedMessage.content,
							errorMessage: failedMessage.content,
							messageId: failedMessage.id,
						},
						deps.chatService,
					);
					return failedMessage;
				} finally {
					deps.abortControllers.delete(modelTag);
				}
			},
			() => deps.getCompareStopRequested(),
		);
		session.messages.push(...results);
		session.updatedAt = Date.now();
		deps.chatService.notifyStateChange();
		await deps.chatService.rewriteSessionMessages(session);
		const failedCount = results.filter((message) => message.isError).length;
		const successCount = results.length - failedCount;
		if (failedCount > 0) {
			deps.notify(
				localInstance.partial_success
					.replace('{success}', String(successCount))
					.replace('{total}', String(results.length))
					.replace('{failed}', String(failedCount)),
			);
		}
	} finally {
		deps.setCompareStopRequested(false);
		clearPendingParallelUpdates(
			parallelGroupId,
			deps.pendingResponsePatches,
			deps.pendingFlushTimers,
		);
		deps.chatService.clearParallelResponses();
		deps.chatService.setGeneratingState(false);
	}
};
