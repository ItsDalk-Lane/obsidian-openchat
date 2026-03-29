import { App, Modal, TFile } from 'obsidian';
import { StrictMode } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { ObsidianAppContext } from 'src/contexts/obsidianAppContext';
import { localInstance } from 'src/i18n/locals';
import { ChatService } from 'src/core/chat/services/chat-service';
import type { ChatConsumerHost } from 'src/core/chat/services/chat-service-types';
import { ChatPersistentModalApp } from './ChatPersistentModalApp';
import { setupModalDragging } from './chatPersistentModalDrag';

/**
 * Chat 持久化模态框配置选项
 */
export interface ChatPersistentModalOptions {
	width: number;
	height: number;
	activeFile?: TFile | null;
	onClose?: () => void;
}

/**
 * AI Chat 持久化模态框
 * 与临时模态框(ChatModal)的区别:
 * 1. 保存聊天历史(shouldSaveHistory=true)
 * 2. 不创建新会话,继续使用当前会话
 * 3. 关闭时不恢复会话状态
 * 4. 注册事件监听器,实现文件自动管理
 */
export class ChatPersistentModal extends Modal {
	private root: Root | null = null;
	private readonly service: ChatService;
	private readonly options: ChatPersistentModalOptions;
	private readonly onCloseCallback?: () => void;

	// 事件监听器引用(用于清理)
	private eventCleanups: Array<() => void> = [];

	// 拖动清理函数
	private dragCleanup: (() => void) | null = null;

	// 缩小功能相关
	private isMinimized = false;
	private originalPosition = { left: 0, top: 0, width: 0, height: 0 };
	private floatingButton: HTMLElement | null = null;
	private customModalBg: HTMLElement | null = null;
	private originalStyleSnapshot: {
		display: string;
		position: string;
		left: string;
		top: string;
		right: string;
		bottom: string;
		transform: string;
		margin: string;
	} | null = null;
	private focusCaptureHandler: ((event: FocusEvent) => void) | null = null;

	constructor(
		app: App,
		private readonly host: Pick<
			ChatConsumerHost,
			| 'app'
			| 'getOpenMarkdownFiles'
			| 'onWorkspaceLayoutChange'
			| 'onActiveMarkdownFileChange'
			| 'onMarkdownFileOpen'
		>,
		service: ChatService,
		options: ChatPersistentModalOptions
	) {
		super(app);
		this.service = service;
		this.options = options;
		this.onCloseCallback = options.onClose;
	}

	onOpen() {
		const { contentEl, modalEl, titleEl } = this;
		contentEl.empty();
		contentEl.addClass('chat-persistent-modal-content');
		modalEl.addClass('chat-persistent-modal');

		// 打开时确保缩小状态被重置
		this.isMinimized = false;
		if (this.floatingButton) {
			this.floatingButton.remove();
			this.floatingButton = null;
		}

		// 设置模态框标题
		titleEl.textContent = localInstance.chat_modal_title;

		// 设置模态框为可拖动
		this.dragCleanup = setupModalDragging(modalEl, titleEl, () => this.handleMinimize(), () => this.close());

		// 设置模态框尺寸
		modalEl.style.setProperty('--chat-modal-width', `${this.options.width}px`);
		modalEl.style.setProperty('--chat-modal-height', `${this.options.height}px`);

		// 按全局配置同步历史记录保存开关，避免与“自动保存聊天记录”设置冲突
		this.service.setShouldSaveHistory(this.service.getAutosaveChatEnabled());

		// 不创建新会话,继续使用当前会话(与ChatModal不同)
		// 不保存会话状态(与ChatModal不同)

		// 重新打开模态框时,清除当前文件的手动移除标记
		// 这样在同一文件中重新打开模态框时,文件可以重新被自动添加
		if (this.options.activeFile) {
			this.service.onChatViewReopened(this.options.activeFile);
		}

		// 模态框真正打开时（非最小化恢复），重置模型为配置的默认模型
		this.service.onChatPanelOpen();

		// 注册事件监听器(核心功能,从ChatView复制)
		this.registerEventListeners();

		// 自动添加当前活动文件到上下文
		if (this.options.activeFile) {
			this.service.addActiveFile(this.options.activeFile);
		}

		// 创建 React 根节点并渲染
		this.root = createRoot(contentEl);
		this.renderReact();

		// 新增：阻止点击外部关闭
		this.preventCloseOnOutsideClick();

		// 新增：设置非模态行为
		this.setupNonModalBehavior();
	}

