/**
 * ChatFeatureManager - 聊天功能管理器（装配层）
 * 负责协调各个子服务和组件的创建与生命周期管理
 * 已拆分为：ChatViewCoordinator（视图管理）、ChatEditorIntegration（编辑器扩展）
 */
import { ChatService } from 'src/core/chat/services/chat-service';
import { MultiModelChatService } from 'src/core/chat/services/multi-model-chat-service';
import type {
	ChatConsumerHost,
	ChatServiceDeps,
} from 'src/core/chat/services/chat-service-types';
import { ChatViewCoordinator } from 'src/domains/chat/ui-view-coordinator';
import type { ChatViewFactory } from 'src/domains/chat/types-view-coordinator';
import type { ChatSettings } from 'src/domains/chat/types';
import type { AiRuntimeSettings } from 'src/domains/settings/types-ai-runtime';
import { buildChatViewFactory } from 'src/core/chat/chat-view-factory-builder';
import { ChatEditorIntegration } from 'src/editor/chat/ChatEditorIntegration';

export class ChatFeatureManager {
	private readonly service: ChatService;
	private multiModelChatService: MultiModelChatService | null = null;
	private readonly viewCoordinator: ChatViewCoordinator;
	private readonly editorIntegration: ChatEditorIntegration;

	constructor(
		private readonly host: ChatConsumerHost,
		serviceDeps: ChatServiceDeps,
		existingService?: ChatService,
		existingViewCoordinator?: ChatViewCoordinator,
	) {
		this.service = existingService ?? new ChatService(serviceDeps);
		this.viewCoordinator = existingViewCoordinator
			?? new ChatViewCoordinator(host, this.service, this.createViewFactory());
		this.editorIntegration = new ChatEditorIntegration(host, this.service);
	}

	async initialize(initialSettings?: Partial<ChatSettings>): Promise<void> {
		// 1. 初始化核心服务
		this.service.initialize(initialSettings);

		// 2. 初始化多模型服务
		this.multiModelChatService = new MultiModelChatService(this.service);
		this.service.setMultiModelService(this.multiModelChatService);

		// 3. 初始化视图协调器
		this.viewCoordinator.initialize();

		// 4. 初始化编辑器集成
		await this.editorIntegration.initialize();
	}

	updateChatSettings(settings: Partial<ChatSettings>): void {
		this.service.updateSettings(settings);

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

	private createViewFactory(): ChatViewFactory {
		return buildChatViewFactory(this.host, this.service);
	}

	dispose(): void {
		this.multiModelChatService?.stopAllGeneration();
		this.multiModelChatService = null;
		this.service.setMultiModelService(null);

		this.viewCoordinator.dispose();
		this.editorIntegration.dispose();
		this.service.dispose();
	}
}
