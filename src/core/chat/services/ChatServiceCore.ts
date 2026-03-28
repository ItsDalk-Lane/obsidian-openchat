import OpenChatPlugin from 'src/main';
import type { ProviderSettings } from 'src/types/provider';
import type {
	ToolDefinition,
	ToolExecutionRecord,
} from 'src/types/tool';
import { resolveToolExecutionSettings } from 'src/settings/ai-runtime';
import { MessageService } from './MessageService';
import { HistoryService } from './HistoryService';
import { FileContentService, type FileContentOptions } from './FileContentService';
import type {
	ChatMessage,
	ChatSession,
	ChatSettings,
	ChatState,
	SelectedFile,
	SelectedFolder,
} from '../types/chat';
import { DEFAULT_CHAT_SETTINGS } from '../types/chat';
import type { LayoutMode, MultiModelMode } from '../types/multiModel';
import { DebugLogger } from 'src/utils/DebugLogger';
import type { ChatRuntimeDeps } from '../runtime/ChatRuntimeDeps';
import type { ToolCall } from '../types/tools';
import { getChatHistoryPath } from 'src/utils/AIPathManager';
import type { MultiModelChatService } from './MultiModelChatService';
import type { MultiModelConfigService } from './MultiModelConfigService';
import {
	buildSkillsSystemPromptBlock,
} from 'src/domains/skills/service';
import type { SkillDefinition, SkillScanResult } from 'src/domains/skills/types';
import { MessageContextOptimizer } from './MessageContextOptimizer';
import {
	type ResolvedToolRuntime,
	SubAgentScannerService,
	type SubAgentStateCallback,
	SubAgentWatcherService,
} from 'src/tools/sub-agents';
import { SKILL_TOOL_NAME } from 'src/tools/skill/skill-tools';
import { ChatStateStore } from './ChatStateStore';
import {
	ChatAttachmentSelectionService,
	type AttachmentSelectionSnapshot,
} from './ChatAttachmentSelectionService';
import { ChatPlanSyncService } from './ChatPlanSyncService';
import { ChatToolRuntimeResolver } from './ChatToolRuntimeResolver';
import { ChatSessionManager } from './ChatSessionManager';
import { ChatImageResolver } from './ChatImageResolver';
import { ChatContextCompactionService } from './ChatContextCompactionService';
import { type OllamaCapabilityCacheEntry } from './chatProviderHelpers';

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

export abstract class ChatServiceCore {
	protected static readonly LAYOUT_MODE_STORAGE_KEY = 'openchat-chat-layout-mode';
	protected settings: ChatSettings = DEFAULT_CHAT_SETTINGS;
	protected readonly messageService: MessageService;
	protected readonly historyService: HistoryService;
	protected readonly fileContentService: FileContentService;
	protected readonly messageContextOptimizer: MessageContextOptimizer;
	protected readonly stateStore: ChatStateStore;
	protected readonly attachmentSelectionService: ChatAttachmentSelectionService;
	protected readonly planSyncService: ChatPlanSyncService;
	protected readonly toolRuntimeResolver: ChatToolRuntimeResolver;
	protected readonly sessionManager: ChatSessionManager;
	protected readonly imageResolver: ChatImageResolver;
	protected readonly contextCompactionService: ChatContextCompactionService;
	protected multiModelService: MultiModelChatService | null = null;
	protected multiModelConfigService: MultiModelConfigService | null = null;
	protected controller: AbortController | null = null;
	protected ollamaCapabilityCache = new Map<string, OllamaCapabilityCacheEntry>();
	protected lastMcpNoticeAt = 0;
	protected pendingTriggerSource: ChatTriggerSource = 'chat_input';
	protected readonly subAgentScannerService: SubAgentScannerService;
	protected readonly subAgentWatcherService: SubAgentWatcherService;

