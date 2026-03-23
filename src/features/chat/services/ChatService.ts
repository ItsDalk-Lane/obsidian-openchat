import { MarkdownView, Notice, requestUrl, TFile, TFolder, normalizePath } from 'obsidian';
import { normalizeBuiltinServerId } from 'src/builtin-mcp/constants';
import OpenChatPlugin from 'src/main';
import {
	type PlanSnapshot,
} from 'src/builtin-mcp/runtime/plan-state';
import type { ProviderSettings, SaveAttachment } from 'src/features/tars/providers';
import type { Message as ProviderMessage, ResolveEmbedAsBinary } from 'src/features/tars/providers';
import type {
	ToolDefinition,
	ToolExecutionRecord,
} from 'src/features/tars/agent-loop/types';
import {
	availableVendors,
	resolveToolExecutionSettings,
	syncToolExecutionSettings,
	TarsSettings,
} from 'src/features/tars/settings';
import type { McpSettings } from 'src/features/tars/mcp';
import { isImageGenerationModel } from 'src/features/tars/providers/openRouter';
import { MessageService } from './MessageService';
import { HistoryService, ChatHistoryEntry } from './HistoryService';
import { FileContentService, type FileContentOptions } from './FileContentService';
import type {
	ChatContextCompactionState,
	ChatMessage,
	ChatRequestTokenState,
	ChatSession,
	ChatSettings,
	ChatState,
	MessageManagementSettings,
	McpToolMode,
	SelectedFile,
	SelectedFolder,
} from '../types/chat';
import {
	DEFAULT_CHAT_SETTINGS,
	DEFAULT_MESSAGE_MANAGEMENT_SETTINGS,
	normalizeMessageManagementSettings,
} from '../types/chat';
import type { CompareGroup, LayoutMode, MultiModelMode, ParallelResponseGroup } from '../types/multiModel';
import { v4 as uuidv4 } from 'uuid';
import { DebugLogger } from 'src/utils/DebugLogger';
import type { ChatRuntimeDeps } from '../runtime/ChatRuntimeDeps';
import { SystemPromptAssembler } from 'src/service/SystemPromptAssembler';
import { arrayBufferToBase64, getMimeTypeFromFilename } from 'src/features/tars/providers/utils';
import type { ToolCall } from '../types/tools';
import { getChatHistoryPath } from 'src/utils/AIPathManager';
import type { MultiModelChatService } from './MultiModelChatService';
import type { MultiModelConfigService } from './MultiModelConfigService';
import {
	buildSkillsSystemPromptBlock,
	type SkillDefinition,
	type SkillScanResult,
} from 'src/features/skills';
import { filterMessagesForCompareModel } from '../utils/compareContext';
import { buildEditedUserMessage, getEditableUserMessageContent } from '../utils/userMessageEditing';
import { composeChatSystemPrompt } from 'src/service/PromptBuilder';
import { localInstance } from 'src/i18n/locals';
import { ChatSettingsModal } from '../components/ChatSettingsModal';
import {
	MessageContextOptimizer,
	type MessageContextSummaryGenerator,
} from './MessageContextOptimizer';
import { resolveContextBudget, type ResolvedContextBudget } from '../utils/contextBudget';
import {
	estimateProviderMessagesTokens,
	estimateRequestPayloadTokens,
	estimateToolDefinitionTokens,
} from '../utils/token';
import {
	type ResolvedToolRuntime,
	type SubAgentScanResult,
	SubAgentScannerService,
	type SubAgentStateCallback,
	SubAgentWatcherService,
} from 'src/features/sub-agents';
import { SKILL_TOOL_NAME } from 'src/builtin-mcp/tools/skill-tools';
import { ChatStateStore, type ChatStateSubscriber } from './ChatStateStore';
import {
	ChatAttachmentSelectionService,
	type AttachmentSelectionSnapshot,
} from './ChatAttachmentSelectionService';
import { ChatPlanSyncService } from './ChatPlanSyncService';
import { ChatToolRuntimeResolver } from './ChatToolRuntimeResolver';
import { ChatSessionManager } from './ChatSessionManager';
import { ChatImageResolver } from './ChatImageResolver';
import { ChatContextCompactionService } from './ChatContextCompactionService';

type ChatTriggerSource =
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

interface SavedChatSessionState extends AttachmentSelectionSnapshot {
	activeSession: ChatSession | null;
}

const serializeContextCompaction = (
	compaction: ChatContextCompactionState | null | undefined
): string => JSON.stringify(compaction ?? null);

const serializeRequestTokenState = (
	state: ChatRequestTokenState | null | undefined
): string => JSON.stringify(state ?? null);

const isEphemeralContextMessage = (message: ChatMessage): boolean =>
	Boolean(message.metadata?.isEphemeralContext);

const formatPlanTaskForPrompt = (
	task: PlanSnapshot['tasks'][number],
	index: number
): string => {
	const criteria =
		task.acceptance_criteria.length > 0
			? task.acceptance_criteria.join('；')
			: '无';
	const outcome = task.outcome ? `；outcome=${task.outcome}` : '';
	return `${index + 1}. [${task.status}] ${task.name}；acceptance=${criteria}${outcome}`;
};

export class ChatService {
	private static readonly LAYOUT_MODE_STORAGE_KEY = 'openchat-chat-layout-mode';
	private settings: ChatSettings = DEFAULT_CHAT_SETTINGS;
	private readonly messageService: MessageService;
	private readonly historyService: HistoryService;
	private readonly fileContentService: FileContentService;
	private readonly messageContextOptimizer: MessageContextOptimizer;
	private readonly stateStore: ChatStateStore;
	private readonly attachmentSelectionService: ChatAttachmentSelectionService;
	private readonly planSyncService: ChatPlanSyncService;
	private readonly toolRuntimeResolver: ChatToolRuntimeResolver;
	private readonly sessionManager: ChatSessionManager;
	private readonly imageResolver: ChatImageResolver;
	private readonly contextCompactionService: ChatContextCompactionService;
	private multiModelService: MultiModelChatService | null = null;
	private multiModelConfigService: MultiModelConfigService | null = null;
	private controller: AbortController | null = null;
	private ollamaCapabilityCache = new Map<string, { reasoning: boolean; checkedAt: number; warned?: boolean }>();
	private lastMcpNoticeAt = 0;
	private chatSettingsModal: ChatSettingsModal | null = null;
	private pendingTriggerSource: ChatTriggerSource = 'chat_input';
	private readonly subAgentScannerService: SubAgentScannerService;
	private readonly subAgentWatcherService: SubAgentWatcherService;

