import { Notice } from 'obsidian';
import { v4 as uuidv4 } from 'uuid';
import type { ChatMessage } from '../types/chat';
import type { ParallelResponseEntry, ParallelResponseGroup } from '../types/multiModel';
import type { ChatService } from './ChatService';
import type { PreparedChatRequest } from './ChatServiceCore';
import { MultiModelConfigService } from './MultiModelConfigService';
import { localInstance } from 'src/i18n/locals';
import { buildRetryContextMessages } from 'src/core/chat/utils/compareContext';
import { DebugLogger } from 'src/utils/DebugLogger';
import {
	applyParallelResponsePatch,
	clearAllPendingParallelUpdates,
	clearPendingParallelUpdates,
	createErrorMessage,
	flushQueuedParallelResponseUpdates,
	getModelDisplayName,
	isAbortError,
	queueParallelResponseUpdate,
	runWithConcurrency,
} from './multiModelChatHelpers';

export class MultiModelChatService {
	private static readonly MAX_COMPARE_CONCURRENCY = 5;
	private static readonly STREAM_UPDATE_INTERVAL = 100;
	private readonly abortControllers = new Map<string, AbortController>();
	private readonly pendingResponsePatches = new Map<string, Map<string, Partial<ParallelResponseEntry>>>();
	private readonly pendingFlushTimers = new Map<string, number>();
	private compareStopRequested = false;

	constructor(
		private readonly chatService: ChatService,
		private readonly configService: MultiModelConfigService
	) {}

	async sendCompareMessage(prepared: PreparedChatRequest): Promise<void> {
		this.compareStopRequested = false;
		const session = prepared.session;
		const requestedModelTags = await this.resolveCompareModelTags();
		const modelTags = await this.filterAvailableCompareModels(requestedModelTags, prepared);
		if (modelTags.length === 0) {
			new Notice(localInstance.no_models_selected);
			return;
		}

		const parallelGroupId = `compare-${uuidv4()}`;
		const parallelResponses: ParallelResponseGroup = {
			groupId: parallelGroupId,
			userMessageId: prepared.userMessage.id,
			responses: modelTags.map((tag) => ({
				modelTag: tag,
				modelName: getModelDisplayName(tag, this.chatService),
				content: '',
				isComplete: false,
				isError: false
			}))
		};

		this.chatService.setErrorState(undefined);
		this.chatService.setParallelResponses(parallelResponses);
		this.chatService.setGeneratingState(true);

		try {
				const results = await runWithConcurrency(
					modelTags,
					MultiModelChatService.MAX_COMPARE_CONCURRENCY,
					async (modelTag) => {
					if (this.compareStopRequested) {
						return null;
					}

					const controller = new AbortController();
					this.abortControllers.set(modelTag, controller);

					try {
						const message = await this.chatService.generateAssistantResponseForModel(session, modelTag, {
							abortSignal: controller.signal,
							createMessageInSession: false,
							manageGeneratingState: false,
							onChunk: (_chunk, currentMessage) => {
									queueParallelResponseUpdate(
										parallelGroupId,
										modelTag,
										{ content: currentMessage.content },
										this.pendingResponsePatches,
										this.pendingFlushTimers,
										MultiModelChatService.STREAM_UPDATE_INTERVAL,
										(groupId) =>
											flushQueuedParallelResponseUpdates(
												groupId,
												this.pendingResponsePatches,
												this.pendingFlushTimers,
												this.chatService
											)
									);
								}
							});

						message.parallelGroupId = parallelGroupId;
						message.metadata = {
							...(message.metadata ?? {}),
							hiddenFromModel: true
						};

							flushQueuedParallelResponseUpdates(
								parallelGroupId,
								this.pendingResponsePatches,
								this.pendingFlushTimers,
								this.chatService
							);
							applyParallelResponsePatch(parallelGroupId, modelTag, {
								content: message.content,
								isComplete: true,
								isError: false,
							error: undefined,
							errorMessage: undefined,
								messageId: message.id
							}, this.chatService);

						return message;
					} catch (error) {
							if (isAbortError(error)) {
								flushQueuedParallelResponseUpdates(
									parallelGroupId,
									this.pendingResponsePatches,
									this.pendingFlushTimers,
									this.chatService
								);
								applyParallelResponsePatch(parallelGroupId, modelTag, {
									isComplete: true,
									isError: false,
									error: undefined,
									errorMessage: undefined
								}, this.chatService);
								return null;
							}

							const failedMessage = createErrorMessage(modelTag, error, this.chatService, {
								parallelGroupId
							});
							flushQueuedParallelResponseUpdates(
								parallelGroupId,
								this.pendingResponsePatches,
								this.pendingFlushTimers,
								this.chatService
							);
							applyParallelResponsePatch(parallelGroupId, modelTag, {
								content: failedMessage.content,
								isComplete: true,
								isError: true,
							error: failedMessage.content,
							errorMessage: failedMessage.content,
								messageId: failedMessage.id
							}, this.chatService);
							return failedMessage;
						} finally {
							this.abortControllers.delete(modelTag);
					}
				},
				() => this.compareStopRequested
			);

			session.messages.push(...results);
			session.updatedAt = Date.now();
			this.chatService.notifyStateChange();
			await this.chatService.rewriteSessionMessages(session);

			const failedCount = results.filter((message) => message.isError).length;
			const successCount = results.length - failedCount;
			if (failedCount > 0) {
				new Notice(
					localInstance.partial_success
						.replace('{success}', String(successCount))
						.replace('{total}', String(results.length))
						.replace('{failed}', String(failedCount))
				);
			}
			} finally {
				this.compareStopRequested = false;
				clearPendingParallelUpdates(
					parallelGroupId,
					this.pendingResponsePatches,
					this.pendingFlushTimers
				);
				this.chatService.clearParallelResponses();
				this.chatService.setGeneratingState(false);
			}
	}

