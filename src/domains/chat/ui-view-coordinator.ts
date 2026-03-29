import type { TFile, WorkspaceLeaf } from 'obsidian';
import { ChatService } from 'src/core/chat/services/chat-service';
import type { ChatConsumerHost } from 'src/core/chat/services/chat-service-types';
import {
	ChatView,
	VIEW_TYPE_CHAT_SIDEBAR,
	VIEW_TYPE_CHAT_TAB,
} from 'src/components/chat-components/ChatView';
import { ChatModal } from 'src/components/chat-components/ChatModal';
import { ChatPersistentModal } from 'src/components/chat-components/ChatPersistentModal';
import type { ChatOpenMode } from 'src/types/chat';
import { localInstance } from 'src/i18n/locals';
import { DebugLogger } from 'src/utils/DebugLogger';
import {
	registerChatViewCommands,
	syncChatRibbonIcon,
} from './ui-view-coordinator-support';

export class ChatViewCoordinator {
	private persistentModal: ChatPersistentModal | null = null;
	private ribbonEl: HTMLElement | null = null;
	private viewTypesRegistered = false;

	constructor(
		private readonly host: ChatConsumerHost,
		private readonly service: ChatService,
	) {}

	registerViewTypesOnly(): void {
		if (this.viewTypesRegistered) {
			return;
		}
		this.registerViews();
		this.viewTypesRegistered = true;
	}

	initialize(): void {
		if (!this.viewTypesRegistered) {
			this.registerViews();
			this.viewTypesRegistered = true;
		}
		this.registerCommands();
		this.createRibbon();
	}

	updateRibbonIcon(show: boolean): void {
		const isCurrentlyShowing = this.ribbonEl !== null;
		if (isCurrentlyShowing === show) {
			return;
		}
		this.ribbonEl = syncChatRibbonIcon(
			this.host,
			this.service,
			this.ribbonEl,
			show,
			async (mode) => await this.activateChatView(mode),
		);
	}

	async activateChatView(mode: ChatOpenMode): Promise<void> {
		try {
			if (mode === 'window') {
				const existingLeaf = this.host.findLeafByViewType(VIEW_TYPE_CHAT_TAB);
				if (existingLeaf) {
					this.host.revealLeaf(existingLeaf);
				} else {
					await this.openInWindow();
				}
				return;
			}

			if (mode === 'persistent-modal') {
				this.openChatInPersistentModal();
				return;
			}

			if (mode === 'sidebar') {
				await this.waitForWorkspaceReady();
				await this.openSidebar('right', 'left');
				return;
			}

			if (mode === 'left-sidebar') {
				await this.waitForWorkspaceReady();
				await this.openSidebar('left', 'right');
				return;
			}

			const existingLeaf = this.host.findLeafByViewType(VIEW_TYPE_CHAT_TAB);
			if (existingLeaf) {
				this.host.revealLeaf(existingLeaf);
				return;
			}
			await this.openLeaf(this.host.getLeaf('tab'), VIEW_TYPE_CHAT_TAB, true);
		} catch (error) {
			DebugLogger.error('OpenChat: 激活聊天视图失败:', error);
		}
	}

	openChatInModal(activeFile?: TFile | null): void {
		const settings = this.host.getChatSettings();
		const file = activeFile ?? this.host.getActiveMarkdownFile();
		if (!file || file.extension !== 'md') {
			this.host.notify(localInstance.chat_trigger_no_active_file);
			return;
		}

		const modal = new ChatModal(this.host.app, this.service, {
			width: settings.chatModalWidth ?? 700,
			height: settings.chatModalHeight ?? 500,
			activeFile: file,
		});
		modal.open();
	}

	openChatInPersistentModal(activeFile?: TFile | null): void {
		if (this.persistentModal) {
			this.persistentModal.focus();
			const file = activeFile ?? this.host.getActiveMarkdownFile();
			if (file) {
				this.service.addActiveFile(file);
			}
			return;
		}

		const settings = this.host.getChatSettings();
		const file = activeFile ?? this.host.getActiveMarkdownFile();

		this.persistentModal = new ChatPersistentModal(this.host.app, this.host, this.service, {
			width: settings.chatModalWidth ?? 700,
			height: settings.chatModalHeight ?? 500,
			activeFile: file,
			onClose: () => {
				this.persistentModal = null;
			},
		});
		this.persistentModal.open();
	}

