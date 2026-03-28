import { Notice } from 'obsidian';
import type { McpRuntimeManager } from 'src/domains/mcp/types';
import type { AiRuntimeSettings } from 'src/settings/ai-runtime';
import type { ProviderSettings } from 'src/types/provider';
import type { ToolDefinition, ToolExecutionRecord } from 'src/types/tool';
import type { McpSettings } from 'src/types/mcp';
import type {
	ChatMessage,
	ChatSession,
	ChatSettings,
} from '../types/chat';
import type { LayoutMode, MultiModelMode } from '../types/multiModel';
import type { SkillScanResult } from 'src/domains/skills/types';
import type { SubAgentScanResult } from 'src/tools/sub-agents';
import { ChatServiceOps } from './ChatServiceOps';
import {
	createChatGenerationFacade,
	type ChatGenerationFacade,
} from './chatGenerationFacade';
import {
	createChatMessageMutationFacade,
	createChatMessageOperationFacade,
	type ChatMessageMutationFacade,
	type ChatMessageOperationFacade,
} from './chatMessageFacade';
import {
	executeSkillCommand as executeSkillCommandHelper,
	executeSubAgentCommand as executeSubAgentCommandHelper,
} from './chatCommands';
import {
	type ChatGenerationDeps,
	generateAssistantResponse as generateAssistantResponseHelper,
	generateAssistantResponseForModel as generateAssistantResponseForModelHelper,
} from './chatGeneration';
import { detectImageGenerationIntent } from './chatImageIntent';
import {
	type ChatProviderMessageDeps,
	buildProviderMessages as buildProviderMessagesHelper,
	buildProviderMessagesForAgent as buildProviderMessagesForAgentHelper,
	buildProviderMessagesWithOptions as buildProviderMessagesWithOptionsHelper,
	getChatDefaultFileContentOptions as getChatDefaultFileContentOptionsHelper,
	getChatMessageManagementSettings as getChatMessageManagementSettingsHelper,
	resolveChatContextBudget as resolveChatContextBudgetHelper,
} from './chatProviderMessages';
import {
	type ChatMessageOperationDeps,
	prepareChatRequest as prepareChatRequestHelper,
	sendMessage as sendMessageHelper,
} from './chatMessageOperations';
import {
	type ChatMessageMutationDeps,
	deleteMessage as deleteMessageHelper,
	editAndRegenerate as editAndRegenerateHelper,
	editMessage as editMessageHelper,
	insertMessageToEditor as insertMessageToEditorHelper,
	refreshProviderSettings as refreshProviderSettingsHelper,
	regenerateFromMessage as regenerateFromMessageHelper,
	togglePinnedMessage as togglePinnedMessageHelper,
} from './chatMessageMutations';
import {
	createChatProviderMessageFacade,
	type ChatProviderMessageFacade,
} from './chatProviderMessageFacade';
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
	private generationFacade: ChatGenerationFacade | null = null;
	private messageOperationFacade: ChatMessageOperationFacade | null = null;
	private messageMutationFacade: ChatMessageMutationFacade | null = null;
	private providerMessageFacade: ChatProviderMessageFacade | null = null;

	private getGenerationDeps(): ChatGenerationDeps {
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

	protected getGenerationFacade(): ChatGenerationFacade {
		if (!this.generationFacade) {
			this.generationFacade = createChatGenerationFacade(
				() => this.getGenerationDeps(),
				{
					generateAssistantResponse: generateAssistantResponseHelper,
					generateAssistantResponseForModel: generateAssistantResponseForModelHelper,
				}
			);
		}

		return this.generationFacade;
	}

	protected getMessageOperationFacade(): ChatMessageOperationFacade {
		if (!this.messageOperationFacade) {
			this.messageOperationFacade = createChatMessageOperationFacade(
				() => this.getMessageOperationDeps(),
				{
					prepareChatRequest: prepareChatRequestHelper,
					sendMessage: sendMessageHelper,
				}
			);
		}

		return this.messageOperationFacade;
	}

	protected getMessageMutationFacade(): ChatMessageMutationFacade {
		if (!this.messageMutationFacade) {
			this.messageMutationFacade = createChatMessageMutationFacade(
				() => this.getMessageMutationDeps(),
				{
					editMessage: editMessageHelper,
					editAndRegenerate: editAndRegenerateHelper,
					deleteMessage: deleteMessageHelper,
					togglePinnedMessage: togglePinnedMessageHelper,
					insertMessageToEditor: insertMessageToEditorHelper,
					regenerateFromMessage: regenerateFromMessageHelper,
					refreshProviderSettings: refreshProviderSettingsHelper,
				}
			);
		}

		return this.messageMutationFacade;
	}

	protected getProviderMessageFacade(): ChatProviderMessageFacade {
		if (!this.providerMessageFacade) {
			this.providerMessageFacade = createChatProviderMessageFacade(
				() => this.getProviderMessageDeps(),
				{
					buildProviderMessages: buildProviderMessagesHelper,
					buildProviderMessagesWithOptions: buildProviderMessagesWithOptionsHelper,
					buildProviderMessagesForAgent: buildProviderMessagesForAgentHelper,
					getMessageManagementSettings: getChatMessageManagementSettingsHelper,
					getDefaultFileContentOptions: getChatDefaultFileContentOptionsHelper,
					resolveContextBudget: resolveChatContextBudgetHelper,
				}
			);
		}

		return this.providerMessageFacade;
	}

	private getMessageOperationDeps(): ChatMessageOperationDeps {
		return {
			app: this.app,
			state: this.state,
			imageResolver: this.imageResolver,
			attachmentSelectionService: this.attachmentSelectionService,
			messageService: this.messageService,
			sessionManager: this.sessionManager,
			multiModelService: this.multiModelService,
			emitState: () => this.emitState(),
			createNewSession: () => this.createNewSession(),
			syncSessionMultiModelState: (session?: ChatSession) =>
				this.syncSessionMultiModelState(session),
			consumePendingTriggerSource: () => this.consumePendingTriggerSource(),
			resolveProvider: () => this.resolveProvider(),
			detectImageGenerationIntent: (content: string) =>
				this.detectImageGenerationIntent(content),
			isCurrentModelSupportImageGeneration: () =>
				this.isCurrentModelSupportImageGeneration(),
			ensurePlanSyncReady: () => this.ensurePlanSyncReady(),
			generateAssistantResponse: async (session: ChatSession) => {
				await this.generateAssistantResponse(session);
			},
		};
	}

	private getMessageMutationDeps(): ChatMessageMutationDeps {
		return {
			app: this.app,
			state: this.state,
			sessionManager: this.sessionManager,
			multiModelService: this.multiModelService,
			emitState: () => this.emitState(),
			invalidateSessionContextCompaction: (session: ChatSession) =>
				this.invalidateSessionContextCompaction(session),
			queueSessionPlanSync: (session: ChatSession | null) =>
				this.queueSessionPlanSync(session),
			generateAssistantResponse: async (session: ChatSession) => {
				await this.generateAssistantResponse(session);
			},
			detectImageGenerationIntent: (content: string) =>
				this.detectImageGenerationIntent(content),
			isCurrentModelSupportImageGeneration: () =>
				this.isCurrentModelSupportImageGeneration(),
		};
	}

	private getProviderMessageDeps(): ChatProviderMessageDeps {
		return {
			app: this.app,
			state: this.state,
			settings: this.settings,
			pluginChatSettings: this.plugin.settings.chat,
			messageService: this.messageService,
			messageContextOptimizer: this.messageContextOptimizer,
			contextCompactionService: this.contextCompactionService,
			getDefaultProviderTag: () => this.getDefaultProviderTag(),
			resolveProviderByTag: (tag?: string) => this.resolveProviderByTag(tag),
			findProviderByTagExact: (tag?: string) => this.findProviderByTagExact(tag),
			resolveSkillsSystemPromptBlock: (requestTools: ToolDefinition[]) =>
				this.resolveSkillsSystemPromptBlock(requestTools),
			persistSessionContextCompactionFrontmatter: (session: ChatSession) =>
				this.persistSessionContextCompactionFrontmatter(session),
		};
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

	getMcpClientManager(): McpRuntimeManager | null {
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
		// 打开 Obsidian 插件设置界面（替代原来的独立 Modal）
		const settingApp = (this.plugin.app as unknown as {
			setting: { open: () => void; openTabById: (id: string) => boolean }
		}).setting
		settingApp.open()
		settingApp.openTabById(this.plugin.manifest.id)
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

