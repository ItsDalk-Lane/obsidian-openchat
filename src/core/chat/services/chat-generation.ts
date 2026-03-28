import type { Message as ProviderMessage, ProviderSettings } from 'src/types/provider';
import type { ToolDefinition, ToolExecutionRecord } from 'src/types/tool';
import { t } from 'src/i18n/ai-runtime/helper';
import { localInstance } from 'src/i18n/locals';
import { DebugLogger } from 'src/utils/DebugLogger';
import type { ResolvedToolRuntime, SubAgentStateCallback } from 'src/tools/sub-agents';
import type { GenerateAssistantOptions } from './chat-service-types';
import type { ChatImageResolver } from './chat-image-resolver';
import type { ChatSessionManager } from './chat-session-manager';
import type { MessageService } from './message-service';
import type { OllamaCapabilityCacheEntry } from './chat-provider-helpers';
import type { ChatMessage, ChatSession, ChatState } from '../types/chat';
import { generateAssistantResponseForModelImpl } from './chat-generation-for-model';

export interface ChatGenerationDeps {
	state: ChatState;
	messageService: MessageService;
	imageResolver: ChatImageResolver;
	sessionManager: ChatSessionManager;
	ollamaCapabilityCache: Map<string, OllamaCapabilityCacheEntry>;
	notify: (message: string, timeout?: number) => void;
	getAvailableAttachmentPath: (filename: string) => Promise<string>;
	writeVaultBinary: (filePath: string, content: ArrayBuffer) => Promise<void>;
	getDefaultProviderTag: () => string | null;
	findProviderByTagExact: (tag?: string) => ProviderSettings | null;
	getModelDisplayName: (provider: ProviderSettings) => string;
	createSubAgentStateUpdater: (
		assistantMessage: ChatMessage,
		session: ChatSession,
		shouldAttachToSession: boolean
	) => SubAgentStateCallback;
	resolveToolRuntime: (options?: {
		includeSubAgents?: boolean;
		parentSessionId?: string;
		subAgentStateCallback?: SubAgentStateCallback;
		session?: ChatSession;
	}) => Promise<ResolvedToolRuntime>;
	buildProviderMessagesWithOptions: (
		session: ChatSession,
		options?: {
			context?: string;
			taskDescription?: string;
			systemPrompt?: string;
			modelTag?: string;
			requestTools?: ToolDefinition[];
		}
	) => Promise<ProviderMessage[]>;
	normalizeToolExecutionRecord: (
		record: ToolExecutionRecord
	) => ToolExecutionRecord;
	showMcpNoticeOnce: (message: string) => void;
	getOllamaCapabilities: (
		baseURL: string,
		model: string
	) => Promise<OllamaCapabilityCacheEntry>;
	normalizeOllamaBaseUrl: (baseURL?: string) => string;
	providerSupportsImageGeneration: (provider: ProviderSettings) => boolean;
	rethrowImageGenerationError: (error: unknown) => never;
	saveActiveSession: () => Promise<void>;
	emitState: () => void;
	getController: () => AbortController | null;
	setController: (controller: AbortController | null) => void;
}

export const handleAssistantGenerationError = (
	deps: Pick<ChatGenerationDeps, 'state' | 'emitState' | 'notify' | 'setController'>,
	session: ChatSession,
	error: unknown
): void => {
	DebugLogger.error('[Chat][ChatService] generateAssistantResponse error', error);
	deps.state.isGenerating = false;
	deps.setController(null);

	const errorMessage = t('Generation failed. Please try again later.');

	deps.state.error = errorMessage;
	if (session.messages.length > 0) {
		const last = session.messages[session.messages.length - 1];
		if (last.role === 'assistant') {
			last.isError = true;
			if (!last.content) {
				last.content = errorMessage;
			}
		}
	}
	deps.emitState();
	deps.notify(errorMessage, 10000);
};

export const generateAssistantResponse = async (
	deps: ChatGenerationDeps,
	session: ChatSession
): Promise<void> => {
	const modelTag = deps.state.selectedModelId ?? deps.getDefaultProviderTag();
	if (!modelTag) {
		deps.notify(localInstance.no_ai_model_configured);
		return;
	}

	try {
		const assistantMessage = await generateAssistantResponseForModel(
			deps,
			session,
			modelTag,
			{
				createMessageInSession: true,
				manageGeneratingState: true,
			}
		);

		if (deps.state.shouldSaveHistory && session.filePath) {
			try {
				await deps.sessionManager.appendMessageToFile(session.filePath, assistantMessage);
			} catch (error) {
				DebugLogger.error('[ChatService] 追加AI回复失败', error);
			}
		} else if (deps.state.shouldSaveHistory) {
			DebugLogger.warn('[ChatService] 会话没有文件路径，回退到完整保存');
			try {
				await deps.saveActiveSession();
			} catch (error) {
				DebugLogger.error('[ChatService] 保存AI回复失败', error);
			}
		}
	} catch (error) {
		handleAssistantGenerationError(deps, session, error);
	}
};

export const generateAssistantResponseForModel = async (
	deps: ChatGenerationDeps,
	session: ChatSession,
	modelTag: string,
	options?: GenerateAssistantOptions
): Promise<ChatMessage> => {
	return await generateAssistantResponseForModelImpl(
		deps,
		session,
		modelTag,
		options,
	);
};
