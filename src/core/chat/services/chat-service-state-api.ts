import { v4 as uuidv4 } from 'uuid';
import { normalizeBuiltinServerId } from 'src/tools/runtime/constants';
import { getChatHistoryPath } from 'src/utils/AIPathManager';
import { DebugLogger } from 'src/utils/DebugLogger';
import type {
	ChatAttachmentFileInput,
	ChatAttachmentFolderInput,
} from 'src/domains/chat/service-attachment-selection';
import { normalizeMessageManagementSettings } from '../types/chat';
import type { ChatSession, ChatSettings, McpToolMode, SelectedFile, SelectedFolder } from '../types/chat';
import type { CompareGroup, LayoutMode, MultiModelMode, ParallelResponseGroup } from '../types/multiModel';
import type { ChatServiceInternals } from './chat-service-internals';
import { getDefaultProviderTag } from './chat-service-deps-support';

export const createChatServiceStateApi = (internals: ChatServiceInternals) => ({
	initialize(initialSettings?: Partial<ChatSettings>): void {
		if (internals.coreInitialized) {
			internals.service.updateSettings(initialSettings ?? {});
			internals.service.emitState();
			return;
		}
		internals.coreInitialized = true;
		internals.service.updateSettings(initialSettings ?? {});
		const persistedLayoutMode = internals.service.readPersistedLayoutMode();
		if (persistedLayoutMode) {
			internals.stateStore.getMutableState().layoutMode = persistedLayoutMode;
		}
		if (!internals.stateStore.getMutableState().selectedModelId) {
			internals.stateStore.getMutableState().selectedModelId = getDefaultProviderTag(internals);
		}
		if (
			internals.stateStore.getMutableState().selectedModels.length === 0
			&& internals.stateStore.getMutableState().selectedModelId
		) {
			internals.stateStore.getMutableState().selectedModels = [
				internals.stateStore.getMutableState().selectedModelId!,
			];
		}
		if (!internals.stateStore.getMutableState().activeSession) {
			internals.service.createNewSession();
		}
		internals.service.bindLivePlanStateSync();
		internals.service.queueSessionPlanSync(internals.stateStore.getMutableState().activeSession);
		internals.service.emitState();
	},
	onChatPanelOpen(): void {
		internals.stateStore.getMutableState().selectedModelId =
			internals.settings.defaultModel || getDefaultProviderTag(internals);
		internals.service.emitState();
	},
	getState() {
		return internals.stateStore.getState();
	},
	getActiveSession() {
		return internals.stateStore.getMutableState().activeSession;
	},
	subscribe(callback: Parameters<typeof internals.stateStore.subscribe>[0]) {
		return internals.stateStore.subscribe(callback);
	},
	setMultiModelService(service: typeof internals.multiModelService): void {
		internals.multiModelService = service;
	},
	setMultiModelConfigService(service: typeof internals.multiModelConfigService): void {
		internals.multiModelConfigService = service;
	},
	getMultiModelConfigService() {
		return internals.multiModelConfigService;
	},
	notifyStateChange(): void {
		internals.stateStore.emit();
	},
	setGeneratingState(isGenerating: boolean): void {
		internals.stateStore.setGenerating(isGenerating, true);
	},
	setErrorState(error?: string): void {
		internals.stateStore.setError(error, true);
	},
	setParallelResponses(group?: ParallelResponseGroup): void {
		internals.stateStore.setParallelResponses(group, true);
	},
	clearParallelResponses(): void {
		internals.stateStore.setParallelResponses(undefined, true);
	},
	createNewSession(initialTitle = '新的聊天'): ChatSession {
		if (internals.stateStore.getMutableState().isGenerating) {
			internals.service.stopGeneration();
		}
		internals.subAgentScannerService.clearCache();
		const now = Date.now();
		const state = internals.stateStore.getMutableState();
		const session: ChatSession = {
			id: `chat-${uuidv4()}`,
			title: initialTitle,
			modelId: state.selectedModelId ?? getDefaultProviderTag(internals) ?? '',
			messages: [],
			createdAt: now,
			updatedAt: now,
			contextNotes: [],
			selectedImages: [],
			enableTemplateAsSystemPrompt: false,
			multiModelMode: state.multiModelMode,
			activeCompareGroupId: state.activeCompareGroupId,
			layoutMode: state.layoutMode,
			livePlan: null,
			contextCompaction: null,
			requestTokenState: null,
		};
		internals.stateStore.mutate((mutableState) => {
			mutableState.activeSession = session;
			mutableState.contextNotes = [];
			mutableState.selectedImages = [];
			mutableState.selectedText = undefined;
			mutableState.inputValue = '';
			mutableState.enableTemplateAsSystemPrompt = false;
			mutableState.selectedPromptTemplate = undefined;
			mutableState.showTemplateSelector = false;
			mutableState.mcpToolMode = 'auto';
			mutableState.mcpSelectedServerIds = [];
			mutableState.activeCompareGroupId = undefined;
			mutableState.parallelResponses = undefined;
		});
		internals.attachmentSelectionService.clearSelection(false);
		internals.pendingTriggerSource = 'chat_input';
		internals.service.emitState();
		internals.service.queueSessionPlanSync(session);
		return session;
	},
	setInputValue(value: string): void {
		internals.stateStore.getMutableState().inputValue = value;
		internals.service.emitState();
	},
	addContextNote(note: string): void {
		if (!note.trim()) return;
		const normalized = note.trim();
		const state = internals.stateStore.getMutableState();
		state.contextNotes = Array.from(new Set([...state.contextNotes, normalized]));
		if (state.activeSession) {
			const sessionNotes = new Set(state.activeSession.contextNotes ?? []);
			sessionNotes.add(normalized);
			state.activeSession.contextNotes = Array.from(sessionNotes);
		}
		internals.service.emitState();
	},
	removeContextNote(note: string): void {
		const state = internals.stateStore.getMutableState();
		state.contextNotes = state.contextNotes.filter((ctx) => ctx !== note);
		if (state.activeSession?.contextNotes) {
			state.activeSession.contextNotes = state.activeSession.contextNotes.filter((ctx) => ctx !== note);
		}
		internals.service.emitState();
	},
	setSelectedImages(images: string[]): void {
		internals.stateStore.getMutableState().selectedImages = images;
		internals.service.emitState();
	},
	addSelectedImages(images: string[]): void {
		if (images.length === 0) return;
		const state = internals.stateStore.getMutableState();
		state.selectedImages = internals.imageResolver.mergeSelectedImages(state.selectedImages, images);
		internals.service.emitState();
	},
	removeSelectedImage(image: string): void {
		const state = internals.stateStore.getMutableState();
		state.selectedImages = state.selectedImages.filter((img) => img !== image);
		internals.service.emitState();
	},
	setSelectedText(text: string): void {
		internals.stateStore.getMutableState().selectedText = text;
		internals.service.emitState();
	},
	setNextTriggerSource(source) {
		internals.pendingTriggerSource = source;
	},
	clearSelectedText(): void {
		internals.stateStore.getMutableState().selectedText = undefined;
		internals.service.emitState();
	},
	consumePendingTriggerSource() {
		const triggerSource = internals.pendingTriggerSource;
		internals.pendingTriggerSource = 'chat_input';
		return triggerSource;
	},
	setShouldSaveHistory(shouldSave: boolean): void {
		internals.stateStore.setShouldSaveHistory(shouldSave, true);
	},
	getAutosaveChatEnabled(): boolean {
		return Boolean(internals.settings.autosaveChat);
	},
	setReasoningToggle(enabled: boolean): void {
		internals.stateStore.getMutableState().enableReasoningToggle = enabled;
		internals.service.emitState();
	},
	setWebSearchToggle(enabled: boolean): void {
		internals.stateStore.getMutableState().enableWebSearchToggle = enabled;
		internals.service.emitState();
	},
	setTemplateAsSystemPromptToggle(enabled: boolean): void {
		const state = internals.stateStore.getMutableState();
		const session = state.activeSession;
		if (state.enableTemplateAsSystemPrompt === enabled && (!session || session.enableTemplateAsSystemPrompt === enabled)) {
			return;
		}
		state.enableTemplateAsSystemPrompt = enabled;
		if (session) {
			session.enableTemplateAsSystemPrompt = enabled;
			if (session.filePath) {
				void internals.sessionManager.updateSessionFrontmatter(session.filePath, {
					enableTemplateAsSystemPrompt: enabled,
				}).catch((error) => {
					DebugLogger.error('[ChatService] 更新模板系统提示词开关失败', error);
				});
			}
		}
		internals.service.emitState();
	},
	getReasoningToggle() { return internals.stateStore.getMutableState().enableReasoningToggle; },
	getWebSearchToggle() { return internals.stateStore.getMutableState().enableWebSearchToggle; },
	getTemplateAsSystemPromptToggle() { return internals.stateStore.getMutableState().enableTemplateAsSystemPrompt; },
	addSelectedFile(file: ChatAttachmentFileInput) { internals.attachmentSelectionService.addSelectedFile(file); },
	addActiveFile(file: ChatAttachmentFileInput | null) { internals.attachmentSelectionService.addActiveFile(file); },
	removeAutoAddedFile(filePath: string) { internals.attachmentSelectionService.removeAutoAddedFile(filePath); },
	removeAllAutoAddedFiles() { internals.attachmentSelectionService.removeAllAutoAddedFiles(); },
	getAutoAddedFiles(): SelectedFile[] { return internals.attachmentSelectionService.getAutoAddedFiles(); },
	onNoActiveFile() { internals.attachmentSelectionService.onNoActiveFile(); },
	onChatViewReopened(currentFile: ChatAttachmentFileInput | null) { internals.attachmentSelectionService.onChatViewReopened(currentFile); },
	addSelectedFolder(folder: ChatAttachmentFolderInput) { internals.attachmentSelectionService.addSelectedFolder(folder); },
	removeSelectedFile(fileId: string, isManualRemoval = true) { internals.attachmentSelectionService.removeSelectedFile(fileId, isManualRemoval); },
	removeSelectedFolder(folderId: string) { internals.attachmentSelectionService.removeSelectedFolder(folderId); },
	setSelectedFiles(files: SelectedFile[]) { internals.attachmentSelectionService.setSelectedFiles(files); },
	setSelectedFolders(folders: SelectedFolder[]) { internals.attachmentSelectionService.setSelectedFolders(folders); },
	setTemplateSelectorVisibility(visible: boolean): void { internals.stateStore.getMutableState().showTemplateSelector = visible; internals.service.emitState(); },
	getEnabledMcpServers() { return internals.toolRuntimeResolver.getEnabledMcpServers(); },
	async getBuiltinToolsForSettings() { return await internals.toolRuntimeResolver.getBuiltinToolsForSettings(); },
	setMcpToolMode(mode: McpToolMode): void { internals.stateStore.setMcpToolMode(mode, true); },
	setMcpSelectedServerIds(ids: string[]): void { internals.stateStore.getMutableState().mcpSelectedServerIds = ids.map(normalizeBuiltinServerId); internals.service.emitState(); },
	setModel(tag: string): void {
		const state = internals.stateStore.getMutableState();
		state.selectedModelId = tag;
		if (state.multiModelMode === 'single') state.selectedModels = tag ? [tag] : [];
		if (state.activeSession) state.activeSession.modelId = tag;
		internals.service.emitState();
	},
	setSelectedModels(tags: string[]): void { internals.stateStore.getMutableState().selectedModels = Array.from(new Set(tags.filter(Boolean))); internals.service.emitState(); },
	addSelectedModel(tag: string): void { if (!tag) return; internals.stateStore.getMutableState().selectedModels = Array.from(new Set([...internals.stateStore.getMutableState().selectedModels, tag])); internals.service.emitState(); },
	removeSelectedModel(tag: string): void { internals.stateStore.getMutableState().selectedModels = internals.stateStore.getMutableState().selectedModels.filter((item) => item !== tag); internals.service.emitState(); },
	getSelectedModels(): string[] { return [...internals.stateStore.getMutableState().selectedModels]; },
	setMultiModelMode(mode: MultiModelMode): void {
		const state = internals.stateStore.getMutableState();
		state.multiModelMode = mode;
		if (mode === 'single' && state.selectedModelId) state.selectedModels = [state.selectedModelId];
		internals.service.syncSessionMultiModelState();
		void internals.service.persistActiveSessionMultiModelFrontmatter();
		internals.service.emitState();
	},
	setLayoutMode(mode: LayoutMode): void {
		internals.stateStore.getMutableState().layoutMode = mode;
		internals.service.syncSessionMultiModelState();
		internals.service.persistLayoutMode(mode);
		void internals.service.persistActiveSessionMultiModelFrontmatter();
		internals.service.emitState();
	},
	setActiveCompareGroup(groupId?: string): void {
		internals.stateStore.getMutableState().activeCompareGroupId = groupId;
		internals.service.syncSessionMultiModelState();
		void internals.service.persistActiveSessionMultiModelFrontmatter();
		internals.service.emitState();
	},
	async loadCompareGroups(): Promise<CompareGroup[]> { return internals.multiModelConfigService ? await internals.multiModelConfigService.loadCompareGroups() : []; },
	async saveCompareGroup(group: CompareGroup): Promise<string | null> { return internals.multiModelConfigService ? await internals.multiModelConfigService.saveCompareGroup(group) : null; },
	async deleteCompareGroup(id: string): Promise<void> { if (internals.multiModelConfigService) await internals.multiModelConfigService.deleteCompareGroup(id); },
	watchMultiModelConfigs(callback: Parameters<NonNullable<typeof internals.multiModelConfigService>['watchConfigs']>[0]) {
		return internals.multiModelConfigService ? internals.multiModelConfigService.watchConfigs(callback) : null;
	},
	stopGeneration(): void {
		if (internals.stateStore.getMutableState().multiModelMode !== 'single' && internals.multiModelService) {
			internals.multiModelService.stopAllGeneration();
		}
		if (internals.controller) { internals.controller.abort(); internals.controller = null; }
		if (internals.stateStore.getMutableState().isGenerating) { internals.stateStore.getMutableState().isGenerating = false; internals.service.emitState(); }
	},
	stopAllGeneration(): void {
		internals.multiModelService?.stopAllGeneration();
		if (internals.controller) { internals.controller.abort(); internals.controller = null; }
		if (internals.stateStore.getMutableState().isGenerating) { internals.stateStore.getMutableState().isGenerating = false; internals.service.emitState(); }
	},
	stopModelGeneration(modelTag: string): void { internals.multiModelService?.stopModelGeneration(modelTag); },
	async retryModel(messageId: string): Promise<void> { if (internals.multiModelService) await internals.multiModelService.retryModel(messageId); },
	async retryAllFailed(): Promise<void> { if (internals.multiModelService) await internals.multiModelService.retryAllFailed(); },
	updateSettings(settings: Partial<ChatSettings>): void {
		const mergedMessageManagement = normalizeMessageManagementSettings({
			...(internals.settings.messageManagement ?? {}),
			...(settings.messageManagement ?? {}),
		});
		internals.settings = { ...internals.settings, ...settings, messageManagement: mergedMessageManagement };
		internals.sessionManager.setHistoryFolder(getChatHistoryPath(internals.settingsAccessor.getAiDataFolder()));
		if ('autosaveChat' in settings) internals.stateStore.setShouldSaveHistory(Boolean(internals.settings.autosaveChat));
		if (!internals.stateStore.getMutableState().selectedModelId) {
			internals.stateStore.getMutableState().selectedModelId = internals.settings.defaultModel || getDefaultProviderTag(internals);
		}
		internals.service.emitState();
	},
});
