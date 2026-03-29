import { localInstance } from 'src/i18n/locals';
import { DebugLogger } from 'src/utils/DebugLogger';
import type { AiRuntimeSettings } from 'src/settings/ai-runtime/api';
import type { McpSettings } from 'src/types/mcp';
import type { ChatSession } from '../types/chat';
import type { SavedChatSessionState } from './chat-service-types';
import type { LayoutMode, MultiModelMode } from '../types/multiModel';
import type { ChatServiceInternals } from './chat-service-internals';
import { cloneValue as cloneValueHelper } from './chat-settings-persistence';
import {
	ensureCommandFacade,
	getMessageMutationFacade,
	getMessageOperationFacade,
	getPersistenceFacade,
} from './chat-service-facades';

export const createChatServiceHistoryApi = (internals: ChatServiceInternals) => ({
	getMessageService() {
		return internals.messageService;
	},
	saveSessionState(): SavedChatSessionState {
		const selection = internals.attachmentSelectionService.getSelectionSnapshot();
		return {
			activeSession: internals.stateStore.getMutableState().activeSession
				? JSON.parse(JSON.stringify(internals.stateStore.getMutableState().activeSession))
				: null,
			selectedFiles: selection.selectedFiles,
			selectedFolders: selection.selectedFolders,
		};
	},
	restoreSessionState(savedState: SavedChatSessionState): void {
		if (savedState.activeSession) {
			internals.stateStore.setActiveSession(savedState.activeSession);
			internals.stateStore.getMutableState().enableTemplateAsSystemPrompt =
				savedState.activeSession.enableTemplateAsSystemPrompt ?? false;
		} else {
			internals.stateStore.setActiveSession(null);
			internals.stateStore.getMutableState().enableTemplateAsSystemPrompt = false;
		}
		internals.attachmentSelectionService.restoreSelection(
			{ selectedFiles: savedState.selectedFiles, selectedFolders: savedState.selectedFolders },
			false,
		);
		internals.stateStore.emit();
		internals.service.queueSessionPlanSync(internals.stateStore.getMutableState().activeSession);
	},
	async selectPromptTemplate(templatePath: string): Promise<void> {
		try {
			const templateFile = internals.obsidianApi.getVaultEntry(templatePath);
			if (!templateFile || templateFile.kind !== 'file') {
				throw new Error(`模板文件不存在: ${templatePath}`);
			}
			const templateContent = await internals.obsidianApi.readVaultFile(templatePath);
			internals.stateStore.getMutableState().selectedPromptTemplate = {
				path: templatePath,
				name: templateFile.name.replace(/\.[^.]+$/u, ''),
				content: templateContent,
			};
			internals.stateStore.getMutableState().showTemplateSelector = false;
			internals.service.emitState();
		} catch (error) {
			DebugLogger.error('[ChatService] 选择提示词模板失败', error);
			const message = error instanceof Error ? error.message : String(error);
			internals.obsidianApi.notify(
				localInstance.chat_prompt_template_select_failed_prefix.replace('{message}', message),
			);
		}
	},
	clearSelectedPromptTemplate(): void { internals.stateStore.getMutableState().selectedPromptTemplate = undefined; internals.service.emitState(); },
	getPromptTemplateContent(): string | undefined { return internals.stateStore.getMutableState().selectedPromptTemplate?.content; },
	hasPromptTemplateVariables(): boolean { return /\{\{([^}]+)\}\}/g.test(internals.stateStore.getMutableState().selectedPromptTemplate?.content ?? ''); },
	async prepareChatRequest(content?: string, options?: { skipImageSupportValidation?: boolean }) {
		return await getMessageOperationFacade(internals).prepareChatRequest(content, options);
	},
	async sendMessage(content?: string): Promise<void> { await getMessageOperationFacade(internals).sendMessage(content); },
	async listHistory() { return internals.sessionManager.listHistory(); },
	async loadHistory(filePath: string): Promise<void> {
		const session = await internals.sessionManager.loadHistory(filePath);
		if (!session) return;
		session.enableTemplateAsSystemPrompt = session.enableTemplateAsSystemPrompt ?? false;
		session.filePath = filePath;
		internals.stateStore.setActiveSession(session);
		const state = internals.stateStore.getMutableState();
		state.contextNotes = session.contextNotes ?? [];
		state.selectedImages = session.selectedImages ?? [];
		internals.attachmentSelectionService.applySessionSelection(session);
		state.selectedModelId = session.modelId || internals.settings.defaultModel || internals.service.getDefaultProviderTag();
		const restored = internals.service.restoreMultiModelStateFromSession(session);
		state.multiModelMode = restored.multiModelMode;
		state.activeCompareGroupId = restored.activeCompareGroupId;
		state.selectedModels = restored.selectedModels;
		state.layoutMode = restored.layoutMode;
		state.parallelResponses = undefined;
		state.enableTemplateAsSystemPrompt = session.enableTemplateAsSystemPrompt;
		state.selectedPromptTemplate = undefined;
		state.showTemplateSelector = false;
		internals.service.emitState();
		internals.service.queueSessionPlanSync(session);
	},
	async saveActiveSession(): Promise<void> { if (internals.stateStore.getMutableState().activeSession) await internals.sessionManager.saveSession(internals.stateStore.getMutableState().activeSession!); },
	async deleteHistory(filePath: string): Promise<void> { await internals.sessionManager.deleteHistory(filePath); },
	async editMessage(messageId: string, content: string): Promise<void> { await getMessageMutationFacade(internals).editMessage(messageId, content); },
	async editAndRegenerate(messageId: string, content: string): Promise<void> { await getMessageMutationFacade(internals).editAndRegenerate(messageId, content); },
	async deleteMessage(messageId: string): Promise<void> { await getMessageMutationFacade(internals).deleteMessage(messageId); },
	async togglePinnedMessage(messageId: string): Promise<void> { await getMessageMutationFacade(internals).togglePinnedMessage(messageId); },
	insertMessageToEditor(messageId: string): void { getMessageMutationFacade(internals).insertMessageToEditor(messageId); },
	async regenerateFromMessage(messageId: string): Promise<void> { await getMessageMutationFacade(internals).regenerateFromMessage(messageId); },
	async refreshProviderSettings(aiRuntimeSettings: AiRuntimeSettings): Promise<void> { getMessageMutationFacade(internals).refreshProviderSettings(aiRuntimeSettings); },
	emitState(): void { internals.stateStore.emit(); },
	getProviders() { return [...internals.settingsAccessor.getAiRuntimeSettings().providers]; },
	getAiDataFolder() { return internals.settingsAccessor.getAiDataFolder(); },
	getChatSettingsSnapshot() { return cloneValueHelper(internals.settingsAccessor.getChatSettings()); },
	getAiRuntimeSettingsSnapshot() { return cloneValueHelper(internals.settingsAccessor.getAiRuntimeSettings()); },
	getMcpClientManager() { return internals.runtimeDeps.getMcpClientManager(); },
	getInstalledSkillsSnapshot() { return internals.runtimeDeps.getInstalledSkillsSnapshot(); },
	getInstalledSubAgentsSnapshot() { return internals.subAgentScannerService.getCachedResult(); },
	async loadInstalledSkills() { return await internals.runtimeDeps.scanSkills(); },
	async refreshInstalledSkills() { return await internals.runtimeDeps.refreshSkills(); },
	async loadInstalledSubAgents() { return await internals.subAgentScannerService.scan(); },
	async refreshInstalledSubAgents() { return await internals.subAgentWatcherService.refresh(); },
	onInstalledSkillsChange(listener: Parameters<typeof internals.runtimeDeps.onSkillsChange>[0]) { return internals.runtimeDeps.onSkillsChange(listener); },
	onInstalledSubAgentsChange(listener: Parameters<typeof internals.subAgentWatcherService.onChange>[0]) { return internals.subAgentWatcherService.onChange(listener); },
	openChatSettingsModal(): void { internals.obsidianApi.openSettingsTab(internals.settingsAccessor.getManifestId()); },
	async persistChatSettings(partial: Partial<typeof internals.settings>) { await getPersistenceFacade(internals).persistChatSettings(partial); },
	async persistGlobalSystemPromptsEnabled(enabled: boolean) { await getPersistenceFacade(internals).persistGlobalSystemPromptsEnabled(enabled); },
	async persistMcpSettings(mcpSettings: McpSettings) { await getPersistenceFacade(internals).persistMcpSettings(mcpSettings); },
	async rewriteSessionMessages(session: ChatSession) { await getPersistenceFacade(internals).rewriteSessionMessages(session); },
	readPersistedLayoutMode(): LayoutMode | null { return getPersistenceFacade(internals).readPersistedLayoutMode(); },
	persistLayoutMode(mode: LayoutMode): void { getPersistenceFacade(internals).persistLayoutMode(mode); },
	syncSessionMultiModelState(session = internals.stateStore.getMutableState().activeSession): void { getPersistenceFacade(internals).syncSessionMultiModelState(session); },
	async persistActiveSessionMultiModelFrontmatter(): Promise<void> { await getPersistenceFacade(internals).persistActiveSessionMultiModelFrontmatter(); },
	async persistSessionMultiModelFrontmatter(session: ChatSession): Promise<void> { await getPersistenceFacade(internals).persistSessionMultiModelFrontmatter(session); },
	restoreMultiModelStateFromSession(session: ChatSession): { multiModelMode: MultiModelMode; activeCompareGroupId?: string; selectedModels: string[]; layoutMode: LayoutMode } { return getPersistenceFacade(internals).restoreMultiModelStateFromSession(session); },
	bindLivePlanStateSync(): void { void internals.toolRuntimeResolver.ensureBuiltinToolsRuntime(internals.stateStore.getMutableState().activeSession).catch((error) => DebugLogger.warn('[ChatService] 初始化内置工具运行时失败', error)); },
	async persistSessionContextCompactionFrontmatter(session: ChatSession): Promise<void> {
		if (!internals.stateStore.getMutableState().shouldSaveHistory || !session.filePath) return;
		try {
			await internals.sessionManager.updateSessionFrontmatter(session.filePath, {
				contextCompaction: session.contextCompaction ?? null,
				requestTokenState: session.requestTokenState ?? null,
			});
		} catch (error) {
			DebugLogger.error('[ChatService] 持久化消息压缩状态失败', error);
		}
	},
	queueSessionPlanSync(session: ChatSession | null): void { internals.planSyncService.queueSessionPlanSync(session, async (targetSession) => await internals.toolRuntimeResolver.ensureBuiltinToolsRuntime(targetSession)); },
	async ensurePlanSyncReady(): Promise<void> { await internals.planSyncService.ensureReady(); },
	invalidateSessionContextCompaction(session: ChatSession): void {
		if (!session.contextCompaction && !session.requestTokenState) return;
		session.contextCompaction = null;
		session.requestTokenState = null;
		void internals.service.persistSessionContextCompactionFrontmatter(session);
	},
	async executeSkillCommand(skillName: string): Promise<void> { await ensureCommandFacade(internals).executeSkillCommand(skillName); },
	async executeSubAgentCommand(agentName: string, task?: string): Promise<void> { await ensureCommandFacade(internals).executeSubAgentCommand(agentName, task); },
	dispose(): void {
		internals.stateStore.dispose();
		internals.multiModelService?.stopAllGeneration();
		internals.controller?.abort();
		internals.controller = null;
		internals.planSyncService.dispose();
		internals.toolRuntimeResolver.dispose();
		internals.subAgentWatcherService.stop();
		internals.subAgentScannerService.clearCache();
	},
});
