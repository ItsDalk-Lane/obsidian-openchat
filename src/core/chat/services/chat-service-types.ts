import type { Extension } from '@codemirror/state';
import type { App, Command, MarkdownView, TFile, WorkspaceLeaf } from 'obsidian';
import type { AiRuntimeSettings } from 'src/domains/settings/types-ai-runtime';
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
	SelectedTextContext,
	SelectedFile,
	SelectedFolder,
} from '../types/chat';
import type { ToolExecutionRecord } from 'src/types/tool';
import type {
	ToolUserInputRequest,
	ToolUserInputResponse,
} from 'src/types/tool';
import type { AttachmentSelectionSnapshot } from './chat-attachment-selection-service';
import type { FileContentService } from './file-content-service';
import type { MessageService } from './message-service';
import type { ResolvedToolRuntime, SubAgentStateCallback } from 'src/tools/sub-agents/types';
import type { SubAgentScannerService } from 'src/tools/sub-agents/SubAgentScannerService';
import type { SubAgentWatcherService } from 'src/tools/sub-agents/SubAgentWatcherService';
import type {
	ProviderToolDiscoveryPayload,
	ProviderToolExecutablePayload,
} from './chat-tool-selection-types';

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
	providerDiscoveryPayload?: ProviderToolDiscoveryPayload;
	providerExecutablePayload?: ProviderToolExecutablePayload;
}

export interface SavedChatSessionState extends AttachmentSelectionSnapshot {
	activeSession: ChatSession | null;
	selectedText?: string;
	selectedTextContext?: SelectedTextContext;
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

export interface ChatConsumerHost {
	app: App;
	notify(message: string, timeout?: number): void;
	requestToolUserInput(
		request: ToolUserInputRequest,
	): Promise<ToolUserInputResponse>;
	getManifestId(): string;
	getAiDataFolder(): string;
	getPluginSettings(): Readonly<PluginSettings>;
	getChatSettings(): Readonly<ChatSettings>;
	setChatSettings(nextSettings: ChatSettings): void;
	getAiRuntimeSettings(): Readonly<AiRuntimeSettings>;
	setAiRuntimeSettings(nextSettings: AiRuntimeSettings): void;
	saveSettings(): Promise<void>;
	openSettingsTab(): void;
	registerView(viewType: string, viewCreator: (leaf: WorkspaceLeaf) => unknown): void;
	addCommand(command: Command): void;
	getActiveMarkdownFile(): TFile | null;
	getActiveMarkdownView(): MarkdownView | null;
	getOpenMarkdownFiles(): TFile[];
	findLeafByViewType(viewType: string): WorkspaceLeaf | null;
	revealLeaf(leaf: WorkspaceLeaf): void;
	getLeaf(target: 'tab' | 'window'): WorkspaceLeaf;
	getSidebarLeaf(side: 'left' | 'right'): WorkspaceLeaf | null;
	setLeafViewState(leaf: WorkspaceLeaf, viewType: string, active: boolean): Promise<void>;
	isWorkspaceReady(): boolean;
	detachLeavesOfType(viewType: string): void;
	registerEditorExtension(extension: Extension | readonly Extension[]): void;
	updateWorkspaceOptions(): void;
	onWorkspaceLayoutChange(listener: () => void): () => void;
	onActiveMarkdownFileChange(listener: (file: TFile | null) => void): () => void;
	onMarkdownFileOpen(listener: (file: TFile | null) => void): () => void;
}

export interface ChatHostDeps {
	obsidianApi: ObsidianApiProvider;
	settingsAccessor: ChatSettingsAccessor;
	requestToolUserInput: ChatConsumerHost['requestToolUserInput'];
	createFileContentService(): FileContentService;
	createMessageService(fileContentService: FileContentService): MessageService;
	resolveVaultBasePath(): string | null;
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
