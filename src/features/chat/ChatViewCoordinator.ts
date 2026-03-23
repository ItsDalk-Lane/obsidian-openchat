/**
 * ChatViewCoordinator - 聊天视图协调器
 * 负责管理所有视图/模态框/窗口的创建、激活和销毁
 * 从 ChatFeatureManager 中拆分出来，遵循单一职责原则
 */
import { WorkspaceLeaf, Notice, TFile } from 'obsidian';
import OpenChatPlugin from 'src/main';
import { ChatService } from './services/ChatService';
import { ChatView, VIEW_TYPE_CHAT_SIDEBAR, VIEW_TYPE_CHAT_TAB } from './views/ChatView';
import { ChatModal } from './views/ChatModal';
import { ChatPersistentModal } from './views/ChatPersistentModal';
import type { ChatOpenMode, ChatSettings } from './types/chat';
import { localInstance } from 'src/i18n/locals';

export class ChatViewCoordinator {
	private persistentModal: ChatPersistentModal | null = null;
	private ribbonEl: HTMLElement | null = null;

	constructor(
		private readonly plugin: OpenChatPlugin,
		private readonly service: ChatService
	) {}

	/**
	 * 初始化视图协调器
	 */
	initialize(): void {
		this.registerViews();
		this.registerCommands();
		this.createRibbon();
	}

	/**
	 * 注册视图类型
	 */
	private registerViews(): void {
		this.plugin.registerView(
			VIEW_TYPE_CHAT_SIDEBAR,
			(leaf) => new ChatView(leaf, this.plugin, this.service, 'sidebar', VIEW_TYPE_CHAT_SIDEBAR)
		);
		this.plugin.registerView(
			VIEW_TYPE_CHAT_TAB,
			(leaf) => new ChatView(leaf, this.plugin, this.service, 'tab', VIEW_TYPE_CHAT_TAB)
		);
	}

	/**
	 * 注册命令
	 */
	private registerCommands(): void {
		this.plugin.addCommand({
			id: 'form-chat-open-default',
			name: '打开 AI Chat',
			callback: () => {
				const openMode = this.plugin.settings.chat.openMode;
				this.service.setNextTriggerSource('command_palette');
				this.activateChatView(openMode);
			}
		});
		this.plugin.addCommand({
			id: 'form-chat-open-sidebar',
			name: '在侧边栏打开 AI Chat',
			callback: () => {
				this.service.setNextTriggerSource('command_palette');
				void this.activateChatView('sidebar');
			}
		});
		this.plugin.addCommand({
			id: 'form-chat-open-left-sidebar',
			name: '在左侧边栏打开 AI Chat',
			callback: () => {
				this.service.setNextTriggerSource('command_palette');
				void this.activateChatView('left-sidebar');
			}
		});
		this.plugin.addCommand({
			id: 'form-chat-open-tab',
			name: '在新标签中打开 AI Chat',
			callback: () => {
				this.service.setNextTriggerSource('command_palette');
				void this.activateChatView('tab');
			}
		});
		this.plugin.addCommand({
			id: 'form-chat-open-window',
			name: '在新窗口打开 AI Chat',
			callback: () => {
				this.service.setNextTriggerSource('command_palette');
				void this.activateChatView('window');
			}
		});
		this.plugin.addCommand({
			id: 'form-chat-open-persistent-modal',
			name: '在持久化模态框中打开 AI Chat',
			callback: () => {
				this.service.setNextTriggerSource('command_palette');
				this.openChatInPersistentModal();
			}
		});
		this.plugin.addCommand({
			id: 'form-chat-new-conversation',
			name: 'AI Chat 新建聊天',
			callback: () => this.service.createNewSession()
		});
		this.plugin.addCommand({
			id: 'form-chat-save-conversation',
			name: 'AI Chat 保存当前聊天',
			callback: () => this.service.saveActiveSession()
		});
		this.plugin.addCommand({
			id: 'form-chat-open-history',
			name: 'AI Chat 打开历史记录面板',
			callback: () => {
				const openMode = this.plugin.settings.chat.openMode;
				this.activateChatView(openMode).then(() => {
					// 历史面板在视图内部通过UI控制，此处只负责唤起视图
				});
			}
		});
	}

