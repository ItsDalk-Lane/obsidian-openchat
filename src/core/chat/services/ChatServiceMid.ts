import { TFile, TFolder } from 'obsidian';
import { v4 as uuidv4 } from 'uuid';
import { DebugLogger } from 'src/utils/DebugLogger';
import type {
	ChatSession,
	ChatSettings,
	ChatState,
	SelectedFile,
} from '../types/chat';
import type { ParallelResponseGroup } from '../types/multiModel';
import type { MultiModelChatService } from './MultiModelChatService';
import type { MultiModelConfigService } from './MultiModelConfigService';
import type { ChatStateSubscriber } from './ChatStateStore';
import type { MessageService } from './MessageService';
import {
	type ChatTriggerSource,
	ChatServiceCore,
	type SavedChatSessionState,
} from './ChatServiceCore';

export abstract class ChatServiceMid extends ChatServiceCore {
	private _coreInitialized = false;

	protected bindLivePlanStateSync(): void {
		void this.toolRuntimeResolver.ensureBuiltinToolsRuntime(this.state.activeSession).catch((error) => {
			DebugLogger.warn('[ChatService] 初始化内置工具运行时失败', error);
		});
	}

	protected async persistSessionContextCompactionFrontmatter(
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
			DebugLogger.error('[ChatService] 持久化消息压缩状态失败', error);
		}
	}

	protected queueSessionPlanSync(session: ChatSession | null): void {
		this.planSyncService.queueSessionPlanSync(
			session,
			async (targetSession) => await this.toolRuntimeResolver.ensureBuiltinToolsRuntime(targetSession),
		);
	}

	protected async ensurePlanSyncReady(): Promise<void> {
		await this.planSyncService.ensureReady();
	}

	initialize(initialSettings?: Partial<ChatSettings>): void {
		if (this._coreInitialized) {
			// 已完整初始化过：仅更新设置并重新发射状态（幂等保护）
			this.updateSettings(initialSettings ?? {});
			this.emitState();
			return;
		}
		this._coreInitialized = true;

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

	protected consumePendingTriggerSource(): ChatTriggerSource {
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
					DebugLogger.error('[ChatService] 更新模板系统提示词开关失败', error);
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

	protected getAiRuntimeToolSettings() {
		return {
			globalTools: [],
			executionMode: 'manual' as const,
			enabled: false,
		};
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

	// Methods continue in ChatServiceOps.ts
}
