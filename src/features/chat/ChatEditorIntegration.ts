/**
 * ChatEditorIntegration - 聊天编辑器集成
 * 负责管理所有编辑器扩展：触发扩展、划词工具栏、Modify弹窗、快捷操作
 * 从 ChatFeatureManager 中拆分出来，遵循单一职责原则
 */
import { Notice, TFile, MarkdownView } from 'obsidian';
import { Extension, Transaction } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { createRoot, Root } from 'react-dom/client';
import { StrictMode } from 'react';
import OpenChatPlugin from 'src/main';
import { ChatService } from './services/ChatService';
import { createChatTriggerExtension, updateChatTriggerSettings } from './trigger/ChatTriggerExtension';
import {
	createSelectionToolbarExtension,
	updateSelectionToolbarSettings,
	SelectionInfo,
	getContentWithoutFrontmatter,
	setTriggerSource,
	setToolbarVisible
} from 'src/editor/selectionToolbar/SelectionToolbarExtension';
import { QuickActionExecutionService } from 'src/editor/selectionToolbar/QuickActionExecutionService';
import { QuickActionDataService } from 'src/editor/selectionToolbar/QuickActionDataService';
import { SelectionToolbar } from 'src/editor/selectionToolbar/SelectionToolbar';
import { QuickActionResultModal } from 'src/editor/selectionToolbar/QuickActionResultModal';
import { ModifyTextModal } from 'src/editor/selectionToolbar/ModifyTextModal';
import { createModifyGhostTextExtension, setModifyGhostEffect } from 'src/editor/selectionToolbar/ModifyGhostTextExtension';
import type { ChatSettings, QuickAction } from './types/chat';
import type { ProviderSettings } from '../tars/providers';
import { availableVendors } from '../tars/settings';
import { buildProviderOptionsWithReasoningDisabled } from 'src/LLMProviders/utils';
import type { ChatMessage } from './types/chat';
import { PromptBuilder } from 'src/service/PromptBuilder';
import { SystemPromptAssembler } from 'src/service/SystemPromptAssembler';
import { DebugLogger } from 'src/utils/DebugLogger';
import { getPromptTemplatePath } from 'src/utils/AIPathManager';
import { ChatModal } from './views/ChatModal';
import { Message as ProviderMessage } from '../tars/providers';

export class ChatEditorIntegration {
	// Chat 触发扩展
	private chatTriggerExtension: Extension | null = null;

	// 划词工具栏
	private selectionToolbarExtension: Extension | null = null;
	private quickActionExecutionService: QuickActionExecutionService | null = null;
	private quickActionDataService: QuickActionDataService | null = null;
	private cachedQuickActions: QuickAction[] = [];
	private toolbarContainer: HTMLElement | null = null;
	private toolbarRoot: Root | null = null;
	private currentSelectionInfo: SelectionInfo | null = null;
	private currentEditorView: EditorView | null = null;
	private isToolbarVisible = false;
	private currentTriggerSymbolRange: { from: number; to: number } | null = null;

	// Modify 弹窗
	private modifyModalContainer: HTMLElement | null = null;
	private modifyModalRoot: Root | null = null;
	private isModifyModalVisible = false;
	private selectedModifyModelTag = '';
	private pendingModifyContext: {
		triggerSource: 'selection' | 'symbol';
		anchorCoords?: SelectionInfo['coords'];
		contentForAI: string;
		replaceFrom: number;
		replaceTo: number;
		ghostPos: number;
	} | null = null;
	private modifyGhostExtensions: Extension[] = [];

	// 快捷操作结果模态框
	private resultModalContainer: HTMLElement | null = null;
	private resultModalRoot: Root | null = null;
	private currentIsLoading = false;
	private currentRenderModal: (() => void) | null = null;
	private isResultModalVisible = false;
	private selectedQuickActionModelTag = '';
	private currentResult = '';
	private currentError: string | undefined = undefined;

