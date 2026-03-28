import { Notice, TFile } from 'obsidian';
import { normalizeBuiltinServerId } from 'src/tools/runtime/constants';
import type { AiRuntimeSettings } from 'src/settings/ai-runtime';
import type { Message as ProviderMessage } from 'src/types/provider';
import type { ToolDefinition } from 'src/types/tool';
import { DebugLogger } from 'src/utils/DebugLogger';
import { localInstance } from 'src/i18n/locals';
import { getChatHistoryPath } from 'src/utils/AIPathManager';
import type { ResolvedContextBudget } from 'src/core/chat/utils/contextBudget';
import type {
	ChatMessage,
	ChatSettings,
	ChatSession,
	McpToolMode,
	MessageManagementSettings,
	SelectedFile,
	SelectedFolder,
} from '../types/chat';
import { normalizeMessageManagementSettings } from '../types/chat';
import type { CompareGroup, LayoutMode, MultiModelMode } from '../types/multiModel';
import type { MultiModelConfigService } from './MultiModelConfigService';
import type { FileContentOptions } from './FileContentService';
import type { ChatHistoryEntry } from './HistoryService';
import {
	type GenerateAssistantOptions,
	type PreparedChatRequest,
} from './ChatServiceCore';
import { ChatServiceMid } from './ChatServiceMid';
import type { ChatCommandFacade } from './chatCommandFacade';
import type { ChatGenerationFacade } from './chatGenerationFacade';
import type {
	ChatMessageMutationFacade,
	ChatMessageOperationFacade,
} from './chatMessageFacade';
import type { ChatPersistenceFacade } from './chatPersistenceFacade';
import type {
	ChatProviderMessageBuildOptions,
	ChatProviderMessageFacade,
} from './chatProviderMessageFacade';
import type { McpSettings } from 'src/types/mcp';

export abstract class ChatServiceOps extends ChatServiceMid {
	protected abstract getCommandFacade(): ChatCommandFacade;

	protected abstract getGenerationFacade(): ChatGenerationFacade;

	protected abstract getMessageOperationFacade(): ChatMessageOperationFacade;

	protected abstract getMessageMutationFacade(): ChatMessageMutationFacade;

	protected abstract getPersistenceFacade(): ChatPersistenceFacade;

	protected abstract getProviderMessageFacade(): ChatProviderMessageFacade;

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
			DebugLogger.error('[ChatService] 选择提示词模板失败', error);
			const message = error instanceof Error ? error.message : String(error);
			new Notice(localInstance.chat_prompt_template_select_failed_prefix.replace('{message}', message));
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
		return await this.getMessageOperationFacade().prepareChatRequest(content, options);
	}

	async sendMessage(content?: string) {
		await this.getMessageOperationFacade().sendMessage(content);
	}

	protected async generateAssistantResponse(session: ChatSession) {
		await this.getGenerationFacade().generateAssistantResponse(session);
	}

	async generateAssistantResponseForModel(
		session: ChatSession,
		modelTag: string,
		options?: GenerateAssistantOptions
	): Promise<ChatMessage> {
		return await this.getGenerationFacade().generateAssistantResponseForModel(
			session,
			modelTag,
			options
		);
	}

	async buildProviderMessages(session: ChatSession): Promise<ProviderMessage[]> {
		return await this.getProviderMessageFacade().buildProviderMessages(session);
	}

	async buildProviderMessagesWithOptions(
		session: ChatSession,
		options?: ChatProviderMessageBuildOptions
	): Promise<ProviderMessage[]> {
		return await this.getProviderMessageFacade().buildProviderMessagesWithOptions(
			session,
			options
		);
	}

	async buildProviderMessagesForAgent(
		messages: ChatMessage[],
		session: ChatSession,
		systemPrompt?: string,
		modelTag?: string,
		requestTools: ToolDefinition[] = []
	): Promise<ProviderMessage[]> {
		return await this.getProviderMessageFacade().buildProviderMessagesForAgent(
			messages,
			session,
			systemPrompt,
			modelTag,
			requestTools
		);
	}

	protected getMessageManagementSettings(): MessageManagementSettings {
		return this.getProviderMessageFacade().getMessageManagementSettings();
	}

	protected getDefaultFileContentOptions(): FileContentOptions {
		return this.getProviderMessageFacade().getDefaultFileContentOptions();
	}

	getResolvedContextBudget(modelTag?: string | null): ResolvedContextBudget {
		return this.getProviderMessageFacade().resolveContextBudget(modelTag);
	}

	async persistChatSettings(partial: Partial<ChatSettings>): Promise<void> {
		await this.getPersistenceFacade().persistChatSettings(partial);
	}

	async persistGlobalSystemPromptsEnabled(enabled: boolean): Promise<void> {
		await this.getPersistenceFacade().persistGlobalSystemPromptsEnabled(enabled);
	}

	async persistMcpSettings(mcpSettings: McpSettings): Promise<void> {
		await this.getPersistenceFacade().persistMcpSettings(mcpSettings);
	}

	async rewriteSessionMessages(session: ChatSession) {
		await this.getPersistenceFacade().rewriteSessionMessages(session);
	}

	async executeSkillCommand(skillName: string): Promise<void> {
		await this.getCommandFacade().executeSkillCommand(skillName);
	}

	async executeSubAgentCommand(agentName: string, task?: string): Promise<void> {
		await this.getCommandFacade().executeSubAgentCommand(agentName, task);
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
		await this.getMessageMutationFacade().editMessage(messageId, content);
	}

	async editAndRegenerate(messageId: string, content: string) {
		await this.getMessageMutationFacade().editAndRegenerate(messageId, content);
	}

	async deleteMessage(messageId: string) {
		await this.getMessageMutationFacade().deleteMessage(messageId);
	}

	async togglePinnedMessage(messageId: string) {
		await this.getMessageMutationFacade().togglePinnedMessage(messageId);
	}

	insertMessageToEditor(messageId: string) {
		this.getMessageMutationFacade().insertMessageToEditor(messageId);
	}

	async regenerateFromMessage(messageId: string) {
		await this.getMessageMutationFacade().regenerateFromMessage(messageId);
	}

	async refreshProviderSettings(aiRuntimeSettings: AiRuntimeSettings) {
		this.getMessageMutationFacade().refreshProviderSettings(aiRuntimeSettings);
	}

	dispose() {
		this.stateStore.dispose();
		this.multiModelService?.stopAllGeneration();
		this.controller?.abort();
		this.controller = null;
		this.planSyncService.dispose();
		this.toolRuntimeResolver.dispose();
		this.subAgentWatcherService.stop();
		this.subAgentScannerService.clearCache();
	}

	protected emitState(): void {
		this.stateStore.emit();
	}

	// Methods continue in ChatService.ts
}