	stopAllGeneration(): void {
		this.compareStopRequested = true;
		for (const controller of this.abortControllers.values()) {
			controller.abort();
		}
		this.abortControllers.clear();
		clearAllPendingParallelUpdates(this.pendingResponsePatches, this.pendingFlushTimers);
		this.chatService.setGeneratingState(false);
	}

	stopModelGeneration(modelTag: string): void {
		for (const [key, controller] of this.abortControllers.entries()) {
			if (key === modelTag || key.startsWith(`${modelTag}::`)) {
				controller.abort();
				this.abortControllers.delete(key);
			}
		}
		if (this.abortControllers.size === 0) {
			clearAllPendingParallelUpdates(this.pendingResponsePatches, this.pendingFlushTimers);
			this.chatService.setGeneratingState(false);
		}
	}

	async retryModel(messageId: string): Promise<void> {
		const session = this.chatService.getActiveSession();
		if (!session) {
			return;
		}

		const target = session.messages.find((message) => message.id === messageId);
		if (!target || !target.modelTag) {
			new Notice(localInstance.multi_model_retry_target_not_found);
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
			messages: buildRetryContextMessages(session.messages, index)
		};
		const userMessageId = retryContextSession.messages[retryContextSession.messages.length - 1]?.id ?? '';
		const draftMessage: ChatMessage = {
			...target,
			content: '',
			isError: false,
			timestamp: Date.now()
		};

		session.messages.splice(index, 1, draftMessage);
		session.updatedAt = Date.now();
		this.chatService.setErrorState(undefined);
		this.chatService.setParallelResponses({
			groupId: parallelGroupId,
			userMessageId,
			responses: [
				{
					modelTag,
					modelName: draftMessage.modelName ?? getModelDisplayName(modelTag, this.chatService),
					content: '',
					isComplete: false,
					isError: false,
					messageId: target.id
				}
			]
		});
		this.chatService.setGeneratingState(true);

		const controller = new AbortController();
		this.abortControllers.set(modelTag, controller);

		try {
			const message = await this.chatService.generateAssistantResponseForModel(retryContextSession, modelTag, {
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
					this.chatService.setParallelResponses({
						groupId: parallelGroupId,
						userMessageId,
						responses: [
							{
								modelTag,
										modelName: currentMessage.modelName ?? getModelDisplayName(modelTag, this.chatService),
								content: currentMessage.content,
								isComplete: false,
								isError: false,
								messageId: target.id
							}
						]
					});
				}
			});

			message.id = target.id;
			message.parallelGroupId = target.parallelGroupId;
			message.timestamp = Date.now();
			message.metadata = {
				...(message.metadata ?? {}),
				hiddenFromModel: true
			};

			session.messages.splice(index, 1, message);
			session.updatedAt = Date.now();
			await this.chatService.rewriteSessionMessages(session);
		} catch (error) {
				if (isAbortError(error)) {
					if (draftMessage.content.trim().length === 0) {
						session.messages.splice(index, 1, target);
					}
				} else {
					const failedMessage = createErrorMessage(modelTag, error, this.chatService, {
						taskDescription: target.taskDescription,
						executionIndex: target.executionIndex,
						parallelGroupId: target.parallelGroupId
				});
				failedMessage.id = target.id;
				failedMessage.timestamp = Date.now();
				session.messages.splice(index, 1, failedMessage);
			}
			session.updatedAt = Date.now();
			await this.chatService.rewriteSessionMessages(session);
		} finally {
			this.abortControllers.delete(modelTag);
			this.chatService.clearParallelResponses();
			if (this.abortControllers.size === 0) {
				this.chatService.setGeneratingState(false);
			}
			this.chatService.notifyStateChange();
		}
	}

	async retryAllFailed(): Promise<void> {
		const session = this.chatService.getActiveSession();
		if (!session) {
			return;
		}

		const failedMessages = session.messages.filter((message) => message.role === 'assistant' && message.isError && message.modelTag);
		if (failedMessages.length > 0) {
			new Notice(
				localInstance.retrying_failed
					.replace('{count}', String(failedMessages.length))
			);
		}
		for (const message of failedMessages) {
			await this.retryModel(message.id);
		}
	}

	private async resolveCompareModelTags(): Promise<string[]> {
		const state = this.chatService.getState();
		if (state.activeCompareGroupId) {
			const groups = await this.configService.loadCompareGroups();
			const group = groups.find((item) => item.id === state.activeCompareGroupId);
			if (group?.modelTags.length) {
				return group.modelTags;
			}
		}

		return this.chatService.getSelectedModels();
	}

	private async filterAvailableCompareModels(
		modelTags: string[],
		prepared: PreparedChatRequest
	): Promise<string[]> {
		const uniqueTags = Array.from(new Set(modelTags.filter(Boolean)));
		if (uniqueTags.length === 0) {
			return [];
		}

		if (uniqueTags.length > MultiModelChatService.MAX_COMPARE_CONCURRENCY) {
			new Notice(
				localInstance.multi_model_compare_concurrency_notice
					.replace('{count}', String(uniqueTags.length))
					.replace('{max}', String(MultiModelChatService.MAX_COMPARE_CONCURRENCY)),
				6000
			);
		}

		const validTags: string[] = [];
		const missingModels: string[] = [];
		const excludedImageModels: string[] = [];
		const disabledReasoningModels: string[] = [];

		for (const modelTag of uniqueTags) {
			const provider = this.chatService.findProviderByTagExact(modelTag);
			if (!provider) {
				DebugLogger.warn('[MultiModelChatService] 模型配置不存在，已跳过:', modelTag);
				missingModels.push(modelTag);
				continue;
			}

			if (prepared.isImageGenerationIntent && !this.chatService.isProviderSupportImageGenerationByTag(modelTag)) {
					excludedImageModels.push(getModelDisplayName(modelTag, this.chatService));
				continue;
			}

			const ollamaCapabilities = await this.chatService.getOllamaCapabilitiesForModel(modelTag);
			if (ollamaCapabilities && !ollamaCapabilities.supported && ollamaCapabilities.shouldWarn) {
				disabledReasoningModels.push(ollamaCapabilities.modelName);
			}

			validTags.push(modelTag);
		}

		if (missingModels.length > 0) {
			new Notice(
				localInstance.multi_model_missing_configs_notice.replace('{models}', missingModels.join(', ')),
				5000
			);
		}

		if (excludedImageModels.length > 0) {
			if (excludedImageModels.length === uniqueTags.length) {
				new Notice(localInstance.all_models_excluded, 5000);
			} else {
				new Notice(
					localInstance.models_excluded_image.replace('{models}', excludedImageModels.join(', ')),
					7000
				);
			}
		}

		if (disabledReasoningModels.length > 0) {
			new Notice(
				localInstance.multi_model_reasoning_disabled_notice.replace('{models}', disabledReasoningModels.join(', ')),
				5000
			);
		}

		if (validTags.length === 0 && missingModels.length === uniqueTags.length) {
			new Notice(localInstance.multi_model_all_invalid_notice, 5000);
		}

			return validTags;
		}
}
