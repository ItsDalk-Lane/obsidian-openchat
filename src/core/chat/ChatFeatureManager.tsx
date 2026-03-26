/**
 * ChatFeatureManager - 聊天功能管理器（装配层）
 * 负责协调各个子服务和组件的创建与生命周期管理
 * 已拆分为：ChatViewCoordinator（视图管理）、ChatEditorIntegration（编辑器扩展）
 */
import OpenChatPlugin from 'src/main';
import { ChatService } from 'src/core/chat/services/ChatService';
import { MultiModelConfigService } from 'src/core/chat/services/MultiModelConfigService';
import { MultiModelChatService } from 'src/core/chat/services/MultiModelChatService';
import { ChatViewCoordinator } from 'src/commands/chat';
import { ChatEditorIntegration } from 'src/editor/chat';
import type { ChatSettings } from 'src/types/chat';
import type { AiRuntimeSettings } from 'src/settings/ai-runtime';
import type { ChatRuntimeDeps } from 'src/core/chat/runtime/ChatRuntimeDeps';

export class ChatFeatureManager {
	private readonly service: ChatService;
	private multiModelConfigService: MultiModelConfigService | null = null;
	private multiModelChatService: MultiModelChatService | null = null;
	private readonly viewCoordinator: ChatViewCoordinator;
	private readonly editorIntegration: ChatEditorIntegration;

	constructor(
		private readonly plugin: OpenChatPlugin,
		runtimeDeps: ChatRuntimeDeps,
		existingService?: ChatService,
		existingViewCoordinator?: ChatViewCoordinator,
	) {
		this.service = existingService ?? new ChatService(plugin, runtimeDeps);
		this.viewCoordinator = existingViewCoordinator ?? new ChatViewCoordinator(plugin, this.service);
		this.editorIntegration = new ChatEditorIntegration(plugin, this.service);
	}

	async initialize(initialSettings?: Partial<ChatSettings>): Promise<void> {
		// 1. 初始化核心服务
		this.service.initialize(initialSettings);

		// 2. 初始化多模型服务
		this.multiModelConfigService = new MultiModelConfigService(this.plugin.app, this.plugin.settings.aiDataFolder);
		await this.multiModelConfigService.initialize();
		this.multiModelChatService = new MultiModelChatService(this.service, this.multiModelConfigService);
		this.service.setMultiModelConfigService(this.multiModelConfigService);
		this.service.setMultiModelService(this.multiModelChatService);

		// 3. 初始化视图协调器
		this.viewCoordinator.initialize();

		// 4. 初始化编辑器集成
		await this.editorIntegration.initialize();
	}

	updateChatSettings(settings: Partial<ChatSettings>): void {
		this.service.updateSettings(settings);

		// 转发到视图协调器
		if ('showRibbonIcon' in settings) {
			this.viewCoordinator.updateRibbonIcon(settings.showRibbonIcon ?? false);
		}

		// 转发到编辑器集成
		this.editorIntegration.updateSettings(settings);
	}

	updateProviderSettings(settings: AiRuntimeSettings): void {
		void this.service.refreshProviderSettings(settings);
	}

	getService(): ChatService {
		return this.service;
	}

	async refreshQuickActionsCache(): Promise<void> {
		await this.editorIntegration.refreshQuickActionsCache();
	}

	async activateChatView(mode: Parameters<ChatViewCoordinator['activateChatView']>[0]): Promise<void> {
		await this.viewCoordinator.activateChatView(mode);
	}

	openChatInModal(activeFile?: Parameters<ChatViewCoordinator['openChatInModal']>[0]): void {
		this.viewCoordinator.openChatInModal(activeFile);
	}

	openChatInPersistentModal(activeFile?: Parameters<ChatViewCoordinator['openChatInPersistentModal']>[0]): void {
		this.viewCoordinator.openChatInPersistentModal(activeFile);
	}

	dispose(): void {
		this.multiModelChatService?.stopAllGeneration();
		this.multiModelChatService = null;
		this.multiModelConfigService?.dispose();
		this.multiModelConfigService = null;
		this.service.setMultiModelService(null);
		this.service.setMultiModelConfigService(null);

		this.viewCoordinator.dispose();
		this.editorIntegration.dispose();
		this.service.dispose();
	}
}