	/**
	 * 创建功能区图标
	 */
	private createRibbon(): void {
		const shouldShowRibbon = this.plugin.settings.chat.showRibbonIcon ?? true;

		if (shouldShowRibbon) {
			this.ribbonEl = this.plugin.addRibbonIcon('message-circle', 'AI Chat', () => {
				const openMode = this.plugin.settings.chat.openMode;
				this.service.setNextTriggerSource('chat_input');
				this.activateChatView(openMode);
			});
			this.ribbonEl?.addClass('chat-ribbon-icon');
		} else {
			this.ribbonEl = null;
		}
	}

	/**
	 * 更新功能区图标显示状态
	 */
	updateRibbonIcon(show: boolean): void {
		const isCurrentlyShowing = this.ribbonEl !== null;
		if (isCurrentlyShowing === show) {
			return;
		}

		if (this.ribbonEl) {
			this.ribbonEl.remove();
			this.ribbonEl = null;
		}

		if (show) {
			this.ribbonEl = this.plugin.addRibbonIcon('message-circle', 'AI Chat', () => {
				const openMode = this.plugin.settings.chat.openMode;
				this.service.setNextTriggerSource('chat_input');
				this.activateChatView(openMode);
			});
			this.ribbonEl?.addClass('chat-ribbon-icon');
		}
	}

	/**
	 * 查找已存在的指定类型的视图
	 */
	private findExistingView(viewType: string): WorkspaceLeaf | null {
		let existingLeaf: WorkspaceLeaf | null = null;

		this.plugin.app.workspace.iterateAllLeaves((leaf) => {
			if (leaf.view.getViewType() === viewType) {
				existingLeaf = leaf;
				return true;
			}
			return false;
		});

		return existingLeaf;
	}

	/**
	 * 激活聊天视图
	 */
	async activateChatView(mode: ChatOpenMode): Promise<void> {
		try {
			if (mode === 'window') {
				const existingLeaf = this.findExistingView(VIEW_TYPE_CHAT_TAB);
				if (existingLeaf) {
					this.plugin.app.workspace.revealLeaf(existingLeaf);
				} else {
					await this.openInWindow();
				}
			} else if (mode === 'persistent-modal') {
				this.openChatInPersistentModal();
			} else if (mode === 'sidebar') {
				await this.waitForWorkspaceReady();
				const existingLeaf = this.findExistingView(VIEW_TYPE_CHAT_SIDEBAR);
				if (existingLeaf) {
					this.plugin.app.workspace.revealLeaf(existingLeaf);
				} else {
					const leaf = this.plugin.app.workspace.getRightLeaf(false);
					if (!leaf) {
						console.warn('OpenChat: 无法获取右侧边栏，可能工作区还未完全初始化');
						const leftLeaf = this.plugin.app.workspace.getLeftLeaf(false);
						if (leftLeaf) {
							await this.openLeaf(leftLeaf, VIEW_TYPE_CHAT_SIDEBAR, true);
						}
						return;
					}
					await this.openLeaf(leaf, VIEW_TYPE_CHAT_SIDEBAR, true);
				}
			} else if (mode === 'left-sidebar') {
				await this.waitForWorkspaceReady();
				const existingLeaf = this.findExistingView(VIEW_TYPE_CHAT_SIDEBAR);
				if (existingLeaf) {
					this.plugin.app.workspace.revealLeaf(existingLeaf);
				} else {
					const leaf = this.plugin.app.workspace.getLeftLeaf(false);
					if (!leaf) {
						console.warn('OpenChat: 无法获取左侧边栏，可能工作区还未完全初始化');
						const rightLeaf = this.plugin.app.workspace.getRightLeaf(false);
						if (rightLeaf) {
							await this.openLeaf(rightLeaf, VIEW_TYPE_CHAT_SIDEBAR, true);
						}
						return;
					}
					await this.openLeaf(leaf, VIEW_TYPE_CHAT_SIDEBAR, true);
				}
			} else {
				const existingLeaf = this.findExistingView(VIEW_TYPE_CHAT_TAB);
				if (existingLeaf) {
					this.plugin.app.workspace.revealLeaf(existingLeaf);
				} else {
					const leaf = this.plugin.app.workspace.getLeaf(true);
					await this.openLeaf(leaf, VIEW_TYPE_CHAT_TAB, true);
				}
			}
		} catch (error) {
			console.error('OpenChat: 激活聊天视图失败:', error);
		}
	}