	onClose() {
		// 调用关闭回调
		this.onCloseCallback?.();

		// 清理自定义遮罩层
		if (this.customModalBg) {
			this.customModalBg.remove();
			this.customModalBg = null;
		}

		// 清理悬浮按钮
		if (this.floatingButton) {
			this.floatingButton.remove();
			this.floatingButton = null;
		}

		// 不恢复会话状态(与ChatModal不同)
		// 不清理文件(与ChatModal不同)
		// 保持当前会话和文件选择状态

		// 清理事件监听器
		this.unregisterEventListeners();

		// 清理拖动事件监听器
		this.dragCleanup?.();
		this.dragCleanup = null;

		// 清理焦点捕获监听器
		if (this.focusCaptureHandler) {
			document.removeEventListener('focusin', this.focusCaptureHandler, true);
			this.focusCaptureHandler = null;
		}

		// 卸载 React 组件
		this.root?.unmount();
		this.root = null;
	}

	/**
	 * 注册事件监听器
	 * 从ChatView复制并修改,实现文件自动管理功能
	 */
	private registerEventListeners() {
		// 1. active-leaf-change事件:监听文件切换
		this.eventCleanups.push(this.host.onActiveMarkdownFileChange((file) => {
			if (!file) {
				// 如果文件为null,说明没有活动文件,移除所有自动添加的文件并重置标记
				this.service.removeAllAutoAddedFiles();
				this.service.onNoActiveFile();
			} else {
				// 添加新的活动文件(会自动移除之前的自动添加文件)
				this.service.addActiveFile(file);
				// 同时检查并清理已关闭的文件
				this.checkAndCleanAutoAddedFiles();
			}
		}));

		// 2. file-open事件:监听文件打开/关闭
		this.eventCleanups.push(this.host.onMarkdownFileOpen((file) => {
			if (!file) {
				// 文件被关闭,检查自动添加的文件是否仍打开
				this.checkAndCleanAutoAddedFiles();
				// 如果没有任何打开的Markdown文件,重置标记
				const openFiles = this.getOpenMarkdownFiles();
				if (openFiles.size === 0) {
					this.service.onNoActiveFile();
				}
			} else {
				this.service.addActiveFile(file);
			}
		}));

		// 3. layout-change事件:监听布局变化(检测标签页关闭)
		this.eventCleanups.push(this.host.onWorkspaceLayoutChange(() => {
			// 延迟执行检查,确保布局已更新
			setTimeout(() => {
				this.checkAndCleanAutoAddedFiles();
			}, 50);
		}));
	}

	/**
	 * 清理事件监听器
	 */
	private unregisterEventListeners() {
		this.eventCleanups.forEach((cleanup) => {
			cleanup();
		});
		this.eventCleanups = [];
	}

	/**
	 * 获取当前所有打开的Markdown文件路径
	 * 从ChatView复制
	 */
	private getOpenMarkdownFiles(): Set<string> {
		return new Set(this.host.getOpenMarkdownFiles().map((file) => file.path));
	}

	/**
	 * 检查自动添加的文件是否仍然打开,如果未打开则清除
	 * 从ChatView复制
	 */
	private checkAndCleanAutoAddedFiles() {
		const openFiles = this.getOpenMarkdownFiles();
		const autoAddedFiles = this.service.getAutoAddedFiles();

		for (const file of autoAddedFiles) {
			if (!openFiles.has(file.path)) {
				// 自动添加的文件已关闭,从上下文中移除
				this.service.removeSelectedFile(file.id, false);
			}
		}
	}

	private renderReact() {
		if (!this.root) return;

		this.root.render(
			<StrictMode>
				<ObsidianAppContext.Provider value={this.app}>
					<ChatPersistentModalApp
						service={this.service}
						app={this.app}
					/>
				</ObsidianAppContext.Provider>
			</StrictMode>
		);
	}

	/**
	 * 阻止点击外部区域关闭模态框并隐藏默认关闭按钮
	 */
	private preventCloseOnOutsideClick() {
		setTimeout(() => {
			// 隐藏 Obsidian 默认创建的关闭按钮
			const defaultCloseBtn = this.modalEl.querySelector('.modal-close-button') as HTMLElement;
			if (defaultCloseBtn) {
				defaultCloseBtn.style.display = 'none';
			}

			// 处理遮罩层
			const modalContainer = this.modalEl?.closest('.modal-container') as HTMLElement | null;
			const modalBg = modalContainer?.querySelector('.modal-bg') as HTMLElement | null;
			if (modalBg) {
				// 阻止点击遮罩层事件
				modalBg.addEventListener('click', (e: MouseEvent) => {
					e.preventDefault();
					e.stopPropagation();
					e.stopImmediatePropagation();
				}, true);

				// 完全移除遮罩层的交互
				modalBg.style.pointerEvents = 'none';
				modalBg.style.backgroundColor = 'transparent';
				modalBg.style.opacity = '0';
				modalBg.style.display = 'none';
			}
		}, 0);
	}

