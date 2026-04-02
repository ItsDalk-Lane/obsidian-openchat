/**
 * ChatEditorIntegration - 聊天编辑器集成
 * 负责管理所有编辑器扩展：触发扩展、划词工具栏、Modify弹窗、快捷操作
 * 从 ChatFeatureManager 中拆分出来，遵循单一职责原则
 */
import { TFile } from 'obsidian';
import { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { createRoot, Root } from 'react-dom/client';
import { StrictMode } from 'react';
import type { ChatService } from 'src/core/chat/services/chat-service';
import type { ChatConsumerHost } from 'src/core/chat/services/chat-service-types';
import { createChatTriggerExtension, updateChatTriggerSettings } from './ChatTriggerExtension';
import {
	createSelectionToolbarExtension,
	updateSelectionToolbarSettings,
	SelectionInfo,
	getContentWithoutFrontmatter,
	setTriggerSource,
	setToolbarVisible
} from 'src/editor/selectionToolbar/SelectionToolbarExtension';
import { QuickActionExecutionService } from 'src/domains/quick-actions/service-execution';
import { QuickActionDataService } from 'src/domains/quick-actions/service-data';
import { SelectionToolbar } from 'src/editor/selectionToolbar/SelectionToolbar';
import { ModifyTextModal } from 'src/editor/selectionToolbar/ModifyTextModal';
import { createModifyGhostTextExtension } from 'src/editor/selectionToolbar/ModifyGhostTextExtension';
import type { QuickAction } from 'src/domains/chat/types';
import type { ProviderSettings } from 'src/types/provider';
import { DebugLogger } from 'src/utils/DebugLogger';
import { localInstance } from 'src/i18n/locals';
import {
	createChatEditorQuickActionDataService,
	createChatEditorQuickActionExecutionService,
} from './chat-editor-quick-actions';


export abstract class ChatEditorIntegrationBase {
	// Chat 触发扩展
	protected chatTriggerExtension: Extension | null = null;

	// 划词工具栏
	protected selectionToolbarExtension: Extension | null = null;
	protected quickActionExecutionService: QuickActionExecutionService | null = null;
	protected quickActionDataService: QuickActionDataService | null = null;
	protected cachedQuickActions: QuickAction[] = [];
	protected toolbarContainer: HTMLElement | null = null;
	protected toolbarRoot: Root | null = null;
	protected currentSelectionInfo: SelectionInfo | null = null;
	protected currentEditorView: EditorView | null = null;
	protected isToolbarVisible = false;
	protected currentTriggerSymbolRange: { from: number; to: number } | null = null;

	// Modify 弹窗
	protected modifyModalContainer: HTMLElement | null = null;
	protected modifyModalRoot: Root | null = null;
	protected isModifyModalVisible = false;
	protected selectedModifyModelTag = '';
	protected pendingModifyContext: {
		triggerSource: 'selection' | 'symbol';
		anchorCoords?: SelectionInfo['coords'];
		contentForAI: string;
		replaceFrom: number;
		replaceTo: number;
		ghostPos: number;
	} | null = null;
	protected modifyGhostExtensions: Extension[] = [];

	// 快捷操作结果模态框
	protected resultModalContainer: HTMLElement | null = null;
	protected resultModalRoot: Root | null = null;
	protected currentIsLoading = false;
	protected currentRenderModal: (() => void) | null = null;
	protected isResultModalVisible = false;
	protected selectedQuickActionModelTag = '';
	protected currentResult = '';
	protected currentError: string | undefined = undefined;

	constructor(
		protected readonly host: ChatConsumerHost,
		protected readonly service: ChatService
	) {}

	/**
	 * 初始化编辑器集成
	 */

	// ===== Abstract methods (implemented in ChatEditorIntegration) =====
	protected abstract openChatWithSelection(selection: string, triggerSource?: 'selection' | 'symbol', fullText?: string): void;
	protected abstract executeQuickAction(quickAction: QuickAction, selection: string, triggerSource?: 'selection' | 'symbol', fullText?: string): Promise<void>;
	protected abstract deleteTriggerSymbol(): void;
	protected abstract getFrontmatterLength(docText: string): number;
	protected abstract resolveProviders(): ProviderSettings[];
	protected abstract resolveDefaultModifyModelTag(providers: ProviderSettings[]): string;
	protected abstract executeModifyRequest(instruction: string): Promise<void>;

	async initialize(): Promise<void> {
		this.registerChatTriggerExtension();
		this.registerSelectionToolbarExtension();
		this.registerModifyGhostTextExtension();
		this.initializeQuickActionExecutionService();
		await this.initializeQuickActionDataService();
	}

	/**
	 * 注册 Chat 触发编辑器扩展
	 */
	private registerChatTriggerExtension(): void {
		const settings = this.host.getChatSettings();
		updateChatTriggerSettings(settings);

		this.chatTriggerExtension = createChatTriggerExtension(
			settings,
			() => this.host.getActiveMarkdownFile(),
			{
				onShowToolbar: (view, activeFile, symbolRange) => {
					this.showToolbarBySymbol(view, activeFile, symbolRange);
				}
			}
		);

		this.host.registerEditorExtension(this.chatTriggerExtension);
	}

	/**
	 * 更新 Chat 触发编辑器扩展
	 */
	updateChatTriggerExtension(): void {
		const settings = this.host.getChatSettings();
		updateChatTriggerSettings(settings);
		this.host.updateWorkspaceOptions();
	}

	/**
	 * 注册选区工具栏编辑器扩展
	 */
	private registerSelectionToolbarExtension(): void {
		const settings = this.host.getChatSettings();
		updateSelectionToolbarSettings(settings);

		this.selectionToolbarExtension = createSelectionToolbarExtension(
			settings,
			() => this.host.getActiveMarkdownFile(),
			{
				onShowToolbar: (info, view, activeFile) => {
					this.showSelectionToolbar(info, view, activeFile);
				},
				onHideToolbar: () => {
					this.hideSelectionToolbar();
				}
			}
		);

		this.host.registerEditorExtension(this.selectionToolbarExtension);
	}

	/**
	 * 更新选区工具栏编辑器扩展
	 */
	updateSelectionToolbarExtension(): void {
		const settings = this.host.getChatSettings();
		updateSelectionToolbarSettings(settings);

		if (this.isToolbarVisible && this.currentSelectionInfo) {
			this.renderToolbar();
		}

		this.host.updateWorkspaceOptions();
	}

	/**
	 * 注册 Modify 灰字编辑器扩展
	 */
	private registerModifyGhostTextExtension(): void {
		this.modifyGhostExtensions = createModifyGhostTextExtension();
		this.host.registerEditorExtension(this.modifyGhostExtensions);
	}

	/**
	 * 初始化快捷操作执行服务
	 */
	private initializeQuickActionExecutionService(): void {
		this.quickActionExecutionService = createChatEditorQuickActionExecutionService(
			this.host,
			this.service,
		);
	}

	/**
	 * 初始化快捷操作数据服务并加载缓存
	 */
	private async initializeQuickActionDataService(): Promise<void> {
		try {
			this.quickActionDataService = createChatEditorQuickActionDataService(
				this.host,
				this.service,
			);
			await this.quickActionDataService.initialize();
			this.cachedQuickActions = await this.quickActionDataService.getSortedQuickActions();
			DebugLogger.debug('[ChatEditorIntegration] 快捷操作数据服务初始化完成，已加载', this.cachedQuickActions.length, '个操作');
		} catch (error) {
			DebugLogger.error('[ChatEditorIntegration] 快捷操作数据服务初始化失败', error);
		}
	}

	/**
	 * 刷新快捷操作缓存
	 */
	async refreshQuickActionsCache(): Promise<void> {
		if (this.quickActionDataService) {
			this.cachedQuickActions = await this.quickActionDataService.getSortedQuickActions();
			DebugLogger.debug('[ChatEditorIntegration] 快捷操作缓存已刷新，共', this.cachedQuickActions.length, '个操作');
		}
	}

	/**
	 * 显示选区工具栏
	 */
	private showSelectionToolbar(info: SelectionInfo, view: EditorView, activeFile: TFile | null): void {
		this.currentSelectionInfo = info;
		this.currentEditorView = view;
		this.isToolbarVisible = true;
		setToolbarVisible(true);

		if (!this.toolbarContainer) {
			this.toolbarContainer = document.createElement('div');
			this.toolbarContainer.className = 'selection-toolbar-container';
			document.body.appendChild(this.toolbarContainer);
			this.toolbarRoot = createRoot(this.toolbarContainer);
		}

		this.renderToolbar();
	}

	/**
	 * 通过符号触发显示工具栏
	 */
	private showToolbarBySymbol(view: EditorView, activeFile: TFile | null, symbolRange?: { from: number; to: number }): void {
		if (symbolRange) {
			this.currentTriggerSymbolRange = symbolRange;
		}
		this.currentEditorView = view;
		setTriggerSource('symbol');
		setToolbarVisible(true);

		const fullText = getContentWithoutFrontmatter(view.state.doc.toString());
		const cursorPos = view.state.selection.main.head;
		const coords = view.coordsAtPos(cursorPos);
		if (!coords) {
			return;
		}

		const selectionInfo: SelectionInfo = {
			text: '',
			fullText: fullText,
			from: cursorPos,
			to: cursorPos,
			lineStart: view.state.doc.lineAt(cursorPos).number,
			lineEnd: view.state.doc.lineAt(cursorPos).number,
			coords: {
				top: coords.top,
				left: coords.left,
				right: coords.right,
				bottom: coords.bottom
			},
			triggerSource: 'symbol',
			triggerSymbolRange: symbolRange
		};

		this.showSelectionToolbar(selectionInfo, view, activeFile);
	}

	/**
	 * 渲染工具栏组件
	 */
	private renderToolbar(): void {
		if (!this.toolbarRoot || !this.currentSelectionInfo) {
			return;
		}

		const settings = this.host.getChatSettings();
		const settingsWithCachedQuickActions = { ...settings, quickActions: this.cachedQuickActions };
		const { triggerSource, fullText } = this.currentSelectionInfo;

		this.toolbarRoot.render(
			<StrictMode>
				<SelectionToolbar
					visible={this.isToolbarVisible}
					selectionInfo={this.currentSelectionInfo}
					settings={settingsWithCachedQuickActions}
					onOpenChat={(selection) => this.openChatWithSelection(selection, triggerSource, fullText)}
					onModify={() => this.openModifyModal(triggerSource, fullText)}
					onCopy={() => this.copySelection()}
					onCut={() => this.cutSelection()}
					onExecuteQuickAction={(quickAction, selection) => this.executeQuickAction(quickAction, selection, triggerSource, fullText)}
					onClose={() => this.hideSelectionToolbar()}
				/>
			</StrictMode>
		);
	}

	/**
	 * 隐藏选区工具栏
	 */
	hideSelectionToolbar(): void {
		this.isToolbarVisible = false;
		this.currentSelectionInfo = null;
		this.currentTriggerSymbolRange = null;
		this.currentEditorView = null;
		setToolbarVisible(false);
		setTriggerSource(null);

		if (this.toolbarRoot) {
			const settings = this.host.getChatSettings();
			const settingsWithCachedQuickActions = { ...settings, quickActions: this.cachedQuickActions };

			this.toolbarRoot.render(
				<StrictMode>
					<SelectionToolbar
						visible={false}
						selectionInfo={null}
						settings={settingsWithCachedQuickActions}
						onOpenChat={() => {}}
						onModify={() => {}}
						onCopy={() => {}}
						onCut={() => {}}
						onExecuteQuickAction={() => {}}
						onClose={() => {}}
					/>
				</StrictMode>
			);
		}
	}

	/**
	 * 复制选中的文本
	 */
	private copySelection(): void {
		if (!this.currentSelectionInfo || !this.currentSelectionInfo.text) {
			return;
		}

		const text = this.currentSelectionInfo.text;
		navigator.clipboard.writeText(text).then(() => {
			this.host.notify(localInstance.copied_to_clipboard);
		}).catch(() => {
			this.host.notify(localInstance.copy_failed);
		});

		this.hideSelectionToolbar();
	}

	/**
	 * 剪切选中的文本
	 */
	private cutSelection(): void {
		if (!this.currentEditorView || !this.currentSelectionInfo) {
			return;
		}

		const { from, to, text } = this.currentSelectionInfo;
		const editorView = this.currentEditorView;

		navigator.clipboard.writeText(text).then(() => {
			editorView.dispatch({
				changes: { from, to, insert: '' }
			});
			this.host.notify(localInstance.cut_to_clipboard);
			this.hideSelectionToolbar();
		}).catch(() => {
			this.host.notify(localInstance.cut_failed);
			this.hideSelectionToolbar();
		});
	}

	/**
	 * 打开 Modify 弹窗
	 */
	openModifyModal(triggerSource?: 'selection' | 'symbol', fullText?: string): void {
		if (!this.currentEditorView || !this.currentSelectionInfo) {
			return;
		}

		const view = this.currentEditorView;
		const selectionInfo = this.currentSelectionInfo;
		const source = triggerSource ?? selectionInfo.triggerSource;

		if (source === 'symbol' && this.currentTriggerSymbolRange && this.currentEditorView) {
			this.deleteTriggerSymbol();
		}

		this.hideSelectionToolbar();
		this.currentEditorView = view;

		const docText = view.state.doc.toString();
		const frontmatterLen = this.getFrontmatterLength(docText);
		const bodyStart = frontmatterLen;
		const docEnd = view.state.doc.length;

		const providers = this.resolveProviders();
		this.selectedModifyModelTag = this.selectedModifyModelTag || this.resolveDefaultModifyModelTag(providers);

		if (!this.selectedModifyModelTag) {
			this.selectedModifyModelTag = this.resolveDefaultModifyModelTag(providers);
		}

		if (source === 'selection') {
			this.pendingModifyContext = {
				triggerSource: 'selection',
				anchorCoords: selectionInfo.coords,
				contentForAI: selectionInfo.text,
				replaceFrom: selectionInfo.from,
				replaceTo: selectionInfo.to,
				ghostPos: selectionInfo.to
			};
		} else {
			this.pendingModifyContext = {
				triggerSource: 'symbol',
				anchorCoords: selectionInfo.coords,
				contentForAI: fullText ?? getContentWithoutFrontmatter(view.state.doc.toString()),
				replaceFrom: bodyStart,
				replaceTo: docEnd,
				ghostPos: docEnd
			};
		}

		this.showModifyModal();
	}

	/**
	 * 显示 Modify 弹窗
	 */
	private showModifyModal(): void {
		if (!this.modifyModalContainer) {
			this.modifyModalContainer = document.createElement('div');
			this.modifyModalContainer.className = 'modify-text-modal-container';
			document.body.appendChild(this.modifyModalContainer);
			this.modifyModalRoot = createRoot(this.modifyModalContainer);
		}
		this.isModifyModalVisible = true;
		this.renderModifyModal();
	}

	/**
	 * 隐藏 Modify 弹窗
	 */
	private hideModifyModal(): void {
		this.isModifyModalVisible = false;
		this.renderModifyModal();
	}

	/**
	 * 渲染 Modify 弹窗
	 */
	private renderModifyModal(): void {
		if (!this.modifyModalRoot) {
			return;
		}
		const providers = this.resolveProviders();
		const anchorCoords = this.pendingModifyContext?.anchorCoords;
		this.modifyModalRoot.render(
			<StrictMode>
				<ModifyTextModal
					visible={this.isModifyModalVisible}
					providers={providers}
					selectedModelTag={this.selectedModifyModelTag}
					anchorCoords={anchorCoords}
					onChangeModel={(tag) => {
						this.selectedModifyModelTag = tag;
						this.renderModifyModal();
					}}
					onSend={(instruction) => {
						this.hideModifyModal();
						void this.executeModifyRequest(instruction);
					}}
					onClose={() => this.hideModifyModal()}
				/>
			</StrictMode>
		);
	}

	/**
	 * 执行 Modify 请求
	 */
}
