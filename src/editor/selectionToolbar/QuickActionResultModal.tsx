import { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Component } from 'obsidian';
import { X, Copy, Replace, Plus, RefreshCw, Check, Square } from 'lucide-react';
import type { QuickAction } from 'src/types/chat';
import type { ObsidianApiProvider } from 'src/providers/providers.types';
import type { ProviderSettings } from 'src/types/provider';
import { localInstance } from 'src/i18n/locals';
import { ModelSelector } from 'src/components/chat-components/ModelSelector';
import './QuickActionResultModal.css';

interface QuickActionResultModalProps {
	obsidianApi: ObsidianApiProvider;
	visible: boolean;
	quickAction: QuickAction;
	selection: string;
	result: string;
	isLoading: boolean;
	error?: string;
	providers: ProviderSettings[];
	selectedModelTag?: string;
	onModelChange?: (tag: string) => void;
	requiresModelSelection?: boolean;
	onClose: () => void;
	onStop?: () => void;
	onRegenerate: () => void;
	onInsert: (mode: 'replace' | 'append' | 'insert') => void;
	onCopy: () => void;
}

export const QuickActionResultModal = ({
	obsidianApi,
	visible,
	quickAction,
	selection,
	result,
	isLoading,
	error,
	providers,
	selectedModelTag,
	onModelChange,
	requiresModelSelection,
	onClose,
	onStop,
	onRegenerate,
	onInsert,
	onCopy
}: QuickActionResultModalProps) => {
	const [copySuccess, setCopySuccess] = useState(false);
	const contentRef = useRef<HTMLDivElement>(null);
	const componentRef = useRef<Component | null>(null);

	// 处理复制
	const handleCopy = useCallback(async () => {
		try {
			await navigator.clipboard.writeText(result);
			setCopySuccess(true);
			obsidianApi.notify(localInstance.copy_success);
			setTimeout(() => setCopySuccess(false), 2000);
			onCopy();
		} catch {
			obsidianApi.notify(localInstance.copy_failed);
		}
	}, [obsidianApi, onCopy, result]);

	// 处理替换选中文本
	const handleReplace = useCallback(() => {
		onInsert('replace');
	}, [onInsert]);

	// 处理追加到选中文本后
	const handleAppend = useCallback(() => {
		onInsert('append');
	}, [onInsert]);

	// 渲染 Markdown 内容（流式输出时也实时渲染）
	useEffect(() => {
		if (!contentRef.current || !result) {
			return;
		}

		// 清空之前的内容
		contentRef.current.innerHTML = '';

		// 创建组件实例用于渲染
		if (!componentRef.current) {
			componentRef.current = new Component();
			componentRef.current.load();
		}

		void obsidianApi.renderMarkdown(
			result,
			contentRef.current,
			obsidianApi.getActiveFilePath() ?? '',
			componentRef.current,
		);

		// 仅在组件卸载时清理
	}, [obsidianApi, result]);

	// 组件卸载时清理
	useEffect(() => {
		return () => {
			if (componentRef.current) {
				componentRef.current.unload();
				componentRef.current = null;
			}
		};
	}, []);

	// 处理 ESC 键关闭
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				onClose();
			}
		};

		if (visible) {
			document.addEventListener('keydown', handleKeyDown);
			return () => document.removeEventListener('keydown', handleKeyDown);
		}
	}, [visible, onClose]);

	if (!visible) {
		return null;
	}

	const modalContent = (
		<div className="quick-action-result-modal-overlay" onClick={onClose}>
			<div className="quick-action-result-modal" onClick={(e) => e.stopPropagation()}>
				{/* 头部 */}
				<div className="quick-action-result-modal-header">
					<div className="quick-action-result-modal-title-section">
						<span className="quick-action-result-modal-action-name">{quickAction.name}</span>

						{/* 模型选择器 */}
						{requiresModelSelection && (
							<div className="quick-action-result-model-selector">
								<ModelSelector
									providers={providers}
									value={selectedModelTag || ''}
									onChange={onModelChange || (() => {})}
								/>
							</div>
						)}

						{isLoading && (
							<span className="quick-action-result-modal-loading">
								{localInstance.handling}
							</span>
						)}
					</div>
					<div className="quick-action-result-modal-header-actions">
						{isLoading && onStop && (
							<button
								className="quick-action-result-modal-stop"
								onClick={onStop}
								title={localInstance.quick_action_result_stop}
							>
								<Square size={14} />
								<span>{localInstance.quick_action_result_stop}</span>
							</button>
						)}
						<button
							className="quick-action-result-modal-close"
							onClick={onClose}
							title={localInstance.close}
						>
							<X size={18} />
						</button>
					</div>
				</div>

				{/* 内容区域 */}
				<div className="quick-action-result-modal-body">
					{requiresModelSelection && !selectedModelTag ? (
						<div className="quick-action-result-modal-waiting-model">
							<div className="quick-action-result-modal-waiting-icon">🤖</div>
							<span>{localInstance.quick_action_result_waiting_model}</span>
							<span className="quick-action-result-modal-hint-text">
								{localInstance.quick_action_result_select_model_hint}
							</span>
						</div>
					) : error ? (
						<div className="quick-action-result-modal-error">
							<span className="quick-action-result-modal-error-icon">⚠️</span>
							<span>{error}</span>
						</div>
					) : (isLoading && !result) ? (
						<div className="quick-action-result-modal-loading-content">
							<div className="quick-action-result-modal-spinner" />
							<span>{localInstance.ai_executing}</span>
						</div>
					) : (
						<>
							<div
								ref={contentRef}
								className="quick-action-result-modal-content markdown-preview-view"
							/>
							{isLoading && (
								<div className="quick-action-result-modal-streaming-indicator">
									<span className="quick-action-result-modal-streaming-dot" />
									<span>{localInstance.ai_streaming_generating}</span>
								</div>
							)}
						</>
					)}
				</div>

				{/* 底部操作栏 */}
				<div className="quick-action-result-modal-footer">
					<div className="quick-action-result-modal-actions-left">
						<button
							className="quick-action-result-modal-btn"
							onClick={onRegenerate}
							disabled={isLoading}
							title={localInstance.quick_action_result_regenerate}
						>
							<RefreshCw size={14} />
							<span>{localInstance.quick_action_result_regenerate}</span>
						</button>
					</div>
					
					<div className="quick-action-result-modal-actions-right">
						<button
							className="quick-action-result-modal-btn"
							onClick={handleCopy}
							disabled={isLoading || !result}
							title={localInstance.copy}
						>
							{copySuccess ? <Check size={14} /> : <Copy size={14} />}
							<span>{copySuccess ? localInstance.copy_success : localInstance.copy}</span>
						</button>
						
						<button
							className="quick-action-result-modal-btn"
							onClick={handleAppend}
							disabled={isLoading || !result}
							title={localInstance.quick_action_result_append}
						>
							<Plus size={14} />
							<span>{localInstance.quick_action_result_append}</span>
						</button>
						
						<button
							className="quick-action-result-modal-btn quick-action-result-modal-btn-primary"
							onClick={handleReplace}
							disabled={isLoading || !result}
							title={localInstance.quick_action_result_replace}
						>
							<Replace size={14} />
							<span>{localInstance.quick_action_result_replace}</span>
						</button>
					</div>
				</div>
			</div>
		</div>
	);

	return createPortal(modalContent, document.body);
};

export default QuickActionResultModal;
