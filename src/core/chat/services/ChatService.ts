import { Notice } from 'obsidian';
import type { AiRuntimeSettings } from 'src/settings/ai-runtime';
import type { Message as ProviderMessage, ProviderSettings } from 'src/types/provider';
import type { ToolDefinition, ToolExecutionRecord } from 'src/types/tool';
import type { McpClientManager, McpSettings } from 'src/services/mcp';
import type {
	ChatMessage,
	ChatSession,
	ChatSettings,
	MessageManagementSettings,
} from '../types/chat';
import type { LayoutMode, MultiModelMode } from '../types/multiModel';
import type { ResolvedContextBudget } from 'src/core/chat/utils/contextBudget';
import type { SkillScanResult } from 'src/services/skills';
import type { SubAgentScanResult } from 'src/tools/sub-agents';
import type { FileContentOptions } from './FileContentService';
import {
	type GenerateAssistantOptions,
} from './ChatServiceCore';
import { ChatServiceOps } from './ChatServiceOps';
import { ChatSettingsModal } from 'src/components/chat-components/ChatSettingsModal';
import {
	executeSkillCommand as executeSkillCommandHelper,
	executeSubAgentCommand as executeSubAgentCommandHelper,
} from './chatCommands';
import {
	generateAssistantResponse as generateAssistantResponseHelper,
	generateAssistantResponseForModel as generateAssistantResponseForModelHelper,
} from './chatGeneration';
import { detectImageGenerationIntent } from './chatImageIntent';
import {
	buildProviderMessages,
	buildProviderMessagesForAgent,
	buildProviderMessagesWithOptions,
	getChatDefaultFileContentOptions,
	getChatMessageManagementSettings,
	resolveChatContextBudget,
} from './chatProviderMessages';
import {
	findProviderByTagExact as findProviderByTagExactHelper,
	getDefaultProviderTag as getDefaultProviderTagHelper,
	getModelDisplayName as getModelDisplayNameHelper,
	getOllamaCapabilities as getOllamaCapabilitiesHelper,
	getOllamaCapabilitiesForModel as getOllamaCapabilitiesForModelHelper,
	isCurrentModelSupportImageGeneration as isCurrentModelSupportImageGenerationHelper,
	normalizeOllamaBaseUrl as normalizeOllamaBaseUrlHelper,
	providerSupportsImageGeneration as providerSupportsImageGenerationHelper,
	resolveProvider as resolveProviderHelper,
	resolveProviderByTag as resolveProviderByTagHelper,
	rethrowImageGenerationError as rethrowImageGenerationErrorHelper,
} from './chatProviderHelpers';
import {
	cloneValue as cloneValueHelper,
	persistActiveSessionMultiModelFrontmatter as persistActiveSessionMultiModelFrontmatterHelper,
	persistChatSettings as persistChatSettingsHelper,
	persistGlobalSystemPromptsEnabled as persistGlobalSystemPromptsEnabledHelper,
	persistLayoutMode as persistLayoutModeHelper,
	persistMcpSettings as persistMcpSettingsHelper,
	persistSessionMultiModelFrontmatter as persistSessionMultiModelFrontmatterHelper,
	readPersistedLayoutMode as readPersistedLayoutModeHelper,
	restoreMultiModelStateFromSession as restoreMultiModelStateFromSessionHelper,
	rewriteSessionMessages as rewriteSessionMessagesHelper,
	syncSessionMultiModelState as syncSessionMultiModelStateHelper,
} from './chatSettingsPersistence';

export class ChatService extends ChatServiceOps {

	protected getGenerationDeps() {
		return {
			app: this.app,
			state: this.state,
			messageService: this.messageService,
			imageResolver: this.imageResolver,
			sessionManager: this.sessionManager,
			ollamaCapabilityCache: this.ollamaCapabilityCache,
			getDefaultProviderTag: () => this.getDefaultProviderTag(),
			findProviderByTagExact: (tag?: string) => this.findProviderByTagExact(tag),
			getModelDisplayName: (provider: ProviderSettings) => this.getModelDisplayName(provider),
			createSubAgentStateUpdater: (
				assistantMessage: ChatMessage,
				session: ChatSession,
				shouldAttachToSession: boolean
			) => this.createSubAgentStateUpdater(assistantMessage, session, shouldAttachToSession),
			resolveToolRuntime: (options?: Parameters<ChatService['resolveToolRuntime']>[0]) =>
				this.resolveToolRuntime(options),
			buildProviderMessagesWithOptions: (
				session: ChatSession,
				options?: Parameters<ChatService['buildProviderMessagesWithOptions']>[1]
			) => this.buildProviderMessagesWithOptions(session, options),
			normalizeToolExecutionRecord: (record: ToolExecutionRecord) =>
				this.normalizeToolExecutionRecord(record),
			showMcpNoticeOnce: (message: string) => this.showMcpNoticeOnce(message),
			getOllamaCapabilities: (baseURL: string, model: string) =>
				this.getOllamaCapabilities(baseURL, model),
			normalizeOllamaBaseUrl: (baseURL?: string) => this.normalizeOllamaBaseUrl(baseURL),
			providerSupportsImageGeneration: (provider: ProviderSettings) =>
				this.providerSupportsImageGeneration(provider),
			rethrowImageGenerationError: (error: unknown): never =>
				this.rethrowImageGenerationError(error),
			saveActiveSession: () => this.saveActiveSession(),
			emitState: () => this.emitState(),
			getController: () => this.controller,
			setController: (controller: AbortController | null) => {
				this.controller = controller;
			},
		};
	}

