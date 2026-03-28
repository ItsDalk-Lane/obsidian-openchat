import type { ObsidianApiProvider } from 'src/providers/providers.types';
import type { ProviderSettings } from 'src/types/provider';
import type { ToolCall, ToolExecutionRecord } from 'src/types/tool';
import { getChatHistoryPath } from 'src/utils/AIPathManager';
import { DebugLogger } from 'src/utils/DebugLogger';
import type { SkillDefinition, SkillScanResult } from 'src/domains/skills/types';
import type { McpRuntimeManager } from 'src/domains/mcp/types';
import type { SubAgentScanResult } from 'src/tools/sub-agents';
import {
	SubAgentScannerService,
	type SubAgentStateCallback,
	SubAgentWatcherService,
} from 'src/tools/sub-agents';
import type { ResolvedContextBudget } from 'src/core/chat/utils/context-budget';
import { SKILL_TOOL_NAME } from 'src/tools/skill/skill-tools';
import { normalizeBuiltinServerId } from 'src/tools/runtime/constants';
import { buildSkillsSystemPromptBlock } from 'src/domains/skills/service';
import {
	resolveToolExecutionSettings,
	type AiRuntimeSettings,
} from 'src/settings/ai-runtime';
import type { McpSettings } from 'src/types/mcp';
import type {
	ChatMessage,
	ChatSession,
	ChatSettings,
	ChatState,
	MessageManagementSettings,
} from '../types/chat';
import { DEFAULT_CHAT_SETTINGS } from '../types/chat';
import type { LayoutMode, MultiModelMode, ParallelResponseGroup } from '../types/multiModel';
import type { ChatRuntimeDeps } from '../runtime/chat-runtime-deps';
import { MessageService } from './message-service';
import { HistoryService, type ChatHistoryEntry } from './history-service';
import { FileContentService, type FileContentOptions } from './file-content-service';
import type { MultiModelChatService } from './multi-model-chat-service';
import type { MultiModelConfigService } from './multi-model-config-service';
import { MessageContextOptimizer } from './message-context-optimizer';
import { ChatStateStore, type ChatStateSubscriber } from './chat-state-store';
import { ChatAttachmentSelectionService } from './chat-attachment-selection-service';
import { ChatPlanSyncService } from './chat-plan-sync-service';
import { ChatToolRuntimeResolver } from './chat-tool-runtime-resolver';
import { ChatSessionManager } from './chat-session-manager';
import { ChatImageResolver } from './chat-image-resolver';
import { ChatContextCompactionService } from './chat-context-compaction-service';
import type {
	ChatServiceDeps,
	ChatSettingsAccessor,
	ChatTriggerSource,
	GenerateAssistantOptions,
	PreparedChatRequest,
	SavedChatSessionState,
} from './chat-service-types';
import type { ChatGenerationFacade } from './chat-generation-facade';
import type {
	ChatMessageMutationFacade,
	ChatMessageOperationFacade,
} from './chat-message-facade';
import type { ChatProviderMessageFacade } from './chat-provider-message-facade';
import type { ChatPersistenceFacade } from './chat-persistence-facade';
import type { ChatCommandFacade } from './chat-command-facade';
import type { OllamaCapabilityCacheEntry } from './chat-provider-helpers';
import type { ChatService } from './chat-service';

export interface ChatServiceInternals {
	service: ChatService;
	settings: ChatSettings;
	runtimeDeps: ChatRuntimeDeps;
	settingsAccessor: ChatSettingsAccessor;
	obsidianApi: ObsidianApiProvider;
	stateStore: ChatStateStore;
	fileContentService: FileContentService;
	messageService: MessageService;
	historyService: HistoryService;
	messageContextOptimizer: MessageContextOptimizer;
	attachmentSelectionService: ChatAttachmentSelectionService;
	planSyncService: ChatPlanSyncService;
	toolRuntimeResolver: ChatToolRuntimeResolver;
	sessionManager: ChatSessionManager;
	imageResolver: ChatImageResolver;
	contextCompactionService: ChatContextCompactionService;
	multiModelService: MultiModelChatService | null;
	multiModelConfigService: MultiModelConfigService | null;
	controller: AbortController | null;
	ollamaCapabilityCache: Map<string, OllamaCapabilityCacheEntry>;
	lastMcpNoticeAt: number;
	pendingTriggerSource: ChatTriggerSource;
	subAgentScannerService: SubAgentScannerService;
	subAgentWatcherService: SubAgentWatcherService;
	coreInitialized: boolean;
	generationFacade: ChatGenerationFacade | null;
	messageOperationFacade: ChatMessageOperationFacade | null;
	messageMutationFacade: ChatMessageMutationFacade | null;
	providerMessageFacade: ChatProviderMessageFacade | null;
	persistenceFacade: ChatPersistenceFacade | null;
	commandFacade: ChatCommandFacade | null;
}

