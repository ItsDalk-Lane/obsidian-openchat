import { ChatEditorIntegrationBase } from './ChatEditorIntegrationBase';
import { requestModifyTextHelper } from './ChatEditorModifyRequester';
import { Notice, MarkdownView } from 'obsidian';
import { Transaction } from '@codemirror/state';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { setModifyGhostEffect } from 'src/editor/selectionToolbar/ModifyGhostTextExtension';
import type { QuickAction, ChatSettings } from 'src/types/chat';
import type { ProviderSettings } from 'src/types/provider';
import { ChatModal } from 'src/components/chat-components/ChatModal';
import { QuickActionResultModal } from 'src/editor/selectionToolbar/QuickActionResultModal';
import { localInstance } from 'src/i18n/locals';

export class ChatEditorIntegration extends ChatEditorIntegrationBase {
	protected async executeModifyRequest(instruction: string): Promise<void> {
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
			new Notice(localInstance.no_ai_model_configured);
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

			const result = await requestModifyTextHelper(this.plugin.app, provider, instruction, ctx.contentForAI);
			if (!result.trim()) {
				new Notice(localInstance.ai_no_usable_content);
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
	 * 删除触发符号
	 */
	protected deleteTriggerSymbol(): void {
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
	protected openChatWithSelection(selection: string, triggerSource?: 'selection' | 'symbol', fullText?: string): void {
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
	protected async executeQuickAction(quickAction: QuickAction, selection: string, triggerSource?: 'selection' | 'symbol', fullText?: string): Promise<void> {
		if (triggerSource === 'symbol' && this.currentTriggerSymbolRange && this.currentEditorView) {
			this.deleteTriggerSymbol();
		}

		this.hideSelectionToolbar();

		if (!this.quickActionExecutionService) {
			new Notice(localInstance.quick_action_service_not_initialized);
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
			new Notice(localInstance.chat_trigger_no_active_file);
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
					new Notice(localInstance.replaced_file_content);
				} else {
					editor.replaceSelection(result);
					new Notice(localInstance.quick_action_result_replaced);
				}
				break;
			case 'append': {
				const selection = editor.getSelection();
				editor.replaceSelection(selection + '\n\n' + result);
				new Notice(localInstance.quick_action_result_appended);
				break;
			}
			case 'insert': {
				const cursor = editor.getCursor();
				editor.replaceRange(result, cursor);
				new Notice(localInstance.quick_action_result_inserted);
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
							providers={this.plugin.settings.aiRuntime.providers}
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
	protected getFrontmatterLength(docText: string): number {
		const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n/;
		const match = docText.match(frontmatterRegex);
		return match ? match[0].length : 0;
	}

	/**
	 * 解析 providers
	 */
	protected resolveProviders(): ProviderSettings[] {
		return (this.plugin.settings.aiRuntime?.providers ?? []) as ProviderSettings[];
	}

	/**
	 * 解析默认 Modify 模型标签
	 */
	protected resolveDefaultModifyModelTag(providers: ProviderSettings[]): string {
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