	/**
	 * 设置非模态行为（允许与其他UI元素交互）
	 */
	private setupNonModalBehavior() {
		setTimeout(() => {
			// 处理遮罩层，确保不阻止其他操作
			const modalContainer = this.modalEl?.closest('.modal-container') as HTMLElement | null;
			const modalBg = modalContainer?.querySelector('.modal-bg') as HTMLElement | null;
			if (modalBg) {
				modalBg.style.pointerEvents = 'none';
				modalBg.style.backgroundColor = 'transparent';
				modalBg.style.opacity = '0';
				modalBg.style.display = 'none';
			}

			// 确保模态框本身可以交互
			const modalEl = this.modalEl;
			if (modalEl) {
				modalEl.style.pointerEvents = 'auto';
			}

			// 移除模态容器的模态行为限制，并清除背景模糊效果
			if (modalContainer) {
				modalContainer.style.pointerEvents = 'none';
				modalContainer.style.backdropFilter = 'none';
				(modalContainer.style as CSSStyleDeclaration & { webkitBackdropFilter: string }).webkitBackdropFilter = 'none';
			}

			// 防止模态框抢回编辑器焦点
			if (!this.focusCaptureHandler) {
				this.focusCaptureHandler = (event: FocusEvent) => {
					const target = event.target as Node | null;
					if (target && this.modalEl?.contains(target)) {
						return;
					}
					event.stopImmediatePropagation();
				};
				document.addEventListener('focusin', this.focusCaptureHandler, true);
			}
		}, 0);
	}

	/**
	 * 处理缩小操作
	 */
	private handleMinimize() {
		if (this.isMinimized) {
			this.restoreFromMinimize();
		} else {
			this.minimizeToFloatingButton();
		}
	}

	/**
	 * 缩小到悬浮按钮
	 */
	private minimizeToFloatingButton() {
		const modalEl = this.modalEl;
		if (!modalEl) return;

		// 保存当前状态
		const rect = modalEl.getBoundingClientRect();
		this.originalPosition = {
			left: rect.left,
			top: rect.top,
			width: rect.width,
			height: rect.height
		};
		this.originalStyleSnapshot = {
			display: modalEl.style.display,
			position: modalEl.style.position,
			left: modalEl.style.left,
			top: modalEl.style.top,
			right: modalEl.style.right,
			bottom: modalEl.style.bottom,
			transform: modalEl.style.transform,
			margin: modalEl.style.margin
		};

		// 隐藏模态框
		modalEl.style.display = 'none';

		// 隐藏模态容器，防止 backdrop-filter: blur() 导致界面模糊
		const modalContainer = modalEl.closest('.modal-container') as HTMLElement | null;
		if (modalContainer) {
			modalContainer.style.display = 'none';
		}

		// 创建悬浮按钮
		this.createFloatingButton();

		this.isMinimized = true;
	}

	/**
	 * 创建悬浮按钮
	 */
	private createFloatingButton() {
		if (this.floatingButton) return;

		const floatBtn = document.createElement('div');
		floatBtn.className = 'chat-persistent-modal-floating-btn';
		floatBtn.innerHTML = `
			<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
			</svg>
		`;

		// 点击恢复
		floatBtn.addEventListener('click', () => this.restoreFromMinimize());

		// 添加到文档
		document.body.appendChild(floatBtn);
		this.floatingButton = floatBtn;
	}

	/**
	 * 从悬浮按钮恢复
	 */
	private restoreFromMinimize() {
		const modalEl = this.modalEl;
		if (!modalEl || !this.floatingButton) return;

		// 移除悬浮按钮
		this.floatingButton.remove();
		this.floatingButton = null;

		// 先恢复模态容器的显示
		const modalContainer = modalEl.closest('.modal-container') as HTMLElement | null;
		if (modalContainer) {
			modalContainer.style.display = '';
		}

		// 恢复模态框
		if (this.originalStyleSnapshot) {
			modalEl.style.display = this.originalStyleSnapshot.display;
			modalEl.style.position = this.originalStyleSnapshot.position;
			modalEl.style.left = this.originalStyleSnapshot.left;
			modalEl.style.top = this.originalStyleSnapshot.top;
			modalEl.style.right = this.originalStyleSnapshot.right;
			modalEl.style.bottom = this.originalStyleSnapshot.bottom;
			modalEl.style.transform = this.originalStyleSnapshot.transform;
			modalEl.style.margin = this.originalStyleSnapshot.margin;
		} else {
			modalEl.style.display = 'flex';
			modalEl.style.left = `${this.originalPosition.left}px`;
			modalEl.style.top = `${this.originalPosition.top}px`;
		}

		this.isMinimized = false;

		// 重新应用非模态行为，确保遮罩层不会阻止交互
		this.setupNonModalBehavior();
	}

	/**
	 * 聚焦模态框
	 * 用于单例模式下恢复已有模态框的显示
	 */
	public focus() {
		// 如果处于最小化状态，先恢复
		if (this.isMinimized) {
			this.restoreFromMinimize();
		}

		// 确保模态框可见
		const modalEl = this.modalEl;
		if (modalEl) {
			modalEl.style.display = 'flex';
			modalEl.style.zIndex = '1000';

			// 聚焦到输入框
			const inputElement = modalEl.querySelector('textarea, input') as HTMLElement;
			inputElement?.focus();
		}
	}
}
