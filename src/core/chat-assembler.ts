/**
 * @module core/chat-assembler
 * @description Chat 功能域的装配器。
 *   负责构建 ChatConsumerHost、ChatRuntimeDeps、ChatServiceDeps，
 *   以及管理早期视图注册与 ChatFeatureManager 的完整生命周期。
 *
 * @dependencies obsidian, src/core/chat/*, src/domains/chat/*, src/providers/*
 * @side-effects 注册 Obsidian 视图类型、创建 chat 服务实例
 * @invariants 不直接持有 Plugin 实例，只接收最小宿主接口。
 */

import type { App, Command, WorkspaceLeaf } from 'obsidian';
import { MarkdownView } from 'obsidian';
import type { Extension } from '@codemirror/state';
import type { ChatRuntimeDeps } from 'src/core/chat/runtime/chat-runtime-deps';
import type { ChatConsumerHost } from 'src/core/chat/services/chat-service-types';
import type { ChatViewFactory } from 'src/domains/chat/types-view-coordinator';
import type { PluginSettings } from 'src/domains/settings/types';
import type { ObsidianApiProvider } from 'src/providers/providers.types';
import { ChatService } from 'src/core/chat/services/chat-service';
import { createChatServiceDeps } from 'src/core/chat/services/create-chat-service-deps';
import { ChatViewCoordinator } from 'src/domains/chat/ui-view-coordinator';
import { ChatFeatureManager } from 'src/core/chat/chat-feature-manager';
import { buildChatViewFactory } from 'src/core/chat/chat-view-factory-builder';

/**
 * ChatAssembler 对宿主 Plugin 的最小依赖接口。
 */
export interface ChatAssemblerHost {
	readonly app: App;
	settings: PluginSettings;
	readonly manifest: { readonly id: string };
	saveSettings(): Promise<void>;
	registerView(type: string, viewCreator: (leaf: WorkspaceLeaf) => unknown): void;
	addCommand(command: Command): void;
	addRibbonIcon(icon: string, title: string, callback: (evt: MouseEvent) => unknown): HTMLElement;
	registerEditorExtension(extension: Extension | readonly Extension[]): void;
}

/**
 * ChatAssembler 需要的运行时依赖提供器。
 * 由 FeatureCoordinator 注入（skills / mcp / tool 查询能力）。
 */
export interface ChatRuntimeDepsProvider {
	createChatRuntimeDeps(): ChatRuntimeDeps;
}

export class ChatAssembler {
	private chatFeatureManager: ChatFeatureManager | null = null;
	private earlyChatService: ChatService | null = null;
	private earlyChatViewCoordinator: ChatViewCoordinator | null = null;
	private readonly chatConsumerHost: ChatConsumerHost;
	private chatServiceDeps: ReturnType<typeof createChatServiceDeps> | null = null;

	constructor(
		private readonly host: ChatAssemblerHost,
		private readonly obsidianApiProvider: ObsidianApiProvider,
		private readonly runtimeDepsProvider: ChatRuntimeDepsProvider,
	) {
		this.chatConsumerHost = this.buildChatConsumerHost();
		this.chatServiceDeps = createChatServiceDeps(
			this.chatConsumerHost,
			this.runtimeDepsProvider.createChatRuntimeDeps(),
			this.obsidianApiProvider,
		);
	}

	/**
	 * 在 onLayoutReady 之前同步注册聊天视图类型。
	 * 确保 Obsidian 恢复工作区时能立即识别视图类型，消除标题栏占位图标。
	 * 必须在 onload() 中任何 await 之前调用。
	 */
	registerChatViewTypesEarly(): void {
		if (this.earlyChatService) return;
		this.earlyChatService = new ChatService(this.getChatServiceDeps());
		this.earlyChatViewCoordinator = new ChatViewCoordinator(
			this.chatConsumerHost,
			this.earlyChatService,
			this.createChatViewFactory(this.earlyChatService),
		);
		this.earlyChatViewCoordinator.registerViewTypesOnly();
		// 提前初始化 Service（使用默认设置），确保 Obsidian 恢复视图时 activeSession 不为 null，
		// 避免在真实设置加载完成前显示「暂无聊天会话」的空白状态。
		// initialize() 具有幂等保护，后续 initializeChat() 中的再次调用只会更新设置并重新发射状态。
		this.earlyChatService.initialize();
	}

	async initializeChat(settings: PluginSettings): Promise<void> {
		if (!this.chatFeatureManager) {
			this.chatFeatureManager = new ChatFeatureManager(
				this.chatConsumerHost,
				this.getChatServiceDeps(),
				this.earlyChatService ?? undefined,
				this.earlyChatViewCoordinator ?? undefined,
			);
			// ChatFeatureManager 已接管这两个实例的所有权，清除早期引用避免重复 dispose
			this.earlyChatService = null;
			this.earlyChatViewCoordinator = null;
			await this.chatFeatureManager.initialize(settings.chat);
		} else {
			this.chatFeatureManager.updateChatSettings(settings.chat);
		}
		this.chatFeatureManager?.updateProviderSettings(settings.aiRuntime);
	}