	/**
	 * 在模态框中打开 AI Chat
	 */
	openChatInModal(activeFile?: TFile | null): void {
		const settings = this.plugin.settings.chat;
		const file = activeFile ?? this.plugin.app.workspace.getActiveFile();
		if (!file || file.extension !== 'md') {
			new Notice(localInstance.chat_trigger_no_active_file);
			return;
		}

		const modal = new ChatModal(
			this.plugin.app,
			this.service,
			{
				width: settings.chatModalWidth ?? 700,
				height: settings.chatModalHeight ?? 500,
				activeFile: file
			}
		);
		modal.open();
	}

	/**
	 * 在持久化模态框中打开 AI Chat
	 */
	openChatInPersistentModal(activeFile?: TFile | null): void {
		if (this.persistentModal) {
			this.persistentModal.focus();
			const file = activeFile ?? this.plugin.app.workspace.getActiveFile();
			if (file) {
				this.service.addActiveFile(file);
			}
			return;
		}

		const settings = this.plugin.settings.chat;
		const file = activeFile ?? this.plugin.app.workspace.getActiveFile();

		this.persistentModal = new ChatPersistentModal(
			this.plugin.app,
			this.service,
			{
				width: settings.chatModalWidth ?? 700,
				height: settings.chatModalHeight ?? 500,
				activeFile: file,
				onClose: () => {
					this.persistentModal = null;
				}
			}
		);
		this.persistentModal.open();
	}

	/**
	 * 等待工作区准备就绪
	 */
	private async waitForWorkspaceReady(): Promise<void> {
		const maxRetries = 10;
		const retryDelay = 100;

		for (let i = 0; i < maxRetries; i++) {
			if (
				this.plugin.app.workspace.layoutReady &&
				this.plugin.app.workspace.rightSplit
			) {
				return;
			}
			await new Promise(resolve => setTimeout(resolve, retryDelay));
		}

		console.warn('OpenChat: 工作区准备检查超时，将尝试继续执行');
	}

	/**
	 * 在新窗口中打开
	 */
	private async openInWindow(): Promise<void> {
		try {
			const leaf = this.plugin.app.workspace.getLeaf('window');
			await this.openLeaf(leaf, VIEW_TYPE_CHAT_TAB, true);
		} catch (error) {
			console.error('OpenChat: 在新窗口中打开失败，回退到标签页模式:', error);
			const leaf = this.plugin.app.workspace.getLeaf(true);
			await this.openLeaf(leaf, VIEW_TYPE_CHAT_TAB, true);
		}
	}

	/**
	 * 打开叶子视图
	 */
	private async openLeaf(leaf: WorkspaceLeaf, viewType: string, reveal: boolean): Promise<void> {
		try {
			await leaf.setViewState({
				type: viewType,
				active: true
			});
			if (reveal) {
				this.plugin.app.workspace.revealLeaf(leaf);
			}
		} catch (error) {
			console.error('OpenChat: 设置叶子视图状态失败:', error);
			throw error;
		}
	}

	/**
	 * 清理资源
	 */
	dispose(): void {
		this.ribbonEl?.remove();
		this.ribbonEl = null;
		this.plugin.app.workspace.detachLeavesOfType(VIEW_TYPE_CHAT_SIDEBAR);
		this.plugin.app.workspace.detachLeavesOfType(VIEW_TYPE_CHAT_TAB);

		if (this.persistentModal) {
			this.persistentModal.close();
			this.persistentModal = null;
		}
	}
}