	dispose(): void {
		this.ribbonEl?.remove();
		this.ribbonEl = null;
		this.host.detachLeavesOfType(VIEW_TYPE_CHAT_SIDEBAR);
		this.host.detachLeavesOfType(VIEW_TYPE_CHAT_TAB);

		if (this.persistentModal) {
			this.persistentModal.close();
			this.persistentModal = null;
		}
	}

	private createRibbon(): void {
		const shouldShowRibbon = this.host.getChatSettings().showRibbonIcon ?? true;
		this.ribbonEl = syncChatRibbonIcon(
			this.host,
			this.service,
			this.ribbonEl,
			shouldShowRibbon,
			async (mode) => await this.activateChatView(mode),
		);
	}

	private registerCommands(): void {
		registerChatViewCommands({
			host: this.host,
			service: this.service,
			activateChatView: async (mode) => await this.activateChatView(mode),
			openChatInPersistentModal: (activeFile) => this.openChatInPersistentModal(activeFile),
		});
	}

	private registerViews(): void {
		this.host.registerView(
			VIEW_TYPE_CHAT_SIDEBAR,
			(leaf) => new ChatView(leaf, this.host, this.service, 'sidebar', VIEW_TYPE_CHAT_SIDEBAR),
		);
		this.host.registerView(
			VIEW_TYPE_CHAT_TAB,
			(leaf) => new ChatView(leaf, this.host, this.service, 'tab', VIEW_TYPE_CHAT_TAB),
		);
	}

	private async waitForWorkspaceReady(): Promise<void> {
		const maxRetries = 10;
		const retryDelay = 100;

		for (let i = 0; i < maxRetries; i += 1) {
			if (this.host.isWorkspaceReady()) {
				return;
			}
			await new Promise((resolve) => setTimeout(resolve, retryDelay));
		}

		DebugLogger.warn('OpenChat: 工作区准备检查超时，将尝试继续执行');
	}

	private async openSidebar(
		primary: 'left' | 'right',
		fallback: 'left' | 'right',
	): Promise<void> {
		const existingLeaf = this.host.findLeafByViewType(VIEW_TYPE_CHAT_SIDEBAR);
		if (existingLeaf) {
			this.host.revealLeaf(existingLeaf);
			return;
		}

		const primaryLeaf = this.host.getSidebarLeaf(primary);
		if (primaryLeaf) {
			await this.openLeaf(primaryLeaf, VIEW_TYPE_CHAT_SIDEBAR, true);
			return;
		}

		DebugLogger.warn(`OpenChat: 无法获取${primary === 'right' ? '右' : '左'}侧边栏，尝试回退`);
		const fallbackLeaf = this.host.getSidebarLeaf(fallback);
		if (fallbackLeaf) {
			await this.openLeaf(fallbackLeaf, VIEW_TYPE_CHAT_SIDEBAR, true);
		}
	}

	private async openInWindow(): Promise<void> {
		try {
			await this.openLeaf(this.host.getLeaf('window'), VIEW_TYPE_CHAT_TAB, true);
		} catch (error) {
			DebugLogger.error('OpenChat: 在新窗口中打开失败，回退到标签页模式:', error);
			await this.openLeaf(this.host.getLeaf('tab'), VIEW_TYPE_CHAT_TAB, true);
		}
	}

	private async openLeaf(
		leaf: WorkspaceLeaf,
		viewType: string,
		reveal: boolean,
	): Promise<void> {
		try {
			await this.host.setLeafViewState(leaf, viewType, true);
			if (reveal) {
				this.host.revealLeaf(leaf);
			}
		} catch (error) {
			DebugLogger.error('OpenChat: 设置叶子视图状态失败:', error);
			throw error;
		}
	}
}
