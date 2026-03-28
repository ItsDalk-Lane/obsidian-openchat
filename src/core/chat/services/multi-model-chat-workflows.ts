import type { ChatMessage } from '../types/chat';
import type {
	ParallelResponseEntry,
} from '../types/multiModel';
import type { MultiModelConfigService } from './multi-model-config-service';

export interface MultiModelChatServicePort {
	getObsidianApiProvider(): import('src/providers/providers.types').ObsidianApiProvider;
	getState(): import('../types/chat').ChatState;
	setErrorState(error?: string): void;
	setParallelResponses(group?: ParallelResponseGroup): void;
	setGeneratingState(isGenerating: boolean): void;
	clearParallelResponses(): void;
	notifyStateChange(): void;
	rewriteSessionMessages(session: import('../types/chat').ChatSession): Promise<void>;
	generateAssistantResponseForModel(
		session: import('../types/chat').ChatSession,
		modelTag: string,
		options?: import('./chat-service-types').GenerateAssistantOptions,
	): Promise<ChatMessage>;
	getActiveSession(): import('../types/chat').ChatSession | null;
	findProviderByTagExact(modelTag?: string): import('src/types/provider').ProviderSettings | null;
	isProviderSupportImageGenerationByTag(modelTag: string): boolean;
	getOllamaCapabilitiesForModel(modelTag: string): Promise<{
		supported: boolean;
		shouldWarn: boolean;
		modelName: string;
	} | null>;
	getSelectedModels(): string[];
	getProviders(): import('src/types/provider').ProviderSettings[];
}

export interface MultiModelChatWorkflowDeps {
	chatService: MultiModelChatServicePort;
	configService: MultiModelConfigService;
	abortControllers: Map<string, AbortController>;
	pendingResponsePatches: Map<string, Map<string, Partial<ParallelResponseEntry>>>;
	pendingFlushTimers: Map<string, number>;
	getCompareStopRequested(): boolean;
	setCompareStopRequested(value: boolean): void;
	notify(message: string, timeout?: number): void;
	maxCompareConcurrency: number;
	streamUpdateInterval: number;
}
