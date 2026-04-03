import { v4 as uuidv4 } from 'uuid';
import { getChatHistoryPath } from 'src/utils/aiPathSupport';
import type {
	ChatAttachmentFileInput,
	ChatAttachmentFolderInput,
} from 'src/domains/chat/service-attachment-selection';
import type { SelectedTextContext } from '../types/chat';
import { localInstance } from 'src/i18n/locals';
import { DebugLogger } from 'src/utils/DebugLogger';
import { normalizeMessageManagementSettings } from '../types/chat';
import type { ChatSession, ChatSettings, SelectedFile, SelectedFolder } from '../types/chat';
import type { LayoutMode, MultiModelMode, ParallelResponseGroup } from '../types/multiModel';
import type { ChatServiceInternals } from './chat-service-internals';
import { isManagedImportedSelectedFile } from './chat-managed-attachments';

const resolveDefaultProviderTag = (internals: ChatServiceInternals): string | null => {
	return internals.service.getDefaultProviderTag();
};

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
			internals.stateStore.getMutableState().selectedModelId = resolveDefaultProviderTag(internals);
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
			internals.settings.defaultModel || resolveDefaultProviderTag(internals);
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
			modelId: state.selectedModelId ?? resolveDefaultProviderTag(internals) ?? '',
			messages: [],
			createdAt: now,
			updatedAt: now,
			contextNotes: [],
			selectedImages: [],
			multiModelMode: state.multiModelMode,
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
			mutableState.selectedTextContext = undefined;
			mutableState.inputValue = '';
			mutableState.selectedPromptTemplate = undefined;
			mutableState.parallelResponses = undefined;
			mutableState.skillSessionState = null;
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
	setSelectedText(text: string, context?: SelectedTextContext): void {
		const state = internals.stateStore.getMutableState();
		state.selectedText = text;
		state.selectedTextContext = context;
		internals.service.emitState();
	},
	setNextTriggerSource(source) {
		internals.pendingTriggerSource = source;
	},
	clearSelectedText(): void {
		const state = internals.stateStore.getMutableState();
		state.selectedText = undefined;
		state.selectedTextContext = undefined;
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
	getReasoningToggle() { return internals.stateStore.getMutableState().enableReasoningToggle; },
	getWebSearchToggle() { return internals.stateStore.getMutableState().enableWebSearchToggle; },
	addSelectedFile(file: ChatAttachmentFileInput) { internals.attachmentSelectionService.addSelectedFile(file); },
	addSelectedFolder(folder: ChatAttachmentFolderInput) { internals.attachmentSelectionService.addSelectedFolder(folder); },
	removeSelectedFile(fileId: string) {
		internals.attachmentSelectionService.removeSelectedFile(fileId);
	},
	deleteManagedImportedSelectedFile(fileId: string) {
		const selectedFile = internals.stateStore
			.getMutableState()
			.selectedFiles
			.find((file) => file.id === fileId);
		if (!isManagedImportedSelectedFile(selectedFile)) {
			return;
		}
		void (async () => {
			try {
				if (await internals.obsidianApi.pathExists(selectedFile.path)) {
					await internals.obsidianApi.deleteVaultPath(selectedFile.path);
				}
			} catch (error) {
				DebugLogger.warn('[ChatService] 删除外部导入附件失败', {
					path: selectedFile.path,
					error,
				});
				const message = error instanceof Error && error.message.trim().length > 0
					? error.message
					: selectedFile.name;
				internals.obsidianApi.notify(
					localInstance.chat_managed_attachment_delete_failed_prefix.replace('{message}', message),
				);
			}
		})();
	},
	removeSelectedFolder(folderId: string) { internals.attachmentSelectionService.removeSelectedFolder(folderId); },
	setSelectedFiles(files: SelectedFile[]) { internals.attachmentSelectionService.setSelectedFiles(files); },
	setSelectedFolders(folders: SelectedFolder[]) { internals.attachmentSelectionService.setSelectedFolders(folders); },
	async getBuiltinToolsForSettings() { return await internals.toolRuntimeResolver.getBuiltinToolsForSettings(); },
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
			internals.stateStore.getMutableState().selectedModelId = internals.settings.defaultModel || resolveDefaultProviderTag(internals);
		}
		internals.service.emitState();
	},
});
