import type { ParallelResponseEntry } from '../types/multiModel';
import type { PreparedChatRequest } from './chat-service-types';
import { clearAllPendingParallelUpdates } from './multi-model-chat-helpers';
import {
	type MultiModelChatServicePort,
	type MultiModelChatWorkflowDeps,
} from './multi-model-chat-workflows';
import { sendCompareMessageImpl } from './multi-model-chat-compare';
import {
	retryAllFailedImpl,
	retryModelImpl,
	stopAllGenerationImpl,
} from './multi-model-chat-retry';

export class MultiModelChatService {
	private static readonly MAX_COMPARE_CONCURRENCY = 5;
	private static readonly STREAM_UPDATE_INTERVAL = 100;
	private readonly abortControllers = new Map<string, AbortController>();
	private readonly pendingResponsePatches = new Map<
		string,
		Map<string, Partial<ParallelResponseEntry>>
	>();
	private readonly pendingFlushTimers = new Map<string, number>();
	private compareStopRequested = false;

	constructor(
		private readonly chatService: MultiModelChatServicePort,
	) {}

	private notify(message: string, timeout?: number): void {
		this.chatService.getObsidianApiProvider().notify(message, timeout);
	}

	async sendCompareMessage(prepared: PreparedChatRequest): Promise<void> {
		await sendCompareMessageImpl(this.buildWorkflowDeps(), prepared);
	}

	stopAllGeneration(): void {
		stopAllGenerationImpl(this.buildWorkflowDeps());
	}

	stopModelGeneration(modelTag: string): void {
		for (const [key, controller] of this.abortControllers.entries()) {
			if (key === modelTag || key.startsWith(`${modelTag}::`)) {
				controller.abort();
				this.abortControllers.delete(key);
			}
		}
		if (this.abortControllers.size === 0) {
			clearAllPendingParallelUpdates(
				this.pendingResponsePatches,
				this.pendingFlushTimers,
			);
			this.chatService.setGeneratingState(false);
		}
	}

	async retryModel(messageId: string): Promise<void> {
		await retryModelImpl(this.buildWorkflowDeps(), messageId);
	}

	async retryAllFailed(): Promise<void> {
		await retryAllFailedImpl(this.buildWorkflowDeps());
	}

	private buildWorkflowDeps(): MultiModelChatWorkflowDeps {
		return {
			chatService: this.chatService,
			abortControllers: this.abortControllers,
			pendingResponsePatches: this.pendingResponsePatches,
			pendingFlushTimers: this.pendingFlushTimers,
			getCompareStopRequested: () => this.compareStopRequested,
			setCompareStopRequested: (value: boolean) => {
				this.compareStopRequested = value;
			},
			notify: (message: string, timeout?: number) => {
				this.notify(message, timeout);
			},
			maxCompareConcurrency: MultiModelChatService.MAX_COMPARE_CONCURRENCY,
			streamUpdateInterval: MultiModelChatService.STREAM_UPDATE_INTERVAL,
		};
	}
}
