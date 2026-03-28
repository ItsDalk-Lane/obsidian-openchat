import type { AiRuntimeSettings } from 'src/settings/ai-runtime';
import type { PluginSettings } from 'src/domains/settings/types';
import type { BuiltinToolsRuntime, BuiltinToolsRuntimeSettings } from 'src/tools/runtime/BuiltinToolsRuntime';
import type { SkillScannerService } from 'src/domains/skills/service';
import type { ObsidianApiProvider } from 'src/providers/providers.types';
import type { ChatRuntimeDeps } from '../runtime/chat-runtime-deps';
import type {
	ChatMessage,
	ChatSession,
	ChatSettings,
	ChatState,
	SelectedFile,
	SelectedFolder,
} from '../types/chat';
import type { ToolExecutionRecord } from 'src/types/tool';
import type { AttachmentSelectionSnapshot } from './chat-attachment-selection-service';
import type { FileContentService } from './file-content-service';
import type { MessageService } from './message-service';
import type {
	ResolvedToolRuntime,
	SubAgentScannerService,
	SubAgentStateCallback,
	SubAgentWatcherService,
} from 'src/tools/sub-agents';

export type ChatTriggerSource =
	| 'chat_input'
	| 'selection_toolbar'
	| 'at_trigger'
	| 'command_palette';

export interface PreparedChatRequest {
	session: ChatSession;
	userMessage: ChatMessage;
	currentSelectedFiles: SelectedFile[];
	currentSelectedFolders: SelectedFolder[];
	originalUserInput: string;
	isImageGenerationIntent: boolean;
	isModelSupportImageGeneration: boolean;
	triggerSource: ChatTriggerSource;
}

export interface GenerateAssistantOptions {
	context?: string;
	taskDescription?: string;
	abortSignal?: AbortSignal;
	onChunk?: (chunk: string, message: ChatMessage) => void;
	onToolCallRecord?: (record: ToolExecutionRecord) => void;
	executionIndex?: number;
	systemPromptOverride?: string;
	createMessageInSession?: boolean;
	manageGeneratingState?: boolean;
	maxTokensOverride?: number;
	toolRuntimeOverride?: ResolvedToolRuntime;
}

export interface SavedChatSessionState extends AttachmentSelectionSnapshot {
	activeSession: ChatSession | null;
}

export interface ChatSettingsAccessor {
	getManifestId(): string;
	getAiDataFolder(): string;
	getPluginSettings(): Readonly<PluginSettings>;
	getChatSettings(): Readonly<ChatSettings>;
	setChatSettings(nextSettings: ChatSettings): void;
	getAiRuntimeSettings(): Readonly<AiRuntimeSettings>;
	setAiRuntimeSettings(nextSettings: AiRuntimeSettings): void;
	saveSettings(): Promise<void>;
	openSettingsTab(): void;
}

export interface ChatHostDeps {
	obsidianApi: ObsidianApiProvider;
	settingsAccessor: ChatSettingsAccessor;
	createFileContentService(): FileContentService;
	createMessageService(fileContentService: FileContentService): MessageService;
	createBuiltinToolsRuntime(
		settings: BuiltinToolsRuntimeSettings | undefined,
		skillScanner: SkillScannerService | null,
	): Promise<BuiltinToolsRuntime>;
	createSubAgentScannerService(): SubAgentScannerService;
	createSubAgentWatcherService(scanner: SubAgentScannerService): SubAgentWatcherService;
}

export interface ChatServiceDeps {
	host: ChatHostDeps;
	runtimeDeps: ChatRuntimeDeps;
}

export interface ChatServiceStatePort {
	getState(): ChatState;
	emitState(): void;
}

export interface ChatToolRuntimeAdapter {
	resolveToolRuntime(options?: {
		includeSubAgents?: boolean;
		explicitToolNames?: string[];
		explicitMcpServerIds?: string[];
		parentSessionId?: string;
		subAgentStateCallback?: SubAgentStateCallback;
		session?: ChatSession;
	}): Promise<ResolvedToolRuntime>;
}