	protected getChatPersistenceDeps() {
		return {
			plugin: this.plugin,
			runtimeDeps: this.runtimeDeps,
			state: this.state,
			sessionManager: this.sessionManager,
			toolRuntimeResolver: this.toolRuntimeResolver,
			getDefaultProviderTag: () => this.getDefaultProviderTag(),
			updateSettings: (settings: Partial<ChatSettings>) => this.updateSettings(settings),
			bindLivePlanStateSync: () => this.bindLivePlanStateSync(),
			queueSessionPlanSync: (session: ChatSession | null) =>
				this.queueSessionPlanSync(session),
			persistSessionContextCompactionFrontmatter: (session: ChatSession) =>
				this.persistSessionContextCompactionFrontmatter(session),
			saveActiveSession: () => this.saveActiveSession(),
			layoutModeStorageKey: ChatService.LAYOUT_MODE_STORAGE_KEY,
		};
	}

	protected invalidateSessionContextCompaction(session: ChatSession): void {
		if (!session.contextCompaction && !session.requestTokenState) {
			return;
		}
		session.contextCompaction = null;
		session.requestTokenState = null;
		void this.persistSessionContextCompactionFrontmatter(session);
	}

	protected getDefaultProviderTag(): string | null {
		return getDefaultProviderTagHelper(this.plugin.settings.aiRuntime.providers);
	}

	/**
	 * 检测用户输入是否包含图片生成意图
	 * @param content 用户输入内容
	 * @returns 是否包含图片生成意图
	 */
	detectImageGenerationIntent(content: string): boolean {
		return detectImageGenerationIntent(content);
	}

	/**
	 * 检查当前选择的模型是否支持图像生成
	 * @returns 是否支持图像生成
	 */
	protected isCurrentModelSupportImageGeneration(): boolean {
		return isCurrentModelSupportImageGenerationHelper({
			providers: this.plugin.settings.aiRuntime.providers,
			selectedModelId: this.state.selectedModelId,
		});
	}

	isProviderSupportImageGenerationByTag(modelTag: string): boolean {
		const provider = this.findProviderByTagExact(modelTag);
		return provider ? this.providerSupportsImageGeneration(provider) : false;
	}

	protected normalizeOllamaBaseUrl(baseURL?: string) {
		return normalizeOllamaBaseUrlHelper(baseURL);
	}

	protected async getOllamaCapabilities(baseURL: string, model: string) {
		return await getOllamaCapabilitiesHelper({
			cache: this.ollamaCapabilityCache,
			baseURL,
			model,
		});
	}

	async getOllamaCapabilitiesForModel(modelTag: string): Promise<{
		supported: boolean;
		shouldWarn: boolean;
		modelName: string;
	} | null> {
		return await getOllamaCapabilitiesForModelHelper({
			cache: this.ollamaCapabilityCache,
			providers: this.plugin.settings.aiRuntime.providers,
			modelTag,
			enableReasoningToggle: this.state.enableReasoningToggle,
		});
	}

	protected async generateAssistantResponse(session: ChatSession) {
		await generateAssistantResponseHelper(this.getGenerationDeps(), session);
	}

	async generateAssistantResponseForModel(
		session: ChatSession,
		modelTag: string,
		options?: GenerateAssistantOptions
	): Promise<ChatMessage> {
		return await generateAssistantResponseForModelHelper(
			this.getGenerationDeps(),
			session,
			modelTag,
			options
		);
	}

	protected showMcpNoticeOnce(message: string): void {
		const now = Date.now()
		if (now - this.lastMcpNoticeAt < 10000) return
		this.lastMcpNoticeAt = now
		new Notice(message, 5000)
	}

	protected providerSupportsImageGeneration(provider: ProviderSettings): boolean {
		return providerSupportsImageGenerationHelper(provider);
	}

	protected rethrowImageGenerationError(error: unknown): never {
		return rethrowImageGenerationErrorHelper(error);
	}

	protected resolveProvider(): ProviderSettings | null {
		return resolveProviderHelper(
			this.plugin.settings.aiRuntime.providers,
			this.state.selectedModelId
		);
	}

	resolveProviderByTag(tag?: string): ProviderSettings | null {
		return resolveProviderByTagHelper(
			this.plugin.settings.aiRuntime.providers,
			tag
		);
	}

	findProviderByTagExact(tag?: string): ProviderSettings | null {
		return findProviderByTagExactHelper(
			this.plugin.settings.aiRuntime.providers,
			tag
		);
	}