	constructor(
		private readonly plugin: OpenChatPlugin,
		private readonly service: ChatService
	) {}

	/**
	 * 初始化编辑器集成
	 */
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
		const settings = this.plugin.settings.chat;
		updateChatTriggerSettings(settings);

		this.chatTriggerExtension = createChatTriggerExtension(
			this.plugin.app,
			settings,
			{
				onShowToolbar: (view, activeFile, symbolRange) => {
					this.showToolbarBySymbol(view, activeFile, symbolRange);
				}
			}
		);

		this.plugin.registerEditorExtension(this.chatTriggerExtension);
	}

	/**
	 * 更新 Chat 触发编辑器扩展
	 */
	updateChatTriggerExtension(): void {
		const settings = this.plugin.settings.chat;
		updateChatTriggerSettings(settings);
		this.plugin.app.workspace.updateOptions();
	}

	/**
	 * 注册选区工具栏编辑器扩展
	 */
	private registerSelectionToolbarExtension(): void {
		const settings = this.plugin.settings.chat;
		updateSelectionToolbarSettings(settings);

		this.selectionToolbarExtension = createSelectionToolbarExtension(
			this.plugin.app,
			settings,
			{
				onShowToolbar: (info, view, activeFile) => {
					this.showSelectionToolbar(info, view, activeFile);
				},
				onHideToolbar: () => {
					this.hideSelectionToolbar();
				}
			}
		);

		this.plugin.registerEditorExtension(this.selectionToolbarExtension);
	}

	/**
	 * 更新选区工具栏编辑器扩展
	 */
	updateSelectionToolbarExtension(): void {
		const settings = this.plugin.settings.chat;
		updateSelectionToolbarSettings(settings);

		if (this.isToolbarVisible && this.currentSelectionInfo) {
			this.renderToolbar();
		}

		this.plugin.app.workspace.updateOptions();
	}

	/**
	 * 注册 Modify 灰字编辑器扩展
	 */
	private registerModifyGhostTextExtension(): void {
		this.modifyGhostExtensions = createModifyGhostTextExtension();
		this.plugin.registerEditorExtension(this.modifyGhostExtensions);
	}

	/**
	 * 初始化快捷操作执行服务
	 */
	private initializeQuickActionExecutionService(): void {
		this.quickActionExecutionService = new QuickActionExecutionService(
			this.plugin.app,
			() => this.plugin.settings.tars.settings,
			() => getPromptTemplatePath(this.plugin.settings.aiDataFolder)
		);
	}

	/**
	 * 初始化快捷操作数据服务并加载缓存
	 */
	private async initializeQuickActionDataService(): Promise<void> {
		try {
			this.quickActionDataService = QuickActionDataService.getInstance(this.plugin.app);
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

		const fullText = getContentWithoutFrontmatter(this.plugin.app);
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

		const settings = this.plugin.settings.chat;
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
			const settings = this.plugin.settings.chat;
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
			new Notice('已复制到剪贴板');
		}).catch(() => {
			new Notice('复制失败');
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
			new Notice('已剪切到剪贴板');
			this.hideSelectionToolbar();
		}).catch(() => {
			new Notice('剪切失败');
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
				contentForAI: fullText ?? getContentWithoutFrontmatter(this.plugin.app),
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
	private async executeModifyRequest(instruction: string): Promise<void> {
		if (!this.currentEditorView) {
			return;
		}
		const ctx = this.pendingModifyContext;
		if (!ctx) {
			return;
		}

		try {
			this.currentEditorView.focus();
			this.currentEditorView.dispatch({
				selection: { anchor: ctx.ghostPos },
				annotations: Transaction.userEvent.of('modify-ghost-internal')
			});
		} catch {
			// ignore
		}

		const providers = this.resolveProviders();
		const provider = providers.find(p => p.tag === this.selectedModifyModelTag) ?? providers[0];
		if (!provider) {
			new Notice('尚未配置AI模型');
			return;
		}

		try {
			this.currentEditorView.dispatch({
				effects: setModifyGhostEffect.of({
					text: '生成中...',
					pos: ctx.ghostPos,
					replaceFrom: ctx.replaceFrom,
					replaceTo: ctx.replaceTo,
					isLoading: true
				}),
				annotations: Transaction.userEvent.of('modify-ghost-internal')
			});

			const result = await this.requestModifyText(provider, instruction, ctx.contentForAI);
			if (!result.trim()) {
				new Notice('AI 未返回可用内容');
				return;
			}

			this.currentEditorView.dispatch({
				effects: setModifyGhostEffect.of({
					text: result,
					pos: ctx.ghostPos,
					replaceFrom: ctx.replaceFrom,
					replaceTo: ctx.replaceTo,
					isLoading: false
				})
			});
		} catch (e) {
			new Notice(e instanceof Error ? e.message : String(e));
		}
	}

	/**
	 * 请求 Modify 文本
	 */
	private async requestModifyText(provider: ProviderSettings, instruction: string, content: string): Promise<string> {
		const vendor = availableVendors.find(v => v.name === provider.vendor);
		if (!vendor) {
			throw new Error(`未知的模型供应商: ${provider.vendor}`);
		}

		const assembler = new SystemPromptAssembler(this.plugin.app);
		const globalSystemPrompt = (await assembler.buildGlobalSystemPrompt('selection_toolbar')).trim();

		const userInstruction = `任务：根据用户指令修改输入文本。\n\n规则：\n1. 仅输出修改后的最终文本，不要解释\n2. 保持原文语言\n3. 保留 Markdown 结构（如有）\n\n用户指令：\n${instruction}`;

		const taskMessage: ChatMessage = {
			id: 'modify-task',
			role: 'user',
			content: userInstruction,
			timestamp: Date.now(),
			images: [],
			isError: false,
			metadata: {
				taskUserInput: instruction,
				taskTemplate: null,
				selectedText: content
			}
		};

		const promptBuilder = new PromptBuilder(this.plugin.app);
		const sourcePath = this.plugin.app.workspace.getActiveFile()?.path ?? '';
		const messages: ProviderMessage[] = await promptBuilder.buildChatProviderMessages([taskMessage], {
			systemPrompt: globalSystemPrompt.length > 0 ? globalSystemPrompt : undefined,
			sourcePath,
			parseLinksInTemplates: false,
			linkParseOptions: {
				enabled: false,
				maxDepth: 1,
				timeout: 1,
				preserveOriginalOnError: true,
				enableCache: true
			},
			maxHistoryRounds: 0
		});

		const controller = new AbortController();
		const resolveEmbed = async () => new ArrayBuffer(0);
		const providerOptions = buildProviderOptionsWithReasoningDisabled(provider.options, provider.vendor);
		const sendRequest = vendor.sendRequestFunc(providerOptions);
		DebugLogger.logLlmMessages('ChatEditorIntegration.requestModifyText', messages, { level: 'debug' });
		let output = '';
		for await (const chunk of sendRequest(messages, controller, resolveEmbed)) {
			output += chunk;
			if (controller.signal.aborted) {
				break;
			}
		}
		DebugLogger.logLlmResponsePreview('ChatEditorIntegration.requestModifyText', output, { level: 'debug', previewChars: 100 });
		return output.trim();
	}

	/**
	 * 删除触发符号
	 */
	private deleteTriggerSymbol(): void {
		if (!this.currentTriggerSymbolRange || !this.currentEditorView) {
			return;
		}

		const { from, to } = this.currentTriggerSymbolRange;
		this.currentEditorView.dispatch({
			changes: { from, to, insert: '' }
		});
		this.currentTriggerSymbolRange = null;
	}

	/**
	 * 携带选中文本打开 AI Chat
	 */
	private openChatWithSelection(selection: string, triggerSource?: 'selection' | 'symbol', fullText?: string): void {
		if (triggerSource === 'symbol' && this.currentTriggerSymbolRange && this.currentEditorView) {
			this.deleteTriggerSymbol();
		}

		this.hideSelectionToolbar();

		const settings = this.plugin.settings.chat;
		const activeFile = this.plugin.app.workspace.getActiveFile();
		const initialSelection = triggerSource === 'symbol' ? (fullText || selection) : selection;
		this.service.setNextTriggerSource(triggerSource === 'symbol' ? 'at_trigger' : 'selection_toolbar');

		const modal = new ChatModal(
			this.plugin.app,
			this.service,
			{
				width: settings.chatModalWidth ?? 700,
				height: settings.chatModalHeight ?? 500,
				activeFile: activeFile,
				initialSelection: initialSelection
			}
		);
		modal.open();
	}

	/**
	 * 执行快捷操作
	 */
	private async executeQuickAction(quickAction: QuickAction, selection: string, triggerSource?: 'selection' | 'symbol', fullText?: string): Promise<void> {
		if (triggerSource === 'symbol' && this.currentTriggerSymbolRange && this.currentEditorView) {
			this.deleteTriggerSymbol();
		}

		this.hideSelectionToolbar();

		if (!this.quickActionExecutionService) {
			new Notice('快捷操作执行服务未初始化');
			return;
		}

		this.showQuickActionResultModal(quickAction, selection, triggerSource, fullText);
	}

	/**
	 * 显示快捷操作结果模态框
	 */
	private showQuickActionResultModal(quickAction: QuickAction, selection: string, triggerSource?: 'selection' | 'symbol', fullText?: string): void {
		this.isResultModalVisible = true;
		const requiresModelSelection = quickAction.modelTag === '__EXEC_TIME__';

		if (!this.resultModalContainer) {
			this.resultModalContainer = document.createElement('div');
			this.resultModalContainer.className = 'quick-action-result-modal-container';
			document.body.appendChild(this.resultModalContainer);
			this.resultModalRoot = createRoot(this.resultModalContainer);
		}

		const actualSelection = triggerSource === 'symbol' ? (fullText || '') : selection;
		const providers = this.service.getProviders();

		this.currentResult = '';
		this.currentError = undefined;
		this.currentIsLoading = !requiresModelSelection;

		const renderModal = () => {
			if (!this.isResultModalVisible || !this.resultModalRoot) {
				return;
			}

			this.resultModalRoot.render(
				<StrictMode>
					<QuickActionResultModal
						app={this.plugin.app}
						visible={true}
						quickAction={quickAction}
						selection={selection}
						result={this.currentResult}
						isLoading={this.currentIsLoading}
						error={this.currentError}
						providers={providers}
						selectedModelTag={this.selectedQuickActionModelTag}
						onModelChange={(tag) => this.handleQuickActionModelChange(tag, quickAction, actualSelection)}
						requiresModelSelection={requiresModelSelection}
						onClose={() => this.hideResultModal()}
						onStop={() => {
							this.cancelCurrentQuickActionExecution();
							this.currentIsLoading = false;
							renderModal();
						}}
						onRegenerate={() => this.regenerateQuickActionResult(quickAction, selection, triggerSource, fullText)}
						onInsert={(mode) => this.insertQuickActionResult(this.currentResult, mode, triggerSource, fullText)}
						onCopy={() => {}}
					/>
				</StrictMode>
			);
		};

		this.currentRenderModal = renderModal;
		renderModal();

		if (!requiresModelSelection) {
			const useStreamOutput = this.plugin.settings.chat.quickActionsStreamOutput ?? true;

			if (useStreamOutput) {
				this.executeQuickActionAndStream(quickAction, actualSelection, {
					onChunk: (chunk) => {
						if (!this.isResultModalVisible) return;
						this.currentResult += chunk;
						renderModal();
					},
					onComplete: () => {
						if (!this.isResultModalVisible) return;
						this.currentIsLoading = false;
						renderModal();
					},
					onError: (err) => {
						if (!this.isResultModalVisible) return;
						this.currentIsLoading = false;
						this.currentError = err;
						renderModal();
					}
				});
			} else {
				this.executeQuickActionNonStream(quickAction, actualSelection).then((response) => {
					if (!this.isResultModalVisible) return;
					this.currentResult = response;
					this.currentIsLoading = false;
					renderModal();
				}).catch((err) => {
					if (!this.isResultModalVisible) return;
					this.currentIsLoading = false;
					this.currentError = err instanceof Error ? err.message : String(err);
					renderModal();
				});
			}
		}
	}

	/**
	 * 处理操作模型切换
	 */
	private handleQuickActionModelChange(modelTag: string, quickAction: QuickAction, selection: string): void {
		this.selectedQuickActionModelTag = modelTag;

		if (!modelTag) {
			this.currentRenderModal?.();
			return;
		}

		this.currentIsLoading = true;
		this.currentResult = '';
		this.currentError = undefined;
		this.currentRenderModal?.();

		const useStreamOutput = this.plugin.settings.chat.quickActionsStreamOutput ?? true;

		if (useStreamOutput) {
			this.executeQuickActionAndStream(quickAction, selection, {
				onChunk: (chunk) => {
					if (!this.isResultModalVisible) return;
					this.currentResult += chunk;
					this.currentRenderModal?.();
				},
				onComplete: () => {
					if (!this.isResultModalVisible) return;
					this.currentIsLoading = false;
					this.currentRenderModal?.();
				},
				onError: (err) => {
					if (!this.isResultModalVisible) return;
					this.currentIsLoading = false;
					this.currentError = err;
					this.currentRenderModal?.();
				}
			}, modelTag);
		} else {
			this.executeQuickActionNonStream(quickAction, selection, modelTag).then((response) => {
				if (!this.isResultModalVisible) return;
				this.currentResult = response;
				this.currentIsLoading = false;
				this.currentRenderModal?.();
			}).catch((err) => {
				if (!this.isResultModalVisible) return;
				this.currentIsLoading = false;
				this.currentError = err instanceof Error ? err.message : String(err);
				this.currentRenderModal?.();
			});
		}
	}

	/**
	 * 非流式执行快捷操作
	 */
	private async executeQuickActionNonStream(quickAction: QuickAction, selection: string, overrideModelTag?: string): Promise<string> {
		if (!this.quickActionExecutionService) {
			throw new Error('快捷操作执行服务未初始化');
		}

		const result = await this.quickActionExecutionService.executeQuickAction(quickAction, selection, overrideModelTag);

		if (!result.success) {
			throw new Error(result.error || '执行失败');
		}

		return result.content;
	}

	/**
	 * 执行快捷操作并流式返回结果
	 */
	private async executeQuickActionAndStream(
		quickAction: QuickAction,
		selection: string,
		callbacks: {
			onChunk: (chunk: string) => void;
			onComplete: () => void;
			onError: (error: string) => void;
		},
		overrideModelTag?: string
	): Promise<void> {
		if (!this.quickActionExecutionService) {
			callbacks.onError('快捷操作执行服务未初始化');
			return;
		}

		try {
			const generator = this.quickActionExecutionService.executeQuickActionStream(quickAction, selection, overrideModelTag);
			for await (const chunk of generator) {
				callbacks.onChunk(chunk);
			}
			callbacks.onComplete();
		} catch (e) {
			callbacks.onError(e instanceof Error ? e.message : String(e));
		}
	}

	/**
	 * 重新生成快捷操作结果
	 */
	private regenerateQuickActionResult(quickAction: QuickAction, selection: string, triggerSource?: 'selection' | 'symbol', fullText?: string): void {
		this.hideResultModal();
		this.showQuickActionResultModal(quickAction, selection, triggerSource, fullText);
	}

	/**
	 * 插入快捷操作结果到编辑器
	 */
	private insertQuickActionResult(result: string, mode: 'replace' | 'append' | 'insert', triggerSource?: 'selection' | 'symbol', fullText?: string): void {
		this.hideResultModal();

		const activeView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
		if (!activeView?.editor) {
			new Notice('请先打开一个 Markdown 文件');
			return;
		}

		const editor = activeView.editor;

		switch (mode) {
			case 'replace':
				if (triggerSource === 'symbol') {
					const fullContent = editor.getValue();
					const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n/;
					const match = fullContent.match(frontmatterRegex);

					if (match) {
						const frontmatterEnd = match[0].length;
						const frontmatter = fullContent.slice(0, frontmatterEnd);
						editor.setValue(frontmatter + result);
					} else {
						editor.setValue(result);
					}
					new Notice('已替换文件内容');
				} else {
					editor.replaceSelection(result);
					new Notice('已替换选中文本');
				}
				break;
			case 'append': {
				const selection = editor.getSelection();
				editor.replaceSelection(selection + '\n\n' + result);
				new Notice('已追加到选中内容');
				break;
			}
			case 'insert': {
				const cursor = editor.getCursor();
				editor.replaceRange(result, cursor);
				new Notice('已插入到光标位置');
				break;
			}
		}
	}

	/**
	 * 取消当前正在执行的快捷操作
	 */
	cancelCurrentQuickActionExecution(): void {
		if (this.quickActionExecutionService) {
			this.quickActionExecutionService.cancelCurrentExecution();
		}
	}

	/**
	 * 隐藏结果模态框
	 */
	private hideResultModal(): void {
		this.isResultModalVisible = false;
		this.currentIsLoading = false;
		this.selectedQuickActionModelTag = '';
		this.currentResult = '';
		this.currentError = undefined;
		this.currentRenderModal = null;
		this.cancelCurrentQuickActionExecution();

		if (this.resultModalRoot) {
			this.resultModalRoot.render(
				<StrictMode>
					<QuickActionResultModal
						app={this.plugin.app}
						visible={false}
						quickAction={{ id: '', name: '', prompt: '', promptSource: 'custom', showInToolbar: false, order: 0, createdAt: 0, updatedAt: 0 }}
						selection=""
						result=""
						isLoading={false}
						onClose={() => {}}
						onRegenerate={() => {}}
						onInsert={() => {}}
						onCopy={() => {}}
					/>
				</StrictMode>
			);
		}
	}

	/**
	 * 获取 frontmatter 长度
	 */
	private getFrontmatterLength(docText: string): number {
		const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n/;
		const match = docText.match(frontmatterRegex);
		return match ? match[0].length : 0;
	}

	/**
	 * 解析 providers
	 */
	private resolveProviders(): ProviderSettings[] {
		return (this.plugin.settings.tars?.settings?.providers ?? []) as ProviderSettings[];
	}

	/**
	 * 解析默认 Modify 模型标签
	 */
	private resolveDefaultModifyModelTag(providers: ProviderSettings[]): string {
		const fromChat = this.plugin.settings.chat?.defaultModel ?? '';
		if (fromChat && providers.some(p => p.tag === fromChat)) {
			return fromChat;
		}
		return providers[0]?.tag ?? '';
	}

	/**
	 * 根据设置键更新配置
	 */
	updateSettings(settings: Partial<ChatSettings>): void {
		if ('enableChatTrigger' in settings || 'chatTriggerSymbol' in settings) {
			this.updateChatTriggerExtension();
		}

		if ('enableQuickActions' in settings || 'maxQuickActionButtons' in settings || 'quickActions' in settings) {
			this.updateSelectionToolbarExtension();
		}
	}

	/**
	 * 清理资源
	 */
	dispose(): void {
		this.hideSelectionToolbar();
		this.hideResultModal();
		this.quickActionExecutionService = null;
		this.quickActionDataService = null;
	}
}