	constructor(
		private readonly plugin: OpenChatPlugin,
		private readonly runtimeDeps: ChatRuntimeDeps,
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
			getDefaultFileContentOptions: () => this.getDefaultFileContentOptions(),
			findProviderByTagExact: (tag: string) => this.findProviderByTagExact(tag),
		});
		void this.subAgentWatcherService.start().catch((error) => {
			DebugLogger.warn('[ChatService] 初始化 Sub Agent 监听失败', error);
		});
	}

	private get app() {
		return this.plugin.app;
	}

	private get state(): ChatState {
		return this.stateStore.getMutableState();
	}

	getCurrentModelTag(): string | null {
		return this.state.selectedModelId ?? this.getDefaultProviderTag();
	}

	private getMaxToolCallLoops(): number | undefined {
		const maxLoops = resolveToolExecutionSettings(this.plugin.settings.tars.settings).maxToolCalls;
		return typeof maxLoops === 'number' && maxLoops > 0 ? maxLoops : undefined;
	}

	private createSubAgentStateUpdater(
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

	private findInstalledSkillDefinition(skillName: string): SkillDefinition | undefined {
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

	private normalizeToolExecutionRecord(record: ToolExecutionRecord): ToolExecutionRecord {
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

	private async resolveSkillsSystemPromptBlock(
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

	private extractLatestSubAgentResult(state: {
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

	private bindLivePlanStateSync(): void {
		void this.toolRuntimeResolver.ensureBuiltinToolsRuntime(this.state.activeSession).catch((error) => {
			console.warn('[ChatService] 初始化内置工具运行时失败:', error);
		});
	}

	private async persistSessionContextCompactionFrontmatter(
		session: ChatSession
	): Promise<void> {
		if (!this.state.shouldSaveHistory || !session.filePath) {
			return;
		}

		try {
			await this.sessionManager.updateSessionFrontmatter(session.filePath, {
				contextCompaction: session.contextCompaction ?? null,
				requestTokenState: session.requestTokenState ?? null,
			});
		} catch (error) {
			console.error('[ChatService] 持久化消息压缩状态失败:', error);
		}
	}

	private queueSessionPlanSync(session: ChatSession | null): void {
		this.planSyncService.queueSessionPlanSync(
			session,
			async (targetSession) => await this.toolRuntimeResolver.ensureBuiltinToolsRuntime(targetSession),
		);
	}

	private async ensurePlanSyncReady(): Promise<void> {
		await this.planSyncService.ensureReady();
	}

	initialize(initialSettings?: Partial<ChatSettings>) {
		this.updateSettings(initialSettings ?? {});

		const persistedLayoutMode = this.readPersistedLayoutMode();
		if (persistedLayoutMode) {
			this.state.layoutMode = persistedLayoutMode;
		}
		if (!this.state.selectedModelId) {
			this.state.selectedModelId = this.getDefaultProviderTag();
		}
		if (this.state.selectedModels.length === 0 && this.state.selectedModelId) {
			this.state.selectedModels = [this.state.selectedModelId];
		}
		if (!this.state.activeSession) {
			this.createNewSession();
		}
		this.bindLivePlanStateSync();
		this.queueSessionPlanSync(this.state.activeSession);
		this.emitState();
	}

	/**
	 * 聊天界面被真正打开时调用（区别于「新建聊天」和「从悬浮按钮恢复」）
	 * 将当前选中的模型重置为配置的默认模型
	 */
	onChatPanelOpen() {
		this.state.selectedModelId = this.settings.defaultModel || this.getDefaultProviderTag();
		this.emitState();
	}

	getState(): ChatState {
		return this.stateStore.getState();
	}

	getActiveSession(): ChatSession | null {
		return this.state.activeSession;
	}

	subscribe(callback: ChatStateSubscriber): () => void {
		return this.stateStore.subscribe(callback);
	}

	setMultiModelService(service: MultiModelChatService | null) {
		this.multiModelService = service;
	}

	setMultiModelConfigService(service: MultiModelConfigService | null) {
		this.multiModelConfigService = service;
	}

	getMultiModelConfigService(): MultiModelConfigService | null {
		return this.multiModelConfigService;
	}

	notifyStateChange() {
		this.stateStore.emit();
	}

	setGeneratingState(isGenerating: boolean) {
		this.stateStore.setGenerating(isGenerating, true);
	}

	setErrorState(error?: string) {
		this.stateStore.setError(error, true);
	}

	setParallelResponses(group?: ParallelResponseGroup) {
		this.stateStore.setParallelResponses(group, true);
	}

	clearParallelResponses() {
		this.stateStore.setParallelResponses(undefined, true);
	}

	createNewSession(initialTitle = '新的聊天'): ChatSession {
		// 如果正在生成内容，先停止生成
		if (this.state.isGenerating) {
			this.stopGeneration();
		}
		this.subAgentScannerService.clearCache();
		
		const now = Date.now();
		const session: ChatSession = {
			id: `chat-${uuidv4()}`,
			title: initialTitle,
			modelId: this.state.selectedModelId ?? this.getDefaultProviderTag() ?? '',
			messages: [],
			createdAt: now,
			updatedAt: now,
			contextNotes: [],
			selectedImages: [],
			enableTemplateAsSystemPrompt: false,
			multiModelMode: this.state.multiModelMode,
			activeCompareGroupId: this.state.activeCompareGroupId,
			layoutMode: this.state.layoutMode,
			livePlan: null,
			contextCompaction: null,
			requestTokenState: null,
		};
		this.stateStore.mutate((state) => {
			state.activeSession = session;
			state.contextNotes = [];
			state.selectedImages = [];
			state.selectedText = undefined;
			state.inputValue = '';
			state.enableTemplateAsSystemPrompt = false;
			state.selectedPromptTemplate = undefined;
			state.showTemplateSelector = false;
			state.mcpToolMode = 'auto';
			state.mcpSelectedServerIds = [];
			state.activeCompareGroupId = undefined;
			state.parallelResponses = undefined;
		});
		this.attachmentSelectionService.clearSelection(false);
		this.pendingTriggerSource = 'chat_input';
		this.emitState();
		this.queueSessionPlanSync(session);
		return session;
	}

	setInputValue(value: string) {
		this.state.inputValue = value;
		this.emitState();
	}

	addContextNote(note: string) {
		if (!note.trim()) return;
		const normalized = note.trim();
		this.state.contextNotes = Array.from(new Set([...this.state.contextNotes, normalized]));
		if (this.state.activeSession) {
			const sessionNotes = new Set(this.state.activeSession.contextNotes ?? []);
			sessionNotes.add(normalized);
			this.state.activeSession.contextNotes = Array.from(sessionNotes);
		}
		this.emitState();
	}

	removeContextNote(note: string) {
		this.state.contextNotes = this.state.contextNotes.filter((ctx) => ctx !== note);
		if (this.state.activeSession?.contextNotes) {
			this.state.activeSession.contextNotes = this.state.activeSession.contextNotes.filter((ctx) => ctx !== note);
		}
		this.emitState();
	}

	setSelectedImages(images: string[]) {
		this.state.selectedImages = images;
		this.emitState();
	}

	addSelectedImages(images: string[]) {
		if (images.length === 0) {
			return;
		}
		this.state.selectedImages = this.imageResolver.mergeSelectedImages(this.state.selectedImages, images);
		this.emitState();
	}

	removeSelectedImage(image: string) {
		this.state.selectedImages = this.state.selectedImages.filter((img) => img !== image);
		this.emitState();
	}

	// 选中文本管理方法
	setSelectedText(text: string) {
		this.state.selectedText = text;
		this.emitState();
	}

	setNextTriggerSource(source: ChatTriggerSource) {
		this.pendingTriggerSource = source;
	}

	clearSelectedText() {
		this.state.selectedText = undefined;
		this.emitState();
	}

	private consumePendingTriggerSource(): ChatTriggerSource {
		const triggerSource = this.pendingTriggerSource;
		this.pendingTriggerSource = 'chat_input';
		return triggerSource;
	}

	// 历史保存控制方法
	setShouldSaveHistory(shouldSave: boolean) {
		this.stateStore.setShouldSaveHistory(shouldSave, true);
	}

	getAutosaveChatEnabled(): boolean {
		return Boolean(this.settings.autosaveChat);
	}

	setReasoningToggle(enabled: boolean) {
		this.state.enableReasoningToggle = enabled;
		this.emitState();
	}

	setWebSearchToggle(enabled: boolean) {
		this.state.enableWebSearchToggle = enabled;
		this.emitState();
	}

	setTemplateAsSystemPromptToggle(enabled: boolean) {
		const session = this.state.activeSession;
		if (
			this.state.enableTemplateAsSystemPrompt === enabled &&
			(!session || session.enableTemplateAsSystemPrompt === enabled)
		) {
			return;
		}

		this.state.enableTemplateAsSystemPrompt = enabled;
		if (session) {
			session.enableTemplateAsSystemPrompt = enabled;
			if (session.filePath) {
				void this.sessionManager.updateSessionFrontmatter(session.filePath, {
					enableTemplateAsSystemPrompt: enabled
				}).catch((error) => {
					console.error('[ChatService] 更新模板系统提示词开关失败:', error);
				});
			}
		}
		this.emitState();
	}

	getReasoningToggle(): boolean {
		return this.state.enableReasoningToggle;
	}

	getWebSearchToggle(): boolean {
		return this.state.enableWebSearchToggle;
	}

	getTemplateAsSystemPromptToggle(): boolean {
		return this.state.enableTemplateAsSystemPrompt;
	}

	private getTarsToolSettings() {
		const tools = this.plugin.settings.tars.settings.tools;
		return (
			tools ?? {
				globalTools: [],
				executionMode: 'manual' as const,
				enabled: false
			}
		);
	}







	/**
	 * 获取消息服务实例
	 */
	getMessageService(): MessageService {
		return this.messageService;
	}































	/**
	 * 保存当前会话状态（用于模态框模式）
	 * @returns 保存的会话状态
	 */
	saveSessionState(): SavedChatSessionState {
		const selection = this.attachmentSelectionService.getSelectionSnapshot();
		return {
			activeSession: this.state.activeSession ? JSON.parse(JSON.stringify(this.state.activeSession)) : null,
			selectedFiles: selection.selectedFiles,
			selectedFolders: selection.selectedFolders,
		};
	}

	/**
	 * 恢复会话状态（用于模态框模式）
	 * @param savedState 保存的会话状态
	 */
	restoreSessionState(savedState: SavedChatSessionState) {
		if (savedState.activeSession) {
			this.stateStore.setActiveSession(savedState.activeSession);
			this.state.enableTemplateAsSystemPrompt = savedState.activeSession.enableTemplateAsSystemPrompt ?? false;
		} else {
			this.stateStore.setActiveSession(null);
			this.state.enableTemplateAsSystemPrompt = false;
		}
		this.attachmentSelectionService.restoreSelection({
			selectedFiles: savedState.selectedFiles,
			selectedFolders: savedState.selectedFolders,
		}, false);
		this.stateStore.emit();
		this.queueSessionPlanSync(this.state.activeSession);
	}

	// 文件和文件夹管理方法
	addSelectedFile(file: TFile) {
		this.attachmentSelectionService.addSelectedFile(file);
	}

	// 添加活跃文件（自动添加）
	addActiveFile(file: TFile | null) {
		this.attachmentSelectionService.addActiveFile(file);
	}

	// 移除自动添加的活跃文件
	removeAutoAddedFile(filePath: string) {
		this.attachmentSelectionService.removeAutoAddedFile(filePath);
	}
	// 移除所有自动添加的文件
	removeAllAutoAddedFiles() {
		this.attachmentSelectionService.removeAllAutoAddedFiles();
	}

	// 获取所有自动添加的文件
	getAutoAddedFiles(): SelectedFile[] {
		return this.attachmentSelectionService.getAutoAddedFiles();
	}

	// 编辑区无活动文件时重置会话标记
	onNoActiveFile() {
		this.attachmentSelectionService.onNoActiveFile();
	}

	// 重新打开AI Chat界面时清除当前文件的手动移除标记
	onChatViewReopened(currentFile: TFile | null) {
		this.attachmentSelectionService.onChatViewReopened(currentFile);
	}

	addSelectedFolder(folder: TFolder) {
		this.attachmentSelectionService.addSelectedFolder(folder);
	}

	removeSelectedFile(fileId: string, isManualRemoval = true) {
		this.attachmentSelectionService.removeSelectedFile(fileId, isManualRemoval);
	}

	removeSelectedFolder(folderId: string) {
		this.attachmentSelectionService.removeSelectedFolder(folderId);
	}

	setSelectedFiles(files: SelectedFile[]) {
		this.attachmentSelectionService.setSelectedFiles(files);
	}

	setSelectedFolders(folders: SelectedFolder[]) {
		this.attachmentSelectionService.setSelectedFolders(folders);
	}

	// 模板选择相关方法
	setTemplateSelectorVisibility(visible: boolean) {
		this.state.showTemplateSelector = visible;
		this.emitState();
	}

	/**
	 * 返回所有已启用的 MCP 服务器配置（供 UI 展示 MCP 服务器列表）
	 */
	getEnabledMcpServers(): Array<{ id: string; name: string }> {
		return this.toolRuntimeResolver.getEnabledMcpServers();
	}

	async getBuiltinToolsForSettings() {
		return await this.toolRuntimeResolver.getBuiltinToolsForSettings();
	}

	/**
	 * 设置当前会话的 MCP 工具调用模式
	 */
	setMcpToolMode(mode: McpToolMode) {
		this.stateStore.setMcpToolMode(mode, true);
	}

	/**
	 * 设置手动模式下选中的 MCP 服务器 ID 列表
	 */
	setMcpSelectedServerIds(ids: string[]) {
		this.state.mcpSelectedServerIds = ids.map(normalizeBuiltinServerId);
		this.emitState();
	}

	async selectPromptTemplate(templatePath: string) {
		try {
			// 读取模板文件内容
			const templateFile = this.plugin.app.vault.getAbstractFileByPath(templatePath);
			if (!templateFile || !(templateFile instanceof TFile)) {
				throw new Error(`模板文件不存在: ${templatePath}`);
			}

			const templateContent = await this.plugin.app.vault.read(templateFile);
			const templateName = templateFile.basename;

			// 设置选中的模板
			this.state.selectedPromptTemplate = {
				path: templatePath,
				name: templateName,
				content: templateContent
			};

			// 隐藏模板选择器
			this.state.showTemplateSelector = false;

			// 不修改输入框内容，保持用户当前的输入
			// 模板内容将作为系统提示词在发送消息时使用

			this.emitState();
		} catch (error) {
			console.error('[ChatService] 选择提示词模板失败:', error);
			new Notice(`选择提示词模板失败: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	clearSelectedPromptTemplate() {
		this.state.selectedPromptTemplate = undefined;
		this.emitState();
	}

	getPromptTemplateContent(): string | undefined {
		return this.state.selectedPromptTemplate?.content;
	}

	hasPromptTemplateVariables(): boolean {
		if (!this.state.selectedPromptTemplate?.content) return false;
		const variableRegex = /\{\{([^}]+)\}\}/g;
		return variableRegex.test(this.state.selectedPromptTemplate.content);
	}

	setModel(tag: string) {
		this.state.selectedModelId = tag;
		if (this.state.multiModelMode === 'single') {
			this.state.selectedModels = tag ? [tag] : [];
		}
		if (this.state.activeSession) {
			this.state.activeSession.modelId = tag;
		}
		this.emitState();
	}

	setSelectedModels(tags: string[]) {
		this.state.selectedModels = Array.from(new Set(tags.filter(Boolean)));
		this.emitState();
	}

	addSelectedModel(tag: string) {
		if (!tag) return;
		this.state.selectedModels = Array.from(new Set([...this.state.selectedModels, tag]));
		this.emitState();
	}

	removeSelectedModel(tag: string) {
		this.state.selectedModels = this.state.selectedModels.filter((item) => item !== tag);
		this.emitState();
	}

	getSelectedModels(): string[] {
		return [...this.state.selectedModels];
	}

	setMultiModelMode(mode: MultiModelMode) {
		this.state.multiModelMode = mode;
		if (mode === 'single' && this.state.selectedModelId) {
			this.state.selectedModels = [this.state.selectedModelId];
		}
		this.syncSessionMultiModelState();
		void this.persistActiveSessionMultiModelFrontmatter();
		this.emitState();
	}

	setLayoutMode(mode: LayoutMode) {
		this.state.layoutMode = mode;
		this.syncSessionMultiModelState();
		this.persistLayoutMode(mode);
		void this.persistActiveSessionMultiModelFrontmatter();
		this.emitState();
	}

	setActiveCompareGroup(groupId?: string) {
		this.state.activeCompareGroupId = groupId;
		this.syncSessionMultiModelState();
		void this.persistActiveSessionMultiModelFrontmatter();
		this.emitState();
	}

	async loadCompareGroups(): Promise<CompareGroup[]> {
		if (!this.multiModelConfigService) {
			return [];
		}
		return this.multiModelConfigService.loadCompareGroups();
	}

	async saveCompareGroup(group: CompareGroup): Promise<string | null> {
		if (!this.multiModelConfigService) {
			return null;
		}
		return this.multiModelConfigService.saveCompareGroup(group);
	}

	async deleteCompareGroup(id: string): Promise<void> {
		if (!this.multiModelConfigService) {
			return;
		}
		await this.multiModelConfigService.deleteCompareGroup(id);
	}

	watchMultiModelConfigs(callback: Parameters<MultiModelConfigService['watchConfigs']>[0]): (() => void) | null {
		if (!this.multiModelConfigService) {
			return null;
		}
		return this.multiModelConfigService.watchConfigs(callback);
	}

	async prepareChatRequest(
		content?: string,
		options?: { skipImageSupportValidation?: boolean }
	): Promise<PreparedChatRequest | null> {
		if (this.state.isGenerating) {
			new Notice('当前已有请求在进行中，请稍候...');
			return null;
		}

		const contentToSend = content ?? this.state.inputValue;
		const inputReferencedImages = await this.imageResolver.resolveImagesFromInputReferences(contentToSend);
		if (inputReferencedImages.length > 0) {
			this.state.selectedImages = this.imageResolver.mergeSelectedImages(this.state.selectedImages, inputReferencedImages);
		}

		const trimmed = contentToSend.trim();
		if (
			!trimmed &&
			this.state.selectedImages.length === 0 &&
			this.state.selectedFiles.length === 0 &&
			this.state.selectedFolders.length === 0
		) {
			return null;
		}

		const originalUserInput = trimmed;
		const isImageGenerationIntent = this.detectImageGenerationIntent(originalUserInput);
		const isModelSupportImageGeneration = this.isCurrentModelSupportImageGeneration();

		if (
			!options?.skipImageSupportValidation &&
			isImageGenerationIntent &&
			!isModelSupportImageGeneration
		) {
			const provider = this.resolveProvider();
			const modelName = provider?.options.model || '当前模型';
			new Notice(`⚠️ 当前模型 (${modelName}) 不支持图像生成功能。

请选择支持图像生成的模型，如：
• google/gemini-2.5-flash-image-preview
• openai/gpt-5-image-mini
• 其他包含 "image" 的模型`, 10000);
			return null;
		}

		const session = this.state.activeSession ?? this.createNewSession();
		this.syncSessionMultiModelState(session);
		this.attachmentSelectionService.syncSelectionToSession(session);
		const triggerSource = this.consumePendingTriggerSource();
		const selectionSnapshot = this.attachmentSelectionService.getSelectionSnapshot();

		const selectedPromptTemplate = this.state.selectedPromptTemplate;
		const useTemplateAsSystemPrompt =
			this.state.enableTemplateAsSystemPrompt &&
			!!selectedPromptTemplate?.content;

		let finalUserMessage = originalUserInput;
		let taskTemplate: string | undefined;

		if (selectedPromptTemplate && !useTemplateAsSystemPrompt) {
			const templateContent = selectedPromptTemplate.content;
			const templateName = selectedPromptTemplate.name;
			finalUserMessage = `${originalUserInput}\n\n[[${templateName}]]`;
			taskTemplate = templateContent;
		}

		let systemPrompt: string | undefined;
		if (useTemplateAsSystemPrompt && selectedPromptTemplate) {
			systemPrompt = selectedPromptTemplate.content;
		} else {
			const assembler = new SystemPromptAssembler(this.app);
			const built = await assembler.buildGlobalSystemPrompt('tars_chat');
			if (built && built.trim().length > 0) {
				systemPrompt = built;
			}
		}

		let messageContent = finalUserMessage;
		if (
			selectionSnapshot.selectedFiles.length > 0
			|| selectionSnapshot.selectedFolders.length > 0
		) {
			const fileTags: string[] = [];
			const folderTags: string[] = [];

			for (const file of selectionSnapshot.selectedFiles) {
				fileTags.push(`[[${file.name}]]`);
			}

			for (const folder of selectionSnapshot.selectedFolders) {
				folderTags.push(`#${folder.path}`);
			}

			if (fileTags.length > 0 || folderTags.length > 0) {
				const allTags = [...fileTags, ...folderTags].join(' ');
				messageContent += `\n\n${allTags}`;
			}
		}

		const userMessage = this.messageService.createMessage('user', messageContent, {
			images: this.state.selectedImages,
			metadata: {
				taskUserInput: originalUserInput,
				taskTemplate,
				selectedText: this.state.selectedText,
				triggerSource,
			}
		});

		if (messageContent.trim() || this.state.selectedImages.length > 0) {
			session.messages.push(userMessage);
		}
		session.updatedAt = Date.now();
		session.systemPrompt = systemPrompt;
		session.enableTemplateAsSystemPrompt = this.state.enableTemplateAsSystemPrompt;

		const currentSelectedFiles = [...selectionSnapshot.selectedFiles];
		const currentSelectedFolders = [...selectionSnapshot.selectedFolders];
		this.state.inputValue = '';
		this.state.selectedImages = [];
		this.attachmentSelectionService.clearSelection(false);
		this.state.selectedText = undefined;
		this.state.selectedPromptTemplate = undefined;
		this.emitState();

		if (this.state.shouldSaveHistory) {
			if (session.messages.length === 1 || (systemPrompt && session.messages.length === 2)) {
				try {
					const firstMessage = session.messages[0];
					session.filePath = await this.sessionManager.createNewSessionFileWithFirstMessage(
						session,
						firstMessage,
						currentSelectedFiles,
						currentSelectedFolders
					);
				} catch (error) {
					console.error('[ChatService] 创建会话文件失败:', error);
					new Notice('创建会话文件失败，但消息已发送');
				}
			} else {
				try {
					const lastMessage = session.messages.last();
					if (lastMessage) {
						await this.sessionManager.appendMessageToFile(
							session.filePath ?? '',
							lastMessage,
							currentSelectedFiles,
							currentSelectedFolders
						);
					}
				} catch (error) {
					console.error('[ChatService] 追加用户消息失败:', error);
				}
			}
		}

		return {
			session,
			userMessage,
			currentSelectedFiles,
			currentSelectedFolders,
			originalUserInput,
			isImageGenerationIntent,
			isModelSupportImageGeneration,
			triggerSource,
		};
	}

	async sendMessage(content?: string) {
		const prepared = await this.prepareChatRequest(content, {
			skipImageSupportValidation: this.state.multiModelMode !== 'single'
		});
		if (!prepared) {
			return;
		}
		await this.ensurePlanSyncReady();

		if (this.state.multiModelMode === 'compare') {
			if (!this.multiModelService) {
				new Notice('多模型服务尚未初始化');
				return;
			}
			await this.multiModelService.sendCompareMessage(prepared);
			return;
		}

		if (prepared.isImageGenerationIntent && prepared.isModelSupportImageGeneration) {
			const provider = this.resolveProvider();
			const modelName = provider?.options.model || '当前模型';
			new Notice(`🎨 正在使用模型 ${modelName} 生成图片，请稍候...`);
		}

		const provider = this.resolveProvider();
		if (!provider) {
			new Notice('尚未配置任何AI模型，请先在Tars设置中添加Provider。');
			return;
		}

		await this.generateAssistantResponse(prepared.session);
	}

	stopGeneration() {
		if (this.state.multiModelMode !== 'single' && this.multiModelService) {
			this.multiModelService.stopAllGeneration();
		}
		if (this.controller) {
			this.controller.abort();
			this.controller = null;
		}
		if (this.state.isGenerating) {
			this.state.isGenerating = false;
			this.emitState();
		}
	}

	stopAllGeneration() {
		this.multiModelService?.stopAllGeneration();
		if (this.controller) {
			this.controller.abort();
			this.controller = null;
		}
		if (this.state.isGenerating) {
			this.state.isGenerating = false;
			this.emitState();
		}
	}

	stopModelGeneration(modelTag: string) {
		this.multiModelService?.stopModelGeneration(modelTag);
	}

	async retryModel(messageId: string) {
		if (!this.multiModelService) {
			return;
		}
		await this.multiModelService.retryModel(messageId);
	}

	async retryAllFailed() {
		if (!this.multiModelService) {
			return;
		}
		await this.multiModelService.retryAllFailed();
	}

	async listHistory(): Promise<ChatHistoryEntry[]> {
		return this.sessionManager.listHistory();
	}

	async loadHistory(filePath: string) {
		const session = await this.sessionManager.loadHistory(filePath);
		if (session) {
			session.enableTemplateAsSystemPrompt = session.enableTemplateAsSystemPrompt ?? false;
			// 设置文件路径，以便后续追加消息
			session.filePath = filePath;
			this.stateStore.setActiveSession(session);
			this.state.contextNotes = session.contextNotes ?? [];
			this.state.selectedImages = session.selectedImages ?? [];
			this.attachmentSelectionService.applySessionSelection(session);
			this.state.selectedModelId = session.modelId || this.settings.defaultModel || this.getDefaultProviderTag();
			const restoredMultiModelState = this.restoreMultiModelStateFromSession(session);
			this.state.multiModelMode = restoredMultiModelState.multiModelMode;
			this.state.activeCompareGroupId = restoredMultiModelState.activeCompareGroupId;
			this.state.selectedModels = restoredMultiModelState.selectedModels;
			this.state.layoutMode = restoredMultiModelState.layoutMode;
			this.state.parallelResponses = undefined;
			this.state.enableTemplateAsSystemPrompt = session.enableTemplateAsSystemPrompt;
			// 重置模板选择状态
			this.state.selectedPromptTemplate = undefined;
			this.state.showTemplateSelector = false;
			this.emitState();
			this.queueSessionPlanSync(session);
		}
	}

	async saveActiveSession() {
		if (!this.state.activeSession) return;
		await this.sessionManager.saveSession(this.state.activeSession);
	}

	async deleteHistory(filePath: string) {
		await this.sessionManager.deleteHistory(filePath);
	}

	updateSettings(settings: Partial<ChatSettings>) {
		const mergedMessageManagement = normalizeMessageManagementSettings({
			...(this.settings.messageManagement ?? {}),
			...(settings.messageManagement ?? {}),
		});
		this.settings = {
			...this.settings,
			...settings,
			messageManagement: mergedMessageManagement,
		};
		this.sessionManager.setHistoryFolder(getChatHistoryPath(this.plugin.settings.aiDataFolder));
		if ('autosaveChat' in settings) {
			this.stateStore.setShouldSaveHistory(Boolean(this.settings.autosaveChat));
		}
		// 仅在尚未设置时才初始化默认模型；运行时模型切换由 onChatPanelOpen() 管理
		if (!this.state.selectedModelId) {
			this.state.selectedModelId = this.settings.defaultModel || this.getDefaultProviderTag();
		}
		this.emitState();
	}

	async editMessage(messageId: string, content: string) {
		const session = this.state.activeSession;
		if (!session) return;
		const message = session.messages.find((msg) => msg.id === messageId);
		if (!message || message.role !== 'user') return;
		const editedMessage = buildEditedUserMessage(message, content);
		message.content = editedMessage.content;
		message.metadata = editedMessage.metadata;
		message.timestamp = Date.now();
		session.updatedAt = Date.now();
		this.invalidateSessionContextCompaction(session);
		this.emitState();
		
		// 使用rewriteMessagesOnly更新文件，而不是重写整个文件
		if (session.filePath) {
			try {
				await this.sessionManager.rewriteMessagesOnly(session.filePath, session.messages);
			} catch (error) {
				console.error('[ChatService] 更新消息编辑失败:', error);
				new Notice('更新文件失败，但消息已从界面更新');
			}
		}
	}

	async editAndRegenerate(messageId: string, content: string) {
		const session = this.state.activeSession;
		if (!session || this.state.isGenerating) return;

		// 找到要编辑的消息
		const messageIndex = session.messages.findIndex((msg) => msg.id === messageId);
		if (messageIndex === -1) return;

		const message = session.messages[messageIndex];
		if (!message || message.role !== 'user') return;

			// 更新消息内容
			const editedMessage = buildEditedUserMessage(message, content);
			message.content = editedMessage.content;
			message.metadata = { ...(editedMessage.metadata ?? {}) };
			message.timestamp = Date.now();

			// 删除这条消息之后的所有消息（包括AI回复）
		session.messages = session.messages.slice(0, messageIndex + 1);
		session.updatedAt = Date.now();
		this.invalidateSessionContextCompaction(session);
		this.emitState();

		// 使用rewriteMessagesOnly更新文件，而不是重写整个文件
		if (session.filePath) {
			try {
				await this.sessionManager.rewriteMessagesOnly(session.filePath, session.messages);
			} catch (error) {
				console.error('[ChatService] 更新消息编辑失败:', error);
				// 不显示通知，避免干扰用户重新生成流程
			}
		}

		// 对比模式：使用多模型服务重新生成
		if (this.state.multiModelMode === 'compare' && this.multiModelService) {
			const editableContent = getEditableUserMessageContent(message);
			const prepared: PreparedChatRequest = {
				session,
				userMessage: message,
				currentSelectedFiles: [...(session.selectedFiles ?? [])],
				currentSelectedFolders: [...(session.selectedFolders ?? [])],
				originalUserInput: editableContent,
				intentRecognitionInput: editableContent,
				isImageGenerationIntent: this.detectImageGenerationIntent(editableContent),
				isModelSupportImageGeneration: this.isCurrentModelSupportImageGeneration(),
				triggerSource: 'chat_input',
				pendingClarificationContext: null,
			};
			await this.multiModelService.sendCompareMessage(prepared);
			return;
		}

		// 单模型模式：原有逻辑
		// 重新生成AI回复
		await this.generateAssistantResponse(session);
	}

	async deleteMessage(messageId: string) {
		const session = this.state.activeSession;
		if (!session) return;
		const index = session.messages.findIndex((msg) => msg.id === messageId);
		if (index === -1) return;
		
		// 从内存中删除消息
		session.messages.splice(index, 1);
		session.updatedAt = Date.now();
		this.invalidateSessionContextCompaction(session);
		this.emitState();
		
		// 对于删除操作，我们需要重写整个文件，因为无法简单地"追加删除"
		// 但我们可以优化为只重写消息部分，保留frontmatter
		if (session.filePath) {
			try {
				await this.sessionManager.rewriteMessagesOnly(session.filePath, session.messages);
			} catch (error) {
				console.error('[ChatService] 更新消息删除失败:', error);
				new Notice('更新文件失败，但消息已从界面删除');
			}
		}
	}

	async togglePinnedMessage(messageId: string) {
		const session = this.state.activeSession;
		if (!session) return;

		const message = session.messages.find((item) => item.id === messageId);
		if (!message || message.metadata?.hidden || message.metadata?.transient) {
			return;
		}

		const metadata = { ...(message.metadata ?? {}) } as Record<string, unknown>;
		if (metadata.pinned === true) {
			delete metadata.pinned;
		} else {
			metadata.pinned = true;
		}
		message.metadata = metadata;
		session.updatedAt = Date.now();
		this.invalidateSessionContextCompaction(session);
		this.emitState();

		if (session.filePath) {
			try {
				await this.sessionManager.rewriteMessagesOnly(
					session.filePath,
					session.messages
				);
			} catch (error) {
				console.error('[ChatService] 更新消息置顶状态失败:', error);
				new Notice('更新置顶状态失败，但界面已刷新');
			}
		}
	}

	insertMessageToEditor(messageId: string) {
		const session = this.state.activeSession;
		if (!session) return;
		const message = session.messages.find((msg) => msg.id === messageId);
		if (!message) return;

		// 获取所有打开的markdown叶子
		const markdownLeaves = this.plugin.app.workspace.getLeavesOfType('markdown');

		// 优先尝试获取当前活动的markdown视图
		const activeMarkdownView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);

		// 如果有活动的markdown视图，直接插入到当前文件
		if (activeMarkdownView?.editor) {
			const editor = activeMarkdownView.editor;
			editor.replaceSelection(message.content);
			new Notice('内容已插入当前编辑器');
			return;
		}

		// 如果没有活动的markdown视图，但存在打开的markdown叶子
		if (markdownLeaves.length > 0) {
			// 尝试获取最近使用的markdown叶子
			let targetLeaf = markdownLeaves.find(leaf => leaf === this.plugin.app.workspace.activeLeaf);

			// 如果当前活动叶子不是markdown，取第一个markdown叶子
			if (!targetLeaf) {
				targetLeaf = markdownLeaves[0];
			}

			if (targetLeaf) {
				const targetView = targetLeaf.view as MarkdownView;
				if (targetView.editor) {
					const editor = targetView.editor;
					editor.replaceSelection(message.content);
					const fileName = targetView.file?.basename || '未知文件';
					new Notice(`内容已插入到文件: ${fileName}`);
					return;
				}
			}
		}

		// 如果没有任何打开的markdown文件，提示用户需要先打开一个markdown文件
		new Notice('当前没有打开的markdown文件，请先打开一个markdown文件后再尝试插入内容');
	}

	async regenerateFromMessage(messageId: string) {
		const session = this.state.activeSession;
		if (!session || this.state.isGenerating) return;
		const index = session.messages.findIndex((msg) => msg.id === messageId);
		if (index === -1) return;
		const target = session.messages[index];
		if (target.role !== 'assistant') {
			new Notice('只能对AI消息执行重新生成操作');
			return;
		}

		// 对比模式：始终走多模型重试逻辑，避免误回退到单模型裁剪历史
		if (this.state.multiModelMode === 'compare') {
			await this.multiModelService?.retryModel(messageId);
			return;
		}

		// 单模型模式：原有逻辑
		// 重新生成历史消息时，目标消息及其后的对话都应被移除
		// 否则会残留后续上下文，导致对话历史不一致
		session.messages = session.messages.slice(0, index);
		session.updatedAt = Date.now();
		this.invalidateSessionContextCompaction(session);

		// 清理任务计划：重新生成时应该清除之前的任务计划状态
		session.livePlan = null;
		this.queueSessionPlanSync(session);

		this.emitState();

		// 使用rewriteMessagesOnly更新文件，同时清空历史文件中的任务计划
		// 如果AI重新创建任务，会在生成完成后通过 saveActiveSession 重新保存
		if (session.filePath) {
			try {
				await this.sessionManager.rewriteMessagesOnly(session.filePath, session.messages, null);
			} catch (error) {
				console.error('[ChatService] 更新消息删除失败:', error);
				// 不显示通知，避免干扰用户重新生成流程
			}
		}

		await this.generateAssistantResponse(session);
	}

	async refreshProviderSettings(tarsSettings: TarsSettings) {
		if (!tarsSettings.providers.length) {
			this.state.selectedModelId = null;
			this.state.selectedModels = [];
		} else if (!this.state.selectedModelId) {
			this.state.selectedModelId = tarsSettings.providers[0].tag;
			if (this.state.selectedModels.length === 0) {
				this.state.selectedModels = [tarsSettings.providers[0].tag];
			}
		} else {
			const providerTags = new Set(tarsSettings.providers.map((provider) => provider.tag));
			if (!providerTags.has(this.state.selectedModelId)) {
				this.state.selectedModelId = tarsSettings.providers[0].tag;
			}
			this.state.selectedModels = this.state.selectedModels.filter((tag) => providerTags.has(tag));
			if (this.state.selectedModels.length === 0 && this.state.selectedModelId) {
				this.state.selectedModels = [this.state.selectedModelId];
			}
		}
		this.emitState();
	}

	dispose() {
		this.closeChatSettingsModal();
		this.stateStore.dispose();
		this.multiModelService?.stopAllGeneration();
		this.controller?.abort();
		this.controller = null;
		this.planSyncService.dispose();
		this.toolRuntimeResolver.dispose();
		this.subAgentWatcherService.stop();
		this.subAgentScannerService.clearCache();
	}

	private emitState() {
		this.stateStore.emit();
	}

	private invalidateSessionContextCompaction(session: ChatSession): void {
		if (!session.contextCompaction && !session.requestTokenState) {
			return;
		}
		session.contextCompaction = null;
		session.requestTokenState = null;
		void this.persistSessionContextCompactionFrontmatter(session);
	}

	private cloneValue<T>(value: T): T {
		return JSON.parse(JSON.stringify(value)) as T;
	}

	private handleSettingsSaveError(error: unknown): void {
		const message = error instanceof Error ? error.message : String(error);
		new Notice(`${localInstance.chat_settings_save_failed}: ${message}`);
	}

	private getDefaultProviderTag(): string | null {
		return this.plugin.settings.tars.settings.providers[0]?.tag ?? null;
	}

	/**
	 * 检测用户输入是否包含图片生成意图
	 * @param content 用户输入内容
	 * @returns 是否包含图片生成意图
	 */
	detectImageGenerationIntent(content: string): boolean {
		if (!content) return false;

		const lowerContent = content.toLowerCase();

		// ===== 1. 明确的图像生成短语 =====
		const explicitPhrases = [
			// 中文
			'图片生成', '图像生成', '作画', '绘画', '画图',
			// 英文 - 完整短语
			'visualize', 'visualize a', 'visualize an',
			'show me a picture', 'show me an image',
			'display a picture', 'display an image'
		];

		if (explicitPhrases.some(phrase => lowerContent.includes(phrase))) {
			return true;
		}

		// ===== 2. 非图像词黑名单（这些词紧跟在生成动词后表示非图像请求）=====
		const nonImageIndicators = [
			// 中文
			'计划', '方案', '方法', '流程', '系统', '策略', '模型', '框架', '文档', '报告',
			'故事', '代码', '文件', '列表', '表格', '总结', '概述', '分析', '结论',
			'重点', '笔记', '大纲', '草稿', '项目', '任务', '问题', '答案', '想法',
			// 英文
			'plan', 'strategy', 'method', 'approach', 'system', 'process', 'workflow',
			'story', 'code', 'file', 'list', 'table', 'summary', 'overview', 'analysis',
			'conclusion', 'note', 'outline', 'draft', 'project', 'task', 'problem', 'idea',
			'document', 'report', 'proposal', 'solution', 'concept'
		];

		// ===== 3. 检查是否匹配黑名单模式 =====
		function isBlacklisted(text: string, pattern: string): boolean {
			const index = text.indexOf(pattern);
			if (index === -1) return false;

			const afterPattern = text.slice(index + pattern.length).trim();
			const firstWord = afterPattern.split(/\s+/)[0];

			return nonImageIndicators.some(word => firstWord.includes(word));
		}

		// ===== 4. 中文模式检测 =====
		const chinesePatterns = [
			{ pattern: '画一个', maxLength: 12 },
			{ pattern: '画一张', maxLength: 12 },
			{ pattern: '画一幅', maxLength: 12 },
			{ pattern: '画个', maxLength: 10 },
			{ pattern: '画张', maxLength: 10 },
			{ pattern: '生成一张', maxLength: 12 },
			{ pattern: '生成一幅', maxLength: 12 },
			{ pattern: '生成一个', maxLength: 12 },
			{ pattern: '绘制一张', maxLength: 12 },
			{ pattern: '绘制一个', maxLength: 12 },
			{ pattern: '创建一张', maxLength: 12 },
			{ pattern: '创建一个', maxLength: 12 },
			{ pattern: '制作一张', maxLength: 12 },
			{ pattern: '制作一个', maxLength: 12 },
			{ pattern: '设计一张', maxLength: 12 },
			{ pattern: '设计一个', maxLength: 12 },
			{ pattern: '创作一张', maxLength: 12 },
			{ pattern: '创作一个', maxLength: 12 }
		];

		// 图像相关词（优先级高的在前，避免被子词误判）
		const imageRelatedWords = [
			// 优先匹配完整的图像类型名称
			'流程图', '结构图', '思维导图', '架构图', '示意图', '系统图',
			'肖像', '素描', '漫画', '线框图',
			// 然后是通用图像词
			'图片', '图像', '图表', '插图', '图画', '照片', '截图',
			// 最后是单字（放到最后，避免误判）
			'图', '画',
			// 英文图像相关
			'logo', '图标', '界面', '原型', 'ui'
		];

		for (const { pattern, maxLength } of chinesePatterns) {
			const index = lowerContent.indexOf(pattern);
			if (index === -1) continue;

			const afterPattern = lowerContent.slice(index + pattern.length, index + pattern.length + maxLength);

			// 先检查是否包含明确的图像相关词（优先检查完整词）
			const hasImageWord = imageRelatedWords.some(word => afterPattern.includes(word));

			if (hasImageWord) {
				// 如果有明确的图像词，直接认为是图像生成
				return true;
			}

			// 只有在没有明确图像词时，才检查黑名单
			if (isBlacklisted(lowerContent, pattern)) {
				continue;
			}
		}

		// ===== 5. 英文模式检测 =====
		// 对于英文，draw/paint 后面接名词通常是图像生成（除非是黑名单词）
		const englishPatterns = [
			'draw a', 'draw an', 'draw me a', 'draw me an',
			'paint a', 'paint an', 'paint me a', 'paint me an'
		];

		for (const pattern of englishPatterns) {
			if (!lowerContent.includes(pattern)) continue;

			// 先检查是否是黑名单词
			if (isBlacklisted(lowerContent, pattern)) {
				continue;
			}

			// 英文的 draw/paint 模式，默认认为是图像生成
			return true;
		}

		// ===== 6. 其他英文生成模式（需要图像词确认）=====
		const otherEnglishPatterns = [
			{ pattern: 'make a', maxLength: 20 },
			{ pattern: 'make an', maxLength: 20 },
			{ pattern: 'design a', maxLength: 20 },
			{ pattern: 'design an', maxLength: 20 },
			{ pattern: 'create a', maxLength: 20 },
			{ pattern: 'create an', maxLength: 20 },
			{ pattern: 'generate a', maxLength: 20 },
			{ pattern: 'generate an', maxLength: 20 }
		];

		const englishImageWords = [
			'image', 'picture', 'photo', 'diagram', 'chart', 'graph', 'icon', 'logo',
			'illustration', 'sketch', 'drawing', 'painting', 'portrait', 'visual'
		];

		for (const { pattern, maxLength } of otherEnglishPatterns) {
			const index = lowerContent.indexOf(pattern);
			if (index === -1) continue;

			// 先检查是否是黑名单词
			if (isBlacklisted(lowerContent, pattern)) {
				continue;
			}

			const afterPattern = lowerContent.slice(index + pattern.length, index + pattern.length + maxLength);

			if (englishImageWords.some(word => afterPattern.includes(word))) {
				return true;
			}
		}

		return false;
	}

	/**
	 * 检查当前选择的模型是否支持图像生成
	 * @returns 是否支持图像生成
	 */
	private isCurrentModelSupportImageGeneration(): boolean {
		const provider = this.resolveProvider();
		if (!provider) return false;
		
		const vendor = availableVendors.find((item) => item.name === provider.vendor);
		if (!vendor) return false;
		
		// 检查供应商是否支持图像生成功能
		if (!vendor.capabilities.includes('Image Generation')) return false;
		
		// 对于OpenRouter，需要进一步检查具体模型
		if (provider.vendor === 'OpenRouter') {
			return isImageGenerationModel(provider.options.model);
		}
		
		// 其他供应商，只要支持图像生成功能就返回true
		return true;
	}

	isProviderSupportImageGenerationByTag(modelTag: string): boolean {
		const provider = this.findProviderByTagExact(modelTag);
		return provider ? this.providerSupportsImageGeneration(provider) : false;
	}

	private normalizeOllamaBaseUrl(baseURL?: string) {
		const trimmed = (baseURL || '').trim();
		if (!trimmed) return 'http://127.0.0.1:11434';
		return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
	}

	private async getOllamaCapabilities(baseURL: string, model: string) {
		const normalizedBase = this.normalizeOllamaBaseUrl(baseURL);
		const key = `${normalizedBase}|${model}`;
		const cache = this.ollamaCapabilityCache.get(key);
		const now = Date.now();
		if (cache && now - cache.checkedAt < 5 * 60 * 1000) {
			return cache;
		}

		try {
			const response = await requestUrl({
				url: `${normalizedBase}/api/show`,
				method: 'POST',
				body: JSON.stringify({ model })
			});
			const capabilities = Array.isArray(response.json?.capabilities) ? response.json.capabilities : [];
			const normalized = capabilities.map((cap: string) => String(cap).toLowerCase());
			const reasoning = normalized.includes('thinking') || normalized.includes('reasoning');
			const next = { reasoning, checkedAt: now };
			this.ollamaCapabilityCache.set(key, next);
			return next;
		} catch (error) {
			const next = { reasoning: false, checkedAt: now, warned: cache?.warned };
			this.ollamaCapabilityCache.set(key, next);
			return next;
		}
	}

	async getOllamaCapabilitiesForModel(modelTag: string): Promise<{
		supported: boolean;
		shouldWarn: boolean;
		modelName: string;
	} | null> {
		const provider = this.findProviderByTagExact(modelTag);
		if (!provider || provider.vendor !== 'Ollama' || !this.state.enableReasoningToggle) {
			return null;
		}

		const modelName = String((provider.options as any)?.model ?? provider.tag ?? modelTag);
		const baseURL = String((provider.options as any)?.baseURL ?? '');
		if (!modelName) {
			return null;
		}

		const caps = await this.getOllamaCapabilities(baseURL, modelName);
		const key = `${this.normalizeOllamaBaseUrl(baseURL)}|${modelName}`;
		const cached = this.ollamaCapabilityCache.get(key);
		const shouldWarn = !caps.reasoning && Boolean(cached) && !cached?.warned;
		if (shouldWarn && cached) {
			this.ollamaCapabilityCache.set(key, { ...cached, warned: true });
		}

		return {
			supported: caps.reasoning,
			shouldWarn,
			modelName
		};
	}


	private async generateAssistantResponse(session: ChatSession) {
		const modelTag = this.state.selectedModelId ?? this.getDefaultProviderTag();
		if (!modelTag) {
			new Notice('尚未配置任何AI模型，请先在Tars设置中添加Provider。');
			return;
		}

		try {
			const assistantMessage = await this.generateAssistantResponseForModel(session, modelTag, {
				createMessageInSession: true,
				manageGeneratingState: true
			});

			if (this.state.shouldSaveHistory && session.filePath) {
				try {
					await this.sessionManager.appendMessageToFile(session.filePath, assistantMessage);
				} catch (error) {
					console.error('[ChatService] 追加AI回复失败:', error);
				}
			} else if (this.state.shouldSaveHistory) {
				console.warn('[ChatService] 会话没有文件路径，回退到完整保存');
				try {
					await this.saveActiveSession();
				} catch (error) {
					console.error('[ChatService] 保存AI回复失败:', error);
				}
			}
		} catch (error) {
			this.handleAssistantGenerationError(session, error);
		}
	}

	async generateAssistantResponseForModel(
		session: ChatSession,
		modelTag: string,
		options?: GenerateAssistantOptions
	): Promise<ChatMessage> {
		const provider = this.findProviderByTagExact(modelTag);
		if (!provider) {
			throw new Error(`未找到模型配置: ${modelTag}`);
		}

		const providerOptionsRaw = (provider.options as any) ?? {};
		const providerEnableReasoning =
			typeof providerOptionsRaw.enableReasoning === 'boolean'
				? providerOptionsRaw.enableReasoning
				: provider.vendor === 'Doubao'
					? ((providerOptionsRaw.thinkingType as string | undefined) ?? 'enabled') !== 'disabled'
					: false;
			const providerEnableThinking = providerOptionsRaw.enableThinking ?? false;
			const providerEnableWebSearch = provider.options.enableWebSearch ?? false;
			let enableReasoning = this.state.enableReasoningToggle && providerEnableReasoning;
			let enableThinking = this.state.enableReasoningToggle && providerEnableThinking;
			const enableWebSearch = this.state.enableWebSearchToggle && providerEnableWebSearch;
		const providerOptions: Record<string, unknown> = {
				...providerOptionsRaw,
				enableReasoning,
				enableThinking,
			enableWebSearch
		};
		let requestTools: ToolDefinition[] = options?.toolRuntimeOverride?.requestTools ?? [];

		if (!enableReasoning && typeof providerOptionsRaw.thinkingType === 'string') {
			providerOptions.thinkingType = 'disabled';
		}

		const vendor = availableVendors.find((item) => item.name === provider.vendor);
		if (!vendor) {
			throw new Error(`无法找到供应商 ${provider.vendor}`);
		}

		if (typeof options?.maxTokensOverride === 'number' && options.maxTokensOverride > 0) {
			(providerOptions as any).max_tokens = options.maxTokensOverride;
		}

		const assistantMessage = this.messageService.createMessage('assistant', '', {
			modelTag,
			modelName: this.getModelDisplayName(provider),
			taskDescription: options?.taskDescription,
			executionIndex: options?.executionIndex,
			metadata: {
				hiddenFromModel: this.state.multiModelMode !== 'single'
			}
		});
		const shouldAttachToSession = options?.createMessageInSession ?? false;
		const shouldManageGeneratingState = options?.manageGeneratingState ?? true;
		const subAgentStateCallback = this.createSubAgentStateUpdater(
			assistantMessage,
			session,
			shouldAttachToSession,
		);

		if (options?.toolRuntimeOverride) {
			providerOptions.tools = options.toolRuntimeOverride.requestTools;
			if (options.toolRuntimeOverride.toolExecutor) {
				providerOptions.toolExecutor = options.toolRuntimeOverride.toolExecutor;
			}
			if (options.toolRuntimeOverride.maxToolCallLoops) {
				providerOptions.maxToolCallLoops = options.toolRuntimeOverride.maxToolCallLoops;
			}
		} else {
			try {
				const toolRuntime = await this.resolveToolRuntime({
					includeSubAgents: true,
					parentSessionId: session.id,
					subAgentStateCallback,
					session,
				});
				requestTools = toolRuntime.requestTools;
				providerOptions.tools = toolRuntime.requestTools;
				if (toolRuntime.toolExecutor) {
					providerOptions.toolExecutor = toolRuntime.toolExecutor;
				}
				if (toolRuntime.maxToolCallLoops) {
					providerOptions.maxToolCallLoops = toolRuntime.maxToolCallLoops;
				}
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				this.showMcpNoticeOnce(`MCP 工具初始化失败: ${msg}`);
				DebugLogger.error('[MCP] Chat 注入工具失败', err);
			}
		}

		if (vendor.name === 'Ollama') {
			const modelName = String((providerOptions as any).model ?? '');
			const baseURL = String((providerOptions as any).baseURL ?? '');
			if (modelName) {
				const caps = await this.getOllamaCapabilities(baseURL, modelName);
				enableReasoning = enableReasoning && caps.reasoning;
				enableThinking = enableThinking && caps.reasoning;
				(providerOptions as any).enableReasoning = enableReasoning;
				(providerOptions as any).enableThinking = enableThinking;
				if (!caps.reasoning) {
					const key = `${this.normalizeOllamaBaseUrl(baseURL)}|${modelName}`;
					const cached = this.ollamaCapabilityCache.get(key);
					if (cached && !cached.warned) {
						this.ollamaCapabilityCache.set(key, { ...cached, warned: true });
						new Notice('已根据 Ollama 模型能力自动关闭不支持的推理功能');
					}
				}
			}
		}

		const sendRequest = vendor.sendRequestFunc(providerOptions);
		const messages = await this.buildProviderMessagesWithOptions(session, {
			context: options?.context,
			taskDescription: options?.taskDescription,
			systemPrompt: options?.systemPromptOverride,
			modelTag,
			requestTools,
		});
		DebugLogger.logLlmMessages('ChatService.generateAssistantResponseForModel', messages, { level: 'debug' });
		if (shouldAttachToSession) {
			session.messages.push(assistantMessage);
		}
		session.updatedAt = Date.now();
		if (shouldManageGeneratingState) {
			this.state.isGenerating = true;
			this.state.error = undefined;
			this.emitState();
		}

		const requestController = new AbortController();
		const externalSignal = options?.abortSignal;
		const abortListener = () => requestController.abort();
		if (externalSignal) {
			if (externalSignal.aborted) {
				requestController.abort();
			} else {
				externalSignal.addEventListener('abort', abortListener, { once: true });
			}
		}
		if (shouldAttachToSession) {
			this.controller = requestController;
		}

		const resolveEmbed: ResolveEmbedAsBinary = async (embed) => {
			if (embed && (embed as any)[Symbol.for('originalBase64')]) {
				const base64Data = (embed as any)[Symbol.for('originalBase64')] as string;
				return this.imageResolver.base64ToArrayBuffer(base64Data);
			}
			return new ArrayBuffer(0);
		};

		const saveAttachment: SaveAttachment = async (filename: string, data: ArrayBuffer): Promise<void> => {
			const attachmentPath = await this.plugin.app.fileManager.getAvailablePathForAttachment(filename);
			await this.plugin.app.vault.createBinary(attachmentPath, data);
		};

		(providerOptions as any).onToolCallResult = (record: ToolExecutionRecord) => {
			const normalizedRecord = this.normalizeToolExecutionRecord(record);
			const existingToolCalls = assistantMessage.toolCalls ?? [];
			const existingIndex = existingToolCalls.findIndex((item) => item.id === normalizedRecord.id);
			if (existingIndex >= 0) {
				existingToolCalls[existingIndex] = normalizedRecord;
				assistantMessage.toolCalls = [...existingToolCalls];
			} else {
				assistantMessage.toolCalls = [
					...existingToolCalls,
					normalizedRecord,
				];
			}
			options?.onToolCallRecord?.(normalizedRecord);
			session.updatedAt = Date.now();
			if (shouldAttachToSession) {
				this.emitState();
			}
		};

		try {
			const supportsImageGeneration = this.providerSupportsImageGeneration(provider);
			if (supportsImageGeneration) {
				try {
					for await (const chunk of sendRequest(messages, requestController, resolveEmbed, saveAttachment)) {
						assistantMessage.content += chunk;
						session.updatedAt = Date.now();
						options?.onChunk?.(chunk, assistantMessage);
						if (shouldAttachToSession) {
							this.emitState();
						}
					}
				} catch (error) {
					this.rethrowImageGenerationError(error);
				}
			} else {
				for await (const chunk of sendRequest(messages, requestController, resolveEmbed)) {
					assistantMessage.content += chunk;
					session.updatedAt = Date.now();
					options?.onChunk?.(chunk, assistantMessage);
					if (shouldAttachToSession) {
						this.emitState();
					}
				}
			}

			DebugLogger.logLlmResponsePreview('ChatService.generateAssistantResponseForModel', assistantMessage.content, {
				level: 'debug',
				previewChars: 100
			});
			return assistantMessage;
		} finally {
			if (externalSignal) {
				externalSignal.removeEventListener('abort', abortListener);
			}
			if (shouldAttachToSession && this.controller === requestController) {
				this.controller = null;
			}
			if (shouldManageGeneratingState) {
				this.state.isGenerating = false;
			}
			session.updatedAt = Date.now();
			if (shouldManageGeneratingState || shouldAttachToSession) {
				this.emitState();
			}
		}
	}

	private showMcpNoticeOnce(message: string): void {
		const now = Date.now()
		if (now - this.lastMcpNoticeAt < 10000) return
		this.lastMcpNoticeAt = now
		new Notice(message, 5000)
	}

	private handleAssistantGenerationError(session: ChatSession, error: unknown) {
		console.error('[Chat][ChatService] generateAssistantResponse error', error);
		this.state.isGenerating = false;
		this.controller = null;

		let errorMessage = '生成失败，请稍后再试。';
		if (error instanceof Error) {
			errorMessage = error.message;
		} else {
			errorMessage = `生成过程中发生未知错误: ${String(error)}`;
		}

		this.state.error = errorMessage;
		if (session.messages.length > 0) {
			const last = session.messages[session.messages.length - 1];
			if (last.role === 'assistant') {
				last.isError = true;
				if (!last.content) {
					last.content = errorMessage;
				}
			}
		}
		this.emitState();
		new Notice(errorMessage, 10000);
	}

	private providerSupportsImageGeneration(provider: ProviderSettings): boolean {
		const vendor = availableVendors.find((item) => item.name === provider.vendor);
		if (!vendor || !vendor.capabilities.includes('Image Generation')) {
			return false;
		}
		if (provider.vendor === 'OpenRouter') {
			return isImageGenerationModel(provider.options.model);
		}
		return true;
	}

	private rethrowImageGenerationError(error: unknown): never {
		if (error instanceof Error) {
			const errorMessage = error.message.toLowerCase();
			if (errorMessage.includes('not support') || errorMessage.includes('modalities') || errorMessage.includes('output_modalities')) {
				throw new Error(`当前模型不支持图像生成功能。

解决方法：
1. 选择支持图像生成的模型，如 google/gemini-2.5-flash-image-preview
2. 在模型设置中确认已启用图像生成功能
3. 检查API密钥是否有图像生成权限`);
			}
			if (errorMessage.includes('content policy') || errorMessage.includes('safety') || errorMessage.includes('inappropriate')) {
				throw new Error(`图像生成请求被内容策略阻止。

解决方法：
1. 修改您的描述，避免敏感内容
2. 使用更中性、通用的描述
3. 尝试不同的描述角度`);
			}
			if (errorMessage.includes('quota') || errorMessage.includes('balance') || errorMessage.includes('insufficient')) {
				throw new Error(`账户配额或余额不足。

解决方法：
1. 检查API账户余额
2. 升级到更高的配额计划
3. 等待配额重置（如果是按天计算）`);
			}
			if (errorMessage.includes('保存图片附件失败')) {
				throw new Error(`图片生成成功，但保存到本地失败。

解决方法：
1. 检查Obsidian附件文件夹权限
2. 确保有足够的磁盘空间
3. 尝试在设置中更改图片保存位置`);
			}
			throw error;
		}
		throw new Error(`图像生成过程中发生未知错误: ${String(error)}`);
	}

	private resolveProvider(): ProviderSettings | null {
		return this.resolveProviderByTag(this.state.selectedModelId ?? undefined);
	}

	resolveProviderByTag(tag?: string): ProviderSettings | null {
		const providers = this.plugin.settings.tars.settings.providers;
		if (!providers.length) return null;
		if (!tag) {
			return providers[0];
		}
		return providers.find((provider) => provider.tag === tag) ?? providers[0];
	}

	findProviderByTagExact(tag?: string): ProviderSettings | null {
		if (!tag) {
			return null;
		}
		return this.plugin.settings.tars.settings.providers.find((provider) => provider.tag === tag) ?? null;
	}

	private getModelDisplayName(provider: ProviderSettings): string {
		return provider.options.model || provider.tag;
	}

	private getLatestVisibleUserMessageContent(session: ChatSession): string {
		const latestMessage = this.getLatestVisibleUserMessage(session);
		return latestMessage?.content.trim() ?? '';
	}

	private getLatestVisibleUserMessage(session: ChatSession): ChatMessage | null {
		for (let index = session.messages.length - 1; index >= 0; index -= 1) {
			const message = session.messages[index];
			if (message.role !== 'user') {
				continue;
			}
			if (message.metadata?.hiddenFromModel || isEphemeralContextMessage(message)) {
				continue;
			}
			const content = message.content.trim();
			if (content) {
				return message;
			}
		}
		return null;
	}

	private getPreviousVisibleUserMessage(
		session: ChatSession,
		excludeMessageId?: string
	): ChatMessage | null {
		let skippedCurrent = false;
		for (let index = session.messages.length - 1; index >= 0; index -= 1) {
			const message = session.messages[index];
			if (message.role !== 'user') {
				continue;
			}
			if (message.metadata?.hiddenFromModel || isEphemeralContextMessage(message)) {
				continue;
			}
			const content = message.content.trim();
			if (!content) {
				continue;
			}
			if (!skippedCurrent && (!excludeMessageId || message.id === excludeMessageId)) {
				skippedCurrent = true;
				continue;
			}
			return message;
		}
		return null;
	}

	private buildResolvedSelectionContext(session: ChatSession): {
		selectedFiles: SelectedFile[];
		selectedFolders: SelectedFolder[];
	} {
		const fileMap = new Map<string, SelectedFile>();
		const folderMap = new Map<string, SelectedFolder>();

		for (const file of session.selectedFiles ?? []) {
			fileMap.set(file.path, file);
		}
		for (const folder of session.selectedFolders ?? []) {
			folderMap.set(folder.path, folder);
		}

		return {
			selectedFiles: Array.from(fileMap.values()),
			selectedFolders: Array.from(folderMap.values()),
		};
	}

	private async appendHostAssistantMessage(
		session: ChatSession,
		content: string
	): Promise<ChatMessage> {
		const message = this.messageService.createMessage('assistant', content);
		session.messages.push(message);
		session.updatedAt = Date.now();
		this.emitState();

		if (this.state.shouldSaveHistory && session.filePath) {
			try {
				await this.sessionManager.appendMessageToFile(session.filePath, message);
			} catch (error) {
				console.error('[ChatService] 追加宿主消息失败:', error);
			}
		} else if (this.state.shouldSaveHistory) {
			try {
				await this.saveActiveSession();
			} catch (error) {
				console.error('[ChatService] 保存宿主消息失败:', error);
			}
		}

		return message;
	}

	/**
	 * 构建发送给 Provider 的消息列表
	 * @param session 当前会话
	 */
	async buildProviderMessages(session: ChatSession): Promise<ProviderMessage[]> {
		const visibleMessages = session.messages.filter((message) => !message.metadata?.hiddenFromModel);
		return this.buildProviderMessagesForAgent(
			visibleMessages,
			session,
			undefined,
			session.modelId || this.state.selectedModelId || undefined
		);
	}

	async buildProviderMessagesWithOptions(
		session: ChatSession,
		options?: {
			context?: string;
			taskDescription?: string;
			systemPrompt?: string;
			modelTag?: string;
			requestTools?: ToolDefinition[];
		}
	): Promise<ProviderMessage[]> {
		const visibleMessages =
			(session.multiModelMode ?? this.state.multiModelMode) === 'compare' && options?.modelTag
				? filterMessagesForCompareModel(session.messages, options.modelTag)
				: session.messages.filter((message) => !message.metadata?.hiddenFromModel);
		const requestMessages = [...visibleMessages];

		if (options?.context || options?.taskDescription) {
			const contextParts: string[] = [];
			if (options.taskDescription) {
				contextParts.push(`当前任务：${options.taskDescription}`);
			}
			if (options.context) {
				contextParts.push(`前一步输出：\n${options.context}`);
			}
			requestMessages.push(this.messageService.createMessage('user', contextParts.join('\n\n'), {
				metadata: {
					hidden: true,
					hiddenFromHistory: true,
					hiddenFromModel: false,
					isEphemeralContext: true
				}
			}));
		}

		const livePlanContext = this.buildLivePlanUserContext(session.livePlan);
		if (livePlanContext) {
			requestMessages.push(
				this.messageService.createMessage('user', livePlanContext, {
					metadata: {
						hidden: true,
						hiddenFromHistory: true,
						hiddenFromModel: false,
						isEphemeralContext: true,
					},
				})
			);
		}

			return this.buildProviderMessagesForAgent(
				requestMessages,
				session,
				options?.systemPrompt,
				options?.modelTag,
				options?.requestTools
			);
	}

	/**
	 * 构建 Agent 循环所需的 Provider 消息列表
	 * @param messages 待发送的消息列表
	 * @param session 当前会话
	 * @param systemPrompt 系统提示词
	 */
	async buildProviderMessagesForAgent(
		messages: ChatMessage[],
		session: ChatSession,
		systemPrompt?: string,
		modelTag?: string,
		requestTools: ToolDefinition[] = []
	): Promise<ProviderMessage[]> {
		const contextNotes = [...(session.contextNotes ?? []), ...this.state.contextNotes];
		const { selectedFiles, selectedFolders } = this.buildResolvedSelectionContext(session);
		const messageManagement = this.getMessageManagementSettings();
		const fileContentOptions = this.getDefaultFileContentOptions();
		
		// 显式覆盖优先；模板系统提示词走会话缓存；全局系统提示词每次请求都重新加载，避免设置变更后旧会话继续使用陈旧缓存。
		const explicitSystemPrompt = systemPrompt?.trim();
		const templateSystemPrompt = session.enableTemplateAsSystemPrompt
			? session.systemPrompt?.trim()
			: undefined;
		let effectiveSystemPrompt = explicitSystemPrompt || templateSystemPrompt;
		if (!effectiveSystemPrompt) {
			try {
				const assembler = new SystemPromptAssembler(this.app);
				const built = await assembler.buildGlobalSystemPrompt('tars_chat');
				if (built && built.trim().length > 0) {
					effectiveSystemPrompt = built;
					session.systemPrompt = effectiveSystemPrompt;
				} else if (!session.enableTemplateAsSystemPrompt) {
					session.systemPrompt = undefined;
				}
			} catch (error) {
				DebugLogger.warn('[ChatService] 全局系统提示词加载失败，跳过注入', error);
			}
		}
		const activePlanGuidance = this.buildLivePlanGuidance(session.livePlan);
		const skillsPromptBlock = await this.resolveSkillsSystemPromptBlock(requestTools);
		effectiveSystemPrompt = composeChatSystemPrompt({
			configuredSystemPrompt: effectiveSystemPrompt,
			livePlanGuidance: activePlanGuidance,
			skillsPromptBlock,
		});
		const sourcePath = this.app.workspace.getActiveFile()?.path ?? '';

		const contextSourceMessage = this.getLatestContextSourceMessage(messages);
		const selectedText = this.getStringMetadata(contextSourceMessage, 'selectedText');
		const hasContextPayload = this.hasBuildableContextPayload(
			contextNotes,
			selectedFiles,
			selectedFolders,
			selectedText
		);
		const rawContextMessage = hasContextPayload
			? await this.messageService.buildContextProviderMessage({
				selectedFiles,
				selectedFolders,
				contextNotes,
				selectedText,
				fileContentOptions,
				sourcePath,
				images: contextSourceMessage?.images ?? [],
			})
			: null;
		let requestMessages = messages.filter((message) => message.role !== 'system');
		let prebuiltContextMessage = rawContextMessage;
		let nextCompaction = session.contextCompaction ?? null;
		const resolvedBudget = this.getResolvedContextBudget(
			modelTag ?? session.modelId ?? this.state.selectedModelId ?? undefined
		);
		const systemTokenEstimate = this.estimateSystemPromptTokens(effectiveSystemPrompt);
		const toolTokenEstimate = estimateToolDefinitionTokens(requestTools);
		const buildProviderPayload = (
			currentMessages: ChatMessage[],
			currentContextMessage: ProviderMessage | null
		) =>
			this.messageService.toProviderMessages(currentMessages, {
				contextNotes,
				systemPrompt: effectiveSystemPrompt,
				selectedFiles,
				selectedFolders,
				fileContentOptions,
				sourcePath,
				prebuiltContextMessage: currentContextMessage,
			});

		let providerMessages = await buildProviderPayload(
			requestMessages,
			prebuiltContextMessage
		);
		let requestEstimate = estimateRequestPayloadTokens({
			messages: providerMessages,
			tools: requestTools,
		});

		if (messageManagement.enabled) {
			const rawContextTokens = rawContextMessage
				? estimateProviderMessagesTokens([rawContextMessage])
				: 0;
			let contextTokenEstimate = rawContextTokens;
			let historyTokenEstimate = this.messageContextOptimizer.estimateChatTokens(
				requestMessages
			);
			let totalTokenEstimate = requestEstimate.totalTokens;
			const shouldCompact = totalTokenEstimate > resolvedBudget.triggerTokens;

			if (shouldCompact) {
				const summaryGenerator = this.createHistorySummaryGenerator(
					modelTag,
					session
				);
				let optimized = await this.messageContextOptimizer.optimize(
					requestMessages,
					messageManagement,
					nextCompaction,
					{
						targetHistoryBudgetTokens: Math.max(
							1,
							resolvedBudget.targetTokens
								- systemTokenEstimate
								- contextTokenEstimate
								- toolTokenEstimate
						),
						summaryGenerator,
					}
				);
				requestMessages = optimized.messages;
				historyTokenEstimate = optimized.historyTokenEstimate;
				providerMessages = await buildProviderPayload(
					requestMessages,
					prebuiltContextMessage
				);
				requestEstimate = estimateRequestPayloadTokens({
					messages: providerMessages,
					tools: requestTools,
				});
				totalTokenEstimate = requestEstimate.totalTokens;

				if (rawContextMessage && totalTokenEstimate > resolvedBudget.targetTokens) {
					const contextCompaction = await this.contextCompactionService.compactContextProviderMessage({
						contextMessage: rawContextMessage,
						existingCompaction: nextCompaction,
						session,
						modelTag,
						targetBudgetTokens: Math.max(
							256,
							resolvedBudget.targetTokens
								- systemTokenEstimate
								- historyTokenEstimate
								- toolTokenEstimate
						),
					});
					prebuiltContextMessage = contextCompaction.message;
					contextTokenEstimate = contextCompaction.tokenEstimate;
					providerMessages = await buildProviderPayload(
						requestMessages,
						prebuiltContextMessage
					);
					requestEstimate = estimateRequestPayloadTokens({
						messages: providerMessages,
						tools: requestTools,
					});
					totalTokenEstimate = requestEstimate.totalTokens;

					if (totalTokenEstimate > resolvedBudget.targetTokens) {
						optimized = await this.messageContextOptimizer.optimize(
							messages.filter((message) => message.role !== 'system'),
							messageManagement,
							optimized.contextCompaction ?? nextCompaction,
							{
								targetHistoryBudgetTokens: Math.max(
									1,
									resolvedBudget.targetTokens
										- systemTokenEstimate
										- contextTokenEstimate
										- toolTokenEstimate
								),
								summaryGenerator,
							}
						);
						requestMessages = optimized.messages;
						historyTokenEstimate = optimized.historyTokenEstimate;
						providerMessages = await buildProviderPayload(
							requestMessages,
							prebuiltContextMessage
						);
						requestEstimate = estimateRequestPayloadTokens({
							messages: providerMessages,
							tools: requestTools,
						});
						totalTokenEstimate = requestEstimate.totalTokens;
					}

					nextCompaction = this.mergeCompactionState(
						optimized.contextCompaction,
						contextCompaction.summary,
						contextCompaction.signature,
						contextTokenEstimate,
						totalTokenEstimate
					);
				} else if (optimized.contextCompaction) {
					nextCompaction = {
						...optimized.contextCompaction,
						totalTokenEstimate,
						contextTokenEstimate,
					};
				} else if (nextCompaction) {
					nextCompaction = {
						...nextCompaction,
						historyTokenEstimate,
						totalTokenEstimate,
						contextTokenEstimate,
					};
				} else {
					nextCompaction = null;
				}
			} else if (nextCompaction) {
				nextCompaction = {
					...nextCompaction,
					historyTokenEstimate,
					totalTokenEstimate: requestEstimate.totalTokens,
					contextTokenEstimate,
				};
			} else {
				nextCompaction = null;
			}

			if (!rawContextMessage && nextCompaction) {
				nextCompaction = {
					...nextCompaction,
					contextSummary: undefined,
					contextSourceSignature: undefined,
					contextTokenEstimate: undefined,
				};
			}

			if (
				nextCompaction
				&& nextCompaction.coveredRange.messageCount === 0
				&& !nextCompaction.summary.trim()
				&& !nextCompaction.contextSummary
				&& !nextCompaction.overflowedProtectedLayers
			) {
				nextCompaction = null;
			}
		} else if (session.contextCompaction) {
			nextCompaction = null;
		}

		if (
			serializeContextCompaction(session.contextCompaction)
			!== serializeContextCompaction(nextCompaction)
		) {
			session.contextCompaction = nextCompaction;
			void this.persistSessionContextCompactionFrontmatter(session);
		}

		providerMessages = await buildProviderPayload(
			requestMessages,
			prebuiltContextMessage
		);
		requestEstimate = estimateRequestPayloadTokens({
			messages: providerMessages,
			tools: requestTools,
		});
		await this.updateRequestTokenState(session, {
			requestEstimate,
			contextMessage: prebuiltContextMessage,
			contextSourceMessage,
			sourcePath,
			fileContentOptions,
		});

		return providerMessages;
	}

	private async updateRequestTokenState(
		session: ChatSession,
		params: {
			requestEstimate: ReturnType<typeof estimateRequestPayloadTokens>;
			contextMessage: ProviderMessage | null;
			contextSourceMessage: ChatMessage | null;
			sourcePath: string;
			fileContentOptions: FileContentOptions;
		}
	): Promise<void> {
		let userTurnTokenEstimate: number | undefined;
		if (params.contextSourceMessage) {
			const taskMessages = await this.messageService.toProviderMessages(
				[params.contextSourceMessage],
				{
					contextNotes: [],
					selectedFiles: [],
					selectedFolders: [],
					fileContentOptions: params.fileContentOptions,
					sourcePath: params.sourcePath,
					prebuiltContextMessage: null,
				}
			);
			const userTurnMessages = [
				...(params.contextMessage ? [params.contextMessage] : []),
				...taskMessages.filter((message) => message.role === 'user'),
			];
			userTurnTokenEstimate = estimateProviderMessagesTokens(userTurnMessages);
			params.contextSourceMessage.metadata = {
				...(params.contextSourceMessage.metadata ?? {}),
				userTurnTokenEstimate,
			};
		}

		const nextState: ChatRequestTokenState = {
			totalTokenEstimate: params.requestEstimate.totalTokens,
			messageTokenEstimate: params.requestEstimate.messageTokens,
			toolTokenEstimate: params.requestEstimate.toolTokens,
			userTurnTokenEstimate,
			updatedAt: Date.now(),
		};

		if (
			serializeRequestTokenState(session.requestTokenState)
			!== serializeRequestTokenState(nextState)
		) {
			session.requestTokenState = nextState;
			void this.persistSessionContextCompactionFrontmatter(session);
		}
	}

	private getMessageManagementSettings(): MessageManagementSettings {
		return normalizeMessageManagementSettings({
			...DEFAULT_MESSAGE_MANAGEMENT_SETTINGS,
			...(this.settings.messageManagement ?? {}),
			...(this.plugin.settings.chat?.messageManagement ?? {}),
		});
	}

	private getDefaultFileContentOptions() {
		return {
			maxFileSize: 1024 * 1024,
			maxContentLength: 10000,
			includeExtensions: [],
			excludeExtensions: ['exe', 'dll', 'bin', 'zip', 'rar', 'tar', 'gz'],
			excludePatterns: [
				/node_modules/,
				/\.git/,
				/\.DS_Store/,
				/Thumbs\.db/,
			],
		};
	}

	getResolvedContextBudget(modelTag?: string | null): ResolvedContextBudget {
		return resolveContextBudget(
			this.resolveProviderByTag(modelTag ?? this.state.selectedModelId ?? undefined)
		);
	}

	private estimateSystemPromptTokens(systemPrompt?: string): number {
		if (!systemPrompt?.trim()) {
			return 0;
		}
		return estimateProviderMessagesTokens([
			{ role: 'system', content: systemPrompt },
		]);
	}

	private getLatestContextSourceMessage(messages: ChatMessage[]): ChatMessage | null {
		for (let index = messages.length - 1; index >= 0; index -= 1) {
			const message = messages[index];
			if (message.role !== 'user') {
				continue;
			}
			if (message.metadata?.hiddenFromModel || isEphemeralContextMessage(message)) {
				continue;
			}
			return message;
		}
		return null;
	}

	private getStringMetadata(
		message: ChatMessage | null | undefined,
		key: string
	): string | null {
		const value = message?.metadata?.[key];
		return typeof value === 'string' ? value : null;
	}

	private hasBuildableContextPayload(
		contextNotes: string[],
		selectedFiles: SelectedFile[],
		selectedFolders: SelectedFolder[],
		selectedText: string | null
	): boolean {
		return (
			selectedFiles.length > 0
			|| selectedFolders.length > 0
			|| contextNotes.some((note) => (note ?? '').trim().length > 0)
			|| Boolean(selectedText?.trim())
		);
	}

	private mergeCompactionState(
		base: ChatContextCompactionState | null,
		contextSummary: string,
		contextSourceSignature: string,
		contextTokenEstimate: number,
		totalTokenEstimate: number
	): ChatContextCompactionState {
		return {
			version: base?.version ?? 3,
			coveredRange: base?.coveredRange ?? {
				endMessageId: null,
				messageCount: 0,
				signature: '0',
			},
			summary: base?.summary ?? '',
			historyTokenEstimate: base?.historyTokenEstimate ?? 0,
			contextSummary,
			contextSourceSignature,
			contextTokenEstimate,
			totalTokenEstimate,
			updatedAt: Date.now(),
			droppedReasoningCount: base?.droppedReasoningCount ?? 0,
			overflowedProtectedLayers: base?.overflowedProtectedLayers ?? false,
		};
	}

	private createHistorySummaryGenerator(
		modelTag: string | undefined,
		session: ChatSession
	): MessageContextSummaryGenerator | undefined {
		const summaryModelTag = this.resolveSummaryModelTag(modelTag, session);
		if (!summaryModelTag) {
			return undefined;
		}

		return async (request) => {
			const systemPrompt = [
				'You compress prior chat history for an AI coding assistant.',
				'Output the exact same five sections: [CONTEXT], [KEY DECISIONS], [CURRENT STATE], [IMPORTANT DETAILS], [OPEN ITEMS].',
				'Preserve exact file paths, exact field names, precise numbers, config keys, tool outcomes, pending work, and factual constraints.',
				'Never flip polarity for requirements or prohibitions. If the source says "do not send old reasoning_content", preserve that exact meaning.',
				'Do not invent details. Do not include chain-of-thought. Be concise but keep critical technical details verbatim when needed.',
			].join(' ');

			const userPrompt = request.incremental
				? [
					'Update the existing summary by merging in the newly truncated history span.',
					`Keep the result within roughly ${request.targetTokens} tokens.`,
					'Keep useful prior bullets, deduplicate repeated facts, preserve exact paths/tool names, exact numeric values, and keep requirement/prohibition wording exact.',
					'',
					'Existing summary:',
					request.previousSummary ?? '',
					'',
					'New span summary:',
					request.deltaSummary ?? '',
				].join('\n')
				: [
					'Rewrite the extracted history summary into a concise persistent context block.',
					`Keep the result within roughly ${request.targetTokens} tokens.`,
					'Preserve exact file paths, exact field names, user requests, decisions, tool outcomes, open threads, exact numbers, and any explicit do/do-not rules verbatim when possible.',
					'',
					'Source summary:',
					request.baseSummary,
				].join('\n');

			return this.runSummaryModelRequest(
				summaryModelTag,
				systemPrompt,
				userPrompt,
				Math.max(256, Math.min(900, request.targetTokens))
			);
		};
	}

	private resolveSummaryModelTag(
		preferredModelTag: string | undefined,
		session: ChatSession
	): string | null {
		const summaryModelTag = this.getMessageManagementSettings().summaryModelTag;
		const resolved =
			summaryModelTag
			|| preferredModelTag
			|| session.modelId
			|| this.state.selectedModelId
			|| this.getDefaultProviderTag();
		return resolved ?? null;
	}

	private async runSummaryModelRequest(
		modelTag: string,
		systemPrompt: string,
		userPrompt: string,
		maxTokens: number
	): Promise<string | null> {
		try {
			const provider = this.findProviderByTagExact(modelTag);
			if (!provider) {
				return null;
			}

			const vendor = availableVendors.find((item) => item.name === provider.vendor);
			if (!vendor) {
				return null;
			}

			const providerOptionsRaw = (provider.options as Record<string, unknown>) ?? {};
			const summaryOptions: Record<string, unknown> = {
				...providerOptionsRaw,
				parameters: {
					...((providerOptionsRaw.parameters as Record<string, unknown> | undefined) ?? {}),
					temperature: 0.1,
					max_tokens: maxTokens,
				},
				enableReasoning: false,
				enableThinking: false,
				enableWebSearch: false,
				tools: [],
				toolExecutor: undefined,
				getTools: undefined,
				maxToolCallLoops: undefined,
				mcpTools: undefined,
				mcpGetTools: undefined,
				mcpCallTool: undefined,
				mcpMaxToolCallLoops: undefined,
			};
			if (typeof providerOptionsRaw.thinkingType === 'string') {
				summaryOptions.thinkingType = 'disabled';
			}

			const sendRequest = vendor.sendRequestFunc(summaryOptions as ProviderSettings['options']);
			const controller = new AbortController();
			const resolveEmbed: ResolveEmbedAsBinary = async () => new ArrayBuffer(0);
			let output = '';
			for await (const chunk of sendRequest(
				[
					{ role: 'system', content: systemPrompt },
					{ role: 'user', content: userPrompt },
				],
				controller,
				resolveEmbed
			)) {
				output += chunk;
			}
			const trimmed = output.trim();
			return trimmed.length > 0 ? trimmed : null;
		} catch {
			return null;
		}
	}

	getProviders(): ProviderSettings[] {
		return [...this.plugin.settings.tars.settings.providers];
	}

	getChatSettingsSnapshot(): ChatSettings {
		return this.cloneValue(this.plugin.settings.chat);
	}

	getTarsSettingsSnapshot(): TarsSettings {
		return this.cloneValue(this.plugin.settings.tars.settings);
	}

	getMcpClientManager(): McpClientManager | null {
		return this.runtimeDeps.getMcpClientManager();
	}

	getInstalledSkillsSnapshot(): SkillScanResult | null {
		return this.runtimeDeps.getInstalledSkillsSnapshot();
	}

	getInstalledSubAgentsSnapshot(): SubAgentScanResult | null {
		return this.subAgentScannerService.getCachedResult();
	}

	async loadInstalledSkills(): Promise<SkillScanResult> {
		return await this.runtimeDeps.scanSkills();
	}

	async refreshInstalledSkills(): Promise<SkillScanResult> {
		return await this.runtimeDeps.refreshSkills();
	}

	async loadInstalledSubAgents(): Promise<SubAgentScanResult> {
		return await this.subAgentScannerService.scan();
	}

	async refreshInstalledSubAgents(): Promise<SubAgentScanResult> {
		return await this.subAgentWatcherService.refresh();
	}

	onInstalledSkillsChange(listener: (result: SkillScanResult) => void): () => void {
		return this.runtimeDeps.onSkillsChange(listener);
	}

	onInstalledSubAgentsChange(listener: (result: SubAgentScanResult) => void): () => void {
		return this.subAgentWatcherService.onChange(listener);
	}

	openChatSettingsModal(): void {
		if (this.chatSettingsModal) {
			return;
		}

		this.chatSettingsModal = new ChatSettingsModal(this.app, this, () => {
			this.chatSettingsModal = null;
		});
		this.chatSettingsModal.open();
	}

	closeChatSettingsModal(): void {
		this.chatSettingsModal?.close();
		this.chatSettingsModal = null;
	}

	async persistChatSettings(partial: Partial<ChatSettings>): Promise<void> {
		const previousChatSettings = this.cloneValue(this.plugin.settings.chat);
		const nextMessageManagement = normalizeMessageManagementSettings({
			...(this.plugin.settings.chat.messageManagement ?? {}),
			...(partial.messageManagement ?? {}),
		});
		const nextChatSettings = {
			...this.plugin.settings.chat,
			...partial,
			messageManagement: nextMessageManagement,
		};

		this.plugin.settings.chat = nextChatSettings;
		this.updateSettings(nextChatSettings);

		try {
			await this.plugin.saveSettings();
		} catch (error) {
			this.plugin.settings.chat = previousChatSettings;
			this.updateSettings(previousChatSettings);
			this.handleSettingsSaveError(error);
			throw error;
		}
	}

	async persistGlobalSystemPromptsEnabled(enabled: boolean): Promise<void> {
		const previousTarsSettings = this.cloneValue(this.plugin.settings.tars.settings);
		this.plugin.settings.tars.settings.enableGlobalSystemPrompts = enabled;

		try {
			await this.plugin.saveSettings();
		} catch (error) {
			this.plugin.settings.tars.settings = previousTarsSettings;
			this.handleSettingsSaveError(error);
			throw error;
		}
	}

	async persistMcpSettings(mcpSettings: McpSettings): Promise<void> {
		const previousTarsSettings = this.cloneValue(this.plugin.settings.tars.settings);
		this.plugin.settings.tars.settings.mcp = this.cloneValue(mcpSettings);
		syncToolExecutionSettings(this.plugin.settings.tars.settings);

		try {
			await this.plugin.saveSettings();
			await this.runtimeDeps.ensureMcpInitialized();
			await this.runtimeDeps.ensureSkillsInitialized();
			this.toolRuntimeResolver.invalidateBuiltinToolsRuntime();
			this.bindLivePlanStateSync();
			this.queueSessionPlanSync(this.state.activeSession);
		} catch (error) {
			this.plugin.settings.tars.settings = previousTarsSettings;
			this.handleSettingsSaveError(error);
			throw error;
		}
	}

	async rewriteSessionMessages(session: ChatSession) {
		if (!this.state.shouldSaveHistory) {
			return;
		}
		this.syncSessionMultiModelState(session);
		if (session.filePath) {
			await this.sessionManager.rewriteMessagesOnly(session.filePath, session.messages);
			await this.persistSessionMultiModelFrontmatter(session);
			await this.persistSessionContextCompactionFrontmatter(session);
			return;
		}
		await this.saveActiveSession();
	}

	private readPersistedLayoutMode(): LayoutMode | null {
		try {
			const raw = window.localStorage.getItem(ChatService.LAYOUT_MODE_STORAGE_KEY);
			if (raw === 'horizontal' || raw === 'tabs' || raw === 'vertical') {
				return raw;
			}
		} catch (error) {
			console.warn('[ChatService] 读取布局偏好失败:', error);
		}
		return null;
	}

	private persistLayoutMode(mode: LayoutMode): void {
		try {
			window.localStorage.setItem(ChatService.LAYOUT_MODE_STORAGE_KEY, mode);
		} catch (error) {
			console.warn('[ChatService] 保存布局偏好失败:', error);
		}
	}

	private buildLivePlanGuidance(
		livePlan: PlanSnapshot | null | undefined
	): string | null {
		if (!livePlan || livePlan.summary.total === 0) {
			return null;
		}

		return [
			'当前会话存在一个 livePlan。',
			'你需要根据最新用户消息自行判断：用户是要继续执行当前计划、先调整计划，还是暂时不处理这个计划。',
			'如果用户要继续执行：沿用当前计划，保持计划身份不变，并按顺序逐项推进。',
			'如果用户要调整计划：先调用 write_plan 提交调整后的完整计划，再按新计划执行。',
			'如果用户当前并不是在处理这个计划：不要擅自推进或改写它。',
			'无论是调整计划还是宣称某个任务已完成/已跳过，都必须先用 write_plan 同步计划状态，再输出正文说明。',
		].join('\n');
	}

	private buildLivePlanUserContext(
		livePlan: PlanSnapshot | null | undefined
	): string | null {
		if (!livePlan || livePlan.summary.total === 0) {
			return null;
		}

		const prioritizedTask =
			livePlan.tasks.find((task) => task.status === 'in_progress')
			?? livePlan.tasks.find((task) => task.status === 'todo')
			?? null;

		return [
			'当前会话已有 livePlan。请结合最新用户消息自己判断：是继续原计划、先调整计划，还是忽略这个计划。',
			`计划标题：${livePlan.title}`,
			...(livePlan.description ? [`计划说明：${livePlan.description}`] : []),
			'当前计划任务：',
			...livePlan.tasks.map((task, index) => formatPlanTaskForPrompt(task, index)),
			`当前优先任务：${prioritizedTask?.name ?? '无'}`,
			'如果你决定继续原计划：保持标题、任务名、任务顺序和任务数量不变，并逐项推进。',
			'如果你决定调整计划：先调用 write_plan 提交新的完整计划，再继续执行。',
			'如果你决定暂时不处理这个计划：不要调用 write_plan 去推进它。',
		].join('\n');
	}

	private syncSessionMultiModelState(session = this.state.activeSession): void {
		if (!session) {
			return;
		}
		session.multiModelMode = this.state.multiModelMode;
		session.activeCompareGroupId = this.state.activeCompareGroupId;
		session.layoutMode = this.state.layoutMode;
	}

	private async persistActiveSessionMultiModelFrontmatter(): Promise<void> {
		if (!this.state.activeSession?.filePath) {
			return;
		}
		this.syncSessionMultiModelState(this.state.activeSession);
		await this.persistSessionMultiModelFrontmatter(this.state.activeSession);
	}

	private async persistSessionMultiModelFrontmatter(session: ChatSession): Promise<void> {
		if (!session.filePath) {
			return;
		}
		await this.sessionManager.updateSessionFrontmatter(session.filePath, {
			multiModelMode: session.multiModelMode ?? 'single',
			activeCompareGroupId: session.activeCompareGroupId,
			layoutMode: session.layoutMode ?? this.state.layoutMode
		});
	}

	private restoreMultiModelStateFromSession(session: ChatSession): {
		multiModelMode: MultiModelMode;
		activeCompareGroupId?: string;
		selectedModels: string[];
		layoutMode: LayoutMode;
	} {
		const selectedModels = Array.from(
			new Set(
				session.messages
					.filter((message) => message.role === 'assistant' && message.modelTag)
					.map((message) => message.modelTag!)
			)
		);
		const hasParallelGroup = session.messages.some((message) => Boolean(message.parallelGroupId));
		const inferredMode: MultiModelMode = hasParallelGroup
			? 'compare'
			: 'single';
		const multiModelMode = session.multiModelMode ?? inferredMode;
		const layoutMode = session.layoutMode ?? this.readPersistedLayoutMode() ?? this.state.layoutMode;

		return {
			multiModelMode,
			activeCompareGroupId: session.activeCompareGroupId,
			selectedModels: multiModelMode === 'single'
				? [session.modelId || this.getDefaultProviderTag() || ''].filter(Boolean)
				: selectedModels,
			layoutMode
		};
	}

	/**
	 * 执行 Skill 命令
	 * 加载 skill 内容并将其作为系统提示词发送消息
	 */
	async executeSkillCommand(skillName: string): Promise<void> {
		const skillsResult = await this.loadInstalledSkills();
		const skill = skillsResult.skills.find(
			(s) => s.metadata.name === skillName
		);

		if (!skill) {
			new Notice(`未找到名为 "${skillName}" 的 Skill`);
			return;
		}

		// 读取 skill 文件内容
		try {
			const file = this.app.vault.getAbstractFileByPath(skill.skillFilePath);
			if (!file) {
				new Notice(`Skill 文件不存在: ${skill.skillFilePath}`);
				return;
			}

			const { TFile } = await import('obsidian');
			if (!(file instanceof TFile)) {
				new Notice(`Skill 路径不是有效文件: ${skill.skillFilePath}`);
				return;
			}

			const fullContent = await this.app.vault.read(file);
			// 移除 frontmatter
			const frontmatterRegex = /^---\s*\r?\n([\s\S]*?)\r?\n---(?:\s*\r?\n)?/;
			const bodyContent = fullContent.replace(frontmatterRegex, '').trim();

			if (!bodyContent) {
				new Notice(`Skill "${skillName}" 没有可用的内容`);
				return;
			}

			// 设置模板作为系统提示词
			this.state.selectedPromptTemplate = {
				name: skill.metadata.name,
				path: skill.skillFilePath,
				content: bodyContent,
			};
			this.state.enableTemplateAsSystemPrompt = true;
			this.emitState();

			// 清空输入框
			this.state.inputValue = '';
			this.emitState();

			// 发送空消息以触发 AI 响应
			await this.sendMessage('');
		} catch (error) {
			const reason = error instanceof Error ? error.message : String(error);
			new Notice(`执行 Skill 失败: ${reason}`);
			console.error('[ChatService] 执行 Skill 失败:', error);
		}
	}

	/**
	 * 执行 Sub-Agent 命令
	 * 创建一个调用 Sub-Agent 的工具调用
	 */
	async executeSubAgentCommand(agentName: string, task?: string): Promise<void> {
		const agentsResult = await this.loadInstalledSubAgents();
		const agent = agentsResult.agents.find(
			(a) => a.metadata.name === agentName
		);

		if (!agent) {
			new Notice(`未找到名为 "${agentName}" 的 Sub-Agent`);
			return;
		}

		// 清空输入框
		this.state.inputValue = '';
		this.emitState();

		// 使用 agent 的 system prompt 作为系统提示词
		// 并发送 task 作为用户消息
		const userTask = task || `请执行 ${agentName} 任务`;

		// 准备请求
		const prepared = await this.prepareChatRequest(userTask, {
			skipImageSupportValidation: this.state.multiModelMode !== 'single'
		});

		if (!prepared) {
			return;
		}

		await this.ensurePlanSyncReady();

		// 获取 provider
		const provider = this.resolveProvider();
		if (!provider) {
			new Notice('尚未配置任何AI模型，请先在Tars设置中添加Provider。');
			return;
		}

		// 如果 agent 指定了模型，切换到该模型
		if (agent.metadata.models?.trim()) {
			const modelTag = agent.metadata.models.trim();
			// 检查模型是否存在
			const vendors = availableVendors;
			const targetVendor = vendors.find((v) =>
				v.models.some((m) => m === modelTag) ||
				v.models.some((m) => m.includes(modelTag))
			);

			if (targetVendor) {
				this.state.selectedModelId = targetVendor.tag;
			}
		}

		// 使用 agent 的 system prompt 覆盖
		await this.generateAssistantResponse(prepared.session, {
			systemPromptOverride: agent.systemPrompt,
		});
	}
}