	protected getModelDisplayName(provider: ProviderSettings): string {
		return getModelDisplayNameHelper(provider);
	}

	/**
	 * 构建发送给 Provider 的消息列表
	 * @param session 当前会话
	 */
	async buildProviderMessages(session: ChatSession): Promise<ProviderMessage[]> {
		return await buildProviderMessages(
			this.getProviderMessageDeps(),
			session
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
		return await buildProviderMessagesWithOptions(
			this.getProviderMessageDeps(),
			session,
			options
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
		return await buildProviderMessagesForAgent(
			this.getProviderMessageDeps(),
			messages,
			session,
			systemPrompt,
			modelTag,
			requestTools
		);
	}

	protected getMessageManagementSettings(): MessageManagementSettings {
		return getChatMessageManagementSettings(
			this.settings,
			this.plugin.settings.chat
		);
	}

	protected getDefaultFileContentOptions(): FileContentOptions {
		return getChatDefaultFileContentOptions();
	}

	getResolvedContextBudget(modelTag?: string | null): ResolvedContextBudget {
		return resolveChatContextBudget(
			{
				resolveProviderByTag: (tag?: string) => this.resolveProviderByTag(tag),
				state: this.state,
			},
			modelTag
		);
	}

	getProviders(): ProviderSettings[] {
		return [...this.plugin.settings.aiRuntime.providers];
	}

	getChatSettingsSnapshot(): ChatSettings {
		return cloneValueHelper(this.plugin.settings.chat);
	}

	getAiRuntimeSettingsSnapshot(): AiRuntimeSettings {
		return cloneValueHelper(this.plugin.settings.aiRuntime);
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
		await persistChatSettingsHelper(this.getChatPersistenceDeps(), partial);
	}

	async persistGlobalSystemPromptsEnabled(enabled: boolean): Promise<void> {
		await persistGlobalSystemPromptsEnabledHelper(this.getChatPersistenceDeps(), enabled);
	}

	async persistMcpSettings(mcpSettings: McpSettings): Promise<void> {
		await persistMcpSettingsHelper(this.getChatPersistenceDeps(), mcpSettings);
	}

	async rewriteSessionMessages(session: ChatSession) {
		await rewriteSessionMessagesHelper(this.getChatPersistenceDeps(), session);
	}

	protected readPersistedLayoutMode(): LayoutMode | null {
		return readPersistedLayoutModeHelper(ChatService.LAYOUT_MODE_STORAGE_KEY);
	}

	protected persistLayoutMode(mode: LayoutMode): void {
		persistLayoutModeHelper(ChatService.LAYOUT_MODE_STORAGE_KEY, mode);
	}

	protected syncSessionMultiModelState(session = this.state.activeSession): void {
		syncSessionMultiModelStateHelper(this.state, session);
	}

	protected async persistActiveSessionMultiModelFrontmatter(): Promise<void> {
		await persistActiveSessionMultiModelFrontmatterHelper(this.getChatPersistenceDeps());
	}

	protected async persistSessionMultiModelFrontmatter(session: ChatSession): Promise<void> {
		await persistSessionMultiModelFrontmatterHelper(this.getChatPersistenceDeps(), session);
	}

	protected restoreMultiModelStateFromSession(session: ChatSession): {
		multiModelMode: MultiModelMode;
		activeCompareGroupId?: string;
		selectedModels: string[];
		layoutMode: LayoutMode;
	} {
		return restoreMultiModelStateFromSessionHelper(
			this.getChatPersistenceDeps(),
			session
		);
	}

	/**
	 * 执行 Skill 命令
	 * 加载 skill 内容并将其作为系统提示词发送消息
	 */
	async executeSkillCommand(skillName: string): Promise<void> {
		await executeSkillCommandHelper(
			{
				app: this.app,
				state: this.state,
				emitState: () => this.emitState(),
				loadInstalledSkills: () => this.loadInstalledSkills(),
				sendMessage: (content) => this.sendMessage(content)
			},
			skillName
		);
	}

	/**
	 * 执行 Sub-Agent 命令
	 * 创建一个调用 Sub-Agent 的工具调用
	 */
	async executeSubAgentCommand(agentName: string, task?: string): Promise<void> {
		await executeSubAgentCommandHelper(
			{
				state: this.state,
				providers: this.plugin.settings.aiRuntime.providers,
				loadInstalledSubAgents: () => this.loadInstalledSubAgents(),
				prepareChatRequest: (content, options) => this.prepareChatRequest(content, options),
				ensurePlanSyncReady: () => this.ensurePlanSyncReady(),
				resolveProvider: () => this.resolveProvider(),
				getDefaultProviderTag: () => this.getDefaultProviderTag(),
				generateAssistantResponseForModel: (session, modelTag, options) =>
					this.generateAssistantResponseForModel(session, modelTag, options),
				emitState: () => this.emitState()
			},
			agentName,
			task
		);
	}
}