export const createChatServiceInternals = (
	service: ChatService,
	deps: ChatServiceDeps,
): ChatServiceInternals => {
	const stateStore = new ChatStateStore({
		activeSession: null,
		isGenerating: false,
		inputValue: '',
		selectedModelId: null,
		selectedModels: [],
		enableReasoningToggle: false,
		enableWebSearchToggle: false,
		enableTemplateAsSystemPrompt: false,
		contextNotes: [],
		selectedImages: [],
		selectedFiles: [],
		selectedFolders: [],
		selectedText: undefined,
		showTemplateSelector: false,
		shouldSaveHistory: true,
		mcpToolMode: 'auto',
		mcpSelectedServerIds: [],
		activeCompareGroupId: undefined,
		multiModelMode: 'single',
		parallelResponses: undefined,
		layoutMode: 'horizontal',
	});
	const settingsAccessor = deps.host.settingsAccessor;
	const obsidianApi = deps.host.obsidianApi;
	const fileContentService = deps.host.createFileContentService();
	const messageService = deps.host.createMessageService(fileContentService);
	const historyService = new HistoryService(
		obsidianApi,
		messageService,
		getChatHistoryPath(settingsAccessor.getAiDataFolder()),
	);
	const attachmentSelectionService = new ChatAttachmentSelectionService(
		stateStore,
		() => internals.settings.autoAddActiveFile,
	);
	const planSyncService = new ChatPlanSyncService(stateStore, historyService);
	const subAgentScannerService = deps.host.createSubAgentScannerService();
	const subAgentWatcherService =
		deps.host.createSubAgentWatcherService(subAgentScannerService);
	const toolRuntimeResolver = new ChatToolRuntimeResolver({
		createBuiltinToolsRuntime: deps.host.createBuiltinToolsRuntime,
		settingsAccessor,
		runtimeDeps: deps.runtimeDeps,
		subAgentScannerService,
		planSyncService,
		getActiveSession: () => stateStore.getMutableState().activeSession,
		getMcpToolMode: () => stateStore.getMutableState().mcpToolMode,
		getMcpSelectedServerIds: () => [...stateStore.getMutableState().mcpSelectedServerIds],
		getMaxToolCallLoops: () => service.getMaxToolCallLoops(),
		showMcpNoticeOnce: (message) => service.showMcpNoticeOnce(message),
		chatServiceAdapter: service,
	});
	const sessionManager = new ChatSessionManager(
		obsidianApi,
		settingsAccessor.getAiDataFolder(),
		messageService,
		{
			getState: () => stateStore.getMutableState(),
			getSettings: () => internals.settings,
			getDefaultProviderTag: () => service.getDefaultProviderTag(),
			applySessionSelection: (session) =>
				attachmentSelectionService.applySessionSelection(session),
			emitState: () => service.emitState(),
			queueSessionPlanSync: (session) => service.queueSessionPlanSync(session),
			persistSessionMultiModelFrontmatter: async (session) =>
				await service.persistSessionMultiModelFrontmatter(session),
		},
	);
	const imageResolver = new ChatImageResolver(obsidianApi);
	const contextCompactionService = new ChatContextCompactionService({
		getMessageManagementSettings: () => service.getMessageManagementSettings(),
		getDefaultFileContentOptions: () => {
			const options = service.getDefaultFileContentOptions();
			return {
				maxFileSize: options.maxFileSize ?? 1024 * 1024,
				maxContentLength: options.maxContentLength ?? 10000,
				includeExtensions: options.includeExtensions ?? [],
				excludeExtensions: options.excludeExtensions ?? [],
				excludePatterns: options.excludePatterns ?? [],
			};
		},
		findProviderByTagExact: (tag) => service.findProviderByTagExact(tag),
	});
	const internals: ChatServiceInternals = {
		service,
		settings: DEFAULT_CHAT_SETTINGS,
		runtimeDeps: deps.runtimeDeps,
		settingsAccessor,
		obsidianApi,
		stateStore,
		fileContentService,
		messageService,
		historyService,
		messageContextOptimizer: new MessageContextOptimizer(),
		attachmentSelectionService,
		planSyncService,
		toolRuntimeResolver,
		sessionManager,
		imageResolver,
		contextCompactionService,
		multiModelService: null,
		multiModelConfigService: null,
		controller: null,
		ollamaCapabilityCache: new Map<string, OllamaCapabilityCacheEntry>(),
		lastMcpNoticeAt: 0,
		pendingTriggerSource: 'chat_input',
		subAgentScannerService,
		subAgentWatcherService,
		coreInitialized: false,
		generationFacade: null,
		messageOperationFacade: null,
		messageMutationFacade: null,
		providerMessageFacade: null,
		persistenceFacade: null,
		commandFacade: null,
	};
	void subAgentWatcherService.start().catch((error) => {
		DebugLogger.warn('[ChatService] 初始化 Sub Agent 监听失败', error);
	});
	return internals;
};