	constructor(
		protected readonly plugin: OpenChatPlugin,
		protected readonly runtimeDeps: ChatRuntimeDeps,
	) {
		this.stateStore = new ChatStateStore({
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
		this.fileContentService = new FileContentService(plugin.app);
		this.messageService = new MessageService(plugin.app, this.fileContentService);
		this.historyService = new HistoryService(plugin.app, getChatHistoryPath(plugin.settings.aiDataFolder));
		this.messageContextOptimizer = new MessageContextOptimizer();
		this.attachmentSelectionService = new ChatAttachmentSelectionService(
			this.stateStore,
			() => this.settings.autoAddActiveFile,
		);
		this.planSyncService = new ChatPlanSyncService(this.stateStore, this.historyService);
		this.subAgentScannerService = new SubAgentScannerService(plugin.app, {
			getAiDataFolder: () => this.plugin.settings.aiDataFolder,
		});
		this.subAgentWatcherService = new SubAgentWatcherService(plugin.app, this.subAgentScannerService);
		this.toolRuntimeResolver = new ChatToolRuntimeResolver({
			plugin: this.plugin,
			runtimeDeps: this.runtimeDeps,
			subAgentScannerService: this.subAgentScannerService,
			planSyncService: this.planSyncService,
			getActiveSession: () => this.state.activeSession,
			getMcpToolMode: () => this.state.mcpToolMode,
			getMcpSelectedServerIds: () => [...this.state.mcpSelectedServerIds],
			getMaxToolCallLoops: () => this.getMaxToolCallLoops(),
			showMcpNoticeOnce: (message) => this.showMcpNoticeOnce(message),
			chatServiceAdapter: this,
		});
		this.sessionManager = new ChatSessionManager(
			this.plugin.app,
			this.plugin.settings.aiDataFolder,
			{
				getState: () => this.state,
				getSettings: () => this.settings,
				getDefaultProviderTag: () => this.getDefaultProviderTag(),
				applySessionSelection: (session) => this.attachmentSelectionService.applySessionSelection(session),
				emitState: () => this.emitState(),
				queueSessionPlanSync: (session) => this.queueSessionPlanSync(session),
			}
		);
		this.imageResolver = new ChatImageResolver(this.plugin.app);
		this.contextCompactionService = new ChatContextCompactionService(this.plugin.app, {
			getMessageManagementSettings: () => this.getMessageManagementSettings(),
			getDefaultFileContentOptions: () => {
				const options = this.getDefaultFileContentOptions();
				return {
					maxFileSize: options.maxFileSize ?? 1024 * 1024,
					maxContentLength: options.maxContentLength ?? 10000,
					includeExtensions: options.includeExtensions ?? [],
					excludeExtensions: options.excludeExtensions ?? [],
					excludePatterns: options.excludePatterns ?? [],
				};
			},
			findProviderByTagExact: (tag: string) => this.findProviderByTagExact(tag),
		});
		void this.subAgentWatcherService.start().catch((error) => {
			DebugLogger.warn('[ChatService] 初始化 Sub Agent 监听失败', error);
		});
	}

	protected get app() {
		return this.plugin.app;
	}

	protected get state(): ChatState {
		return this.stateStore.getMutableState();
	}

	getCurrentModelTag(): string | null {
		return this.state.selectedModelId ?? this.getDefaultProviderTag();
	}

	protected getMaxToolCallLoops(): number | undefined {
		const maxLoops = resolveToolExecutionSettings(this.plugin.settings.aiRuntime).maxToolCalls;
		return typeof maxLoops === 'number' && maxLoops > 0 ? maxLoops : undefined;
	}

	protected createSubAgentStateUpdater(
		assistantMessage: ChatMessage,
		session: ChatSession,
		shouldAttachToSession: boolean,
	): SubAgentStateCallback {
		return (update) => {
			const metadata = { ...(assistantMessage.metadata ?? {}) };
			const subAgentStates = { ...(metadata.subAgentStates ?? {}) };
			subAgentStates[update.toolCallId] = update.state;
			assistantMessage.metadata = {
				...metadata,
				subAgent: update.state,
				subAgentStates,
			};

			const existingToolCalls = assistantMessage.toolCalls ?? [];
			const existingIndex = existingToolCalls.findIndex((record) => record.id === update.toolCallId);
			const nextRecord: ToolCall = {
				id: update.toolCallId,
				name: `sub_agent_${update.state.name}`,
				arguments: {
					task: update.task,
				},
				result: this.extractLatestSubAgentResult(update.state),
				status: update.state.status === 'running'
					? 'pending'
					: update.state.status === 'completed'
						? 'completed'
						: 'failed',
				timestamp: Date.now(),
			};
			if (existingIndex >= 0) {
				existingToolCalls[existingIndex] = nextRecord;
				assistantMessage.toolCalls = [...existingToolCalls];
			} else {
				assistantMessage.toolCalls = [...existingToolCalls, nextRecord];
			}

			session.updatedAt = Date.now();
			if (shouldAttachToSession) {
				this.emitState();
			}
		};
	}

	protected findInstalledSkillDefinition(skillName: string): SkillDefinition | undefined {
		const trimmedName = skillName.trim();
		if (!trimmedName) {
			return undefined;
		}

		const snapshotMatch = this.getInstalledSkillsSnapshot()?.skills.find((skill) => {
			return skill.metadata.name === trimmedName;
		});
		if (snapshotMatch) {
			return snapshotMatch;
		}

		return this.runtimeDeps.getSkillScannerService()?.findByName(trimmedName);
	}

	protected normalizeToolExecutionRecord(record: ToolExecutionRecord): ToolExecutionRecord {
		const normalizedArguments = { ...(record.arguments ?? {}) };
		if (record.name === SKILL_TOOL_NAME) {
			const skillName = typeof normalizedArguments.skill === 'string'
				? normalizedArguments.skill.trim()
				: '';

			if (skillName && typeof normalizedArguments.command !== 'string') {
				normalizedArguments.command = skillName;
			}

			if (skillName && typeof normalizedArguments.path !== 'string') {
				const definition = this.findInstalledSkillDefinition(skillName);
				if (definition?.skillFilePath) {
					normalizedArguments.path = definition.skillFilePath;
				}
			}
		}

		return {
			...record,
			arguments: normalizedArguments,
		};
	}

	protected async resolveSkillsSystemPromptBlock(
		requestTools: ToolDefinition[]
	): Promise<string | undefined> {
		const includesSkillTool = requestTools.some((tool) => tool.name === SKILL_TOOL_NAME);
		if (!includesSkillTool) {
			return undefined;
		}

		const cachedSkills = this.getInstalledSkillsSnapshot();
		if (cachedSkills) {
			return buildSkillsSystemPromptBlock(cachedSkills.skills);
		}

		try {
			const loadedSkills = await this.loadInstalledSkills();
			return buildSkillsSystemPromptBlock(loadedSkills.skills);
		} catch (error) {
			DebugLogger.warn('[ChatService] 构建 skills system prompt 失败，回退为空列表', error);
			return buildSkillsSystemPromptBlock([]);
		}
	}

	protected extractLatestSubAgentResult(state: {
		status: string;
		internalMessages: ChatMessage[];
	}): string | undefined {
		if (state.status === 'running') {
			return undefined;
		}
		const assistantMessages = state.internalMessages.filter((message) => message.role === 'assistant');
		return assistantMessages[assistantMessages.length - 1]?.content;
	}

	async resolveToolRuntime(options?: {
		includeSubAgents?: boolean;
		explicitToolNames?: string[];
		explicitMcpServerIds?: string[];
		parentSessionId?: string;
		subAgentStateCallback?: SubAgentStateCallback;
		session?: ChatSession;

	}): Promise<ResolvedToolRuntime> {
		return await this.toolRuntimeResolver.resolveToolRuntime(options);
	}

	protected abstract emitState(): void;

	protected abstract showMcpNoticeOnce(message: string): void;

	protected abstract getDefaultProviderTag(): string | null;

	protected abstract updateSettings(settings: Partial<ChatSettings>): void;

	protected abstract readPersistedLayoutMode(): LayoutMode | null;

	abstract stopGeneration(): void;

	protected abstract queueSessionPlanSync(session: ChatSession | null): void;

	protected abstract getMessageManagementSettings(): import('../types/chat').MessageManagementSettings;

	protected abstract getDefaultFileContentOptions(): FileContentOptions;

	abstract findProviderByTagExact(tag?: string): ProviderSettings | null;

	protected abstract syncSessionMultiModelState(session?: ChatSession | null): void;

	protected abstract persistActiveSessionMultiModelFrontmatter(): Promise<void>;

	protected abstract persistLayoutMode(mode: LayoutMode): void;

	protected abstract restoreMultiModelStateFromSession(session: ChatSession): {
		multiModelMode: MultiModelMode;
		activeCompareGroupId?: string;
		selectedModels: string[];
		layoutMode: LayoutMode;
	};

	abstract resolveProviderByTag(tag?: string): ProviderSettings | null;

	protected abstract resolveProvider(): ProviderSettings | null;

	abstract detectImageGenerationIntent(content: string): boolean;

	protected abstract isCurrentModelSupportImageGeneration(): boolean;

	protected abstract generateAssistantResponse(session: ChatSession): Promise<unknown>;

	protected abstract invalidateSessionContextCompaction(session: ChatSession): void;

	abstract generateAssistantResponseForModel(
		session: ChatSession,
		modelTag: string,
		options?: GenerateAssistantOptions
	): Promise<ChatMessage>;

	abstract getInstalledSkillsSnapshot(): SkillScanResult | null;

	abstract loadInstalledSkills(): Promise<SkillScanResult>;

	// Methods continue in ChatServiceMid.ts
}