	getChatFeatureManager(): ChatFeatureManager | null {
		return this.chatFeatureManager;
	}

	async refreshQuickActionsCache(): Promise<void> {
		if (this.chatFeatureManager) {
			await this.chatFeatureManager.refreshQuickActionsCache();
		}
	}

	dispose(): void {
		this.chatFeatureManager?.dispose();
		this.chatFeatureManager = null;
		// 若 initializeChat 从未执行成功，需清理提前创建的实例
		this.earlyChatViewCoordinator?.dispose();
		this.earlyChatViewCoordinator = null;
		this.earlyChatService?.dispose();
		this.earlyChatService = null;
	}

	private getChatServiceDeps(): ReturnType<typeof createChatServiceDeps> {
		if (!this.chatServiceDeps) {
			this.chatServiceDeps = createChatServiceDeps(
				this.chatConsumerHost,
				this.runtimeDepsProvider.createChatRuntimeDeps(),
				this.obsidianApiProvider,
			);
		}
		return this.chatServiceDeps;
	}

	private createChatViewFactory(service: ChatService): ChatViewFactory {
		return buildChatViewFactory(this.chatConsumerHost, service);
	}

	private buildChatConsumerHost(): ChatConsumerHost {
		const plugin = this.host;
		const obsidianApi = this.obsidianApiProvider;
		return {
			app: plugin.app,
			notify: (message, timeout) => {
				obsidianApi.notify(message, timeout);
			},
			getManifestId: () => plugin.manifest.id,
			getAiDataFolder: () => plugin.settings.aiDataFolder,
			getPluginSettings: () => plugin.settings,
			getChatSettings: () => plugin.settings.chat,
			setChatSettings: (nextSettings) => {
				plugin.settings.chat = nextSettings;
			},
			getAiRuntimeSettings: () => plugin.settings.aiRuntime,
			setAiRuntimeSettings: (nextSettings) => {
				plugin.settings.aiRuntime = nextSettings;
			},
			saveSettings: async () => await plugin.saveSettings(),
			openSettingsTab: () => {
				const settingApp = plugin.app as typeof plugin.app & {
					setting?: { open: () => void; openTabById: (id: string) => boolean };
				};
				settingApp.setting?.open();
				settingApp.setting?.openTabById(plugin.manifest.id);
			},
			registerView: (viewType, viewCreator) => {
				plugin.registerView(viewType, viewCreator);
			},
			addCommand: (command) => {
				plugin.addCommand(command);
			},
			addRibbonIcon: (icon, title, callback) =>
				plugin.addRibbonIcon(icon, title, callback),
			getActiveMarkdownFile: () => plugin.app.workspace.getActiveFile(),
			getActiveMarkdownView: () =>
				plugin.app.workspace.getActiveViewOfType(MarkdownView),
			getOpenMarkdownFiles: () => {
				const files: NonNullable<ReturnType<ChatConsumerHost['getOpenMarkdownFiles']>> = [];
				plugin.app.workspace.iterateAllLeaves((leaf) => {
					if (leaf.view instanceof MarkdownView && leaf.view.file) {
						files.push(leaf.view.file);
					}
				});
				return files;
			},
			findLeafByViewType: (viewType) => {
				let existingLeaf: ReturnType<ChatConsumerHost['findLeafByViewType']> = null;
				plugin.app.workspace.iterateAllLeaves((leaf) => {
					if (leaf.view.getViewType() === viewType) {
						existingLeaf = leaf;
						return true;
					}
					return false;
				});
				return existingLeaf;
			},
			revealLeaf: (leaf) => {
				plugin.app.workspace.revealLeaf(leaf);
			},
			getLeaf: (target) => {
				return plugin.app.workspace.getLeaf(target === 'window' ? 'window' : true);
			},
			getSidebarLeaf: (side) => {
				return side === 'right'
					? plugin.app.workspace.getRightLeaf(false)
					: plugin.app.workspace.getLeftLeaf(false);
			},
			setLeafViewState: async (leaf, viewType, active) => {
				await leaf.setViewState({ type: viewType, active });
			},
			isWorkspaceReady: () => {
				return plugin.app.workspace.layoutReady && Boolean(plugin.app.workspace.rightSplit);
			},
			detachLeavesOfType: (viewType) => {
				plugin.app.workspace.detachLeavesOfType(viewType);
			},
			registerEditorExtension: (extension) => {
				plugin.registerEditorExtension(extension);
			},
			updateWorkspaceOptions: () => {
				plugin.app.workspace.updateOptions();
			},
			onWorkspaceLayoutChange: (listener) => {
				const ref = plugin.app.workspace.on('layout-change', listener);
				return () => plugin.app.workspace.offref(ref);
			},
			onActiveMarkdownFileChange: (listener) => {
				const ref = plugin.app.workspace.on('active-leaf-change', () => {
					listener(plugin.app.workspace.getActiveFile());
				});
				return () => plugin.app.workspace.offref(ref);
			},
			onMarkdownFileOpen: (listener) => {
				const ref = plugin.app.workspace.on('file-open', (file) => {
					listener(file);
				});
				return () => plugin.app.workspace.offref(ref);
			},
		};
	}
}
