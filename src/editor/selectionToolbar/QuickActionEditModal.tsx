import { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { App, Notice } from 'obsidian';
import { X, Heart } from 'lucide-react';
import type { QuickAction } from 'src/types/chat';
import type { ProviderSettings } from 'src/types/provider';
import { localInstance } from 'src/i18n/locals';
import { v4 as uuidv4 } from 'uuid';
import './QuickActionEditModal.css';

interface QuickActionEditModalProps {
	app: App;
	visible: boolean;
	quickAction?: QuickAction; // 如果是编辑模式则提供
	existingQuickActionNames: string[]; // 现有操作名称列表，用于验证重复
	promptTemplateFolder: string;
	providers: ProviderSettings[]; // 可用的AI模型列表
	onSave: (quickAction: QuickAction) => void;
	onClose: () => void;
}

export const QuickActionEditModal = ({
	app,
	visible,
	quickAction,
	existingQuickActionNames,
	promptTemplateFolder,
	providers,
	onSave,
	onClose
}: QuickActionEditModalProps) => {
	const isEditMode = !!quickAction;
	
	// 表单状态
	const [name, setName] = useState(quickAction?.name || '');
	const [prompt, setPrompt] = useState(quickAction?.prompt || '');
	const [modelTag, setModelTag] = useState(quickAction?.modelTag ?? '');
	const [showInToolbar, setShowInToolbar] = useState(quickAction?.showInToolbar ?? true);
	const [useDefaultSystemPrompt, setUseDefaultSystemPrompt] = useState(quickAction?.useDefaultSystemPrompt ?? true);
	const [errors, setErrors] = useState<{ name?: string; prompt?: string }>({});
	
	const nameInputRef = useRef<HTMLInputElement>(null);
	const promptTextareaRef = useRef<HTMLTextAreaElement>(null);

	// 重置表单
	useEffect(() => {
		if (visible) {
			setName(quickAction?.name || '');
			setPrompt(quickAction?.prompt || '');
			setModelTag(quickAction?.modelTag ?? '');
			setShowInToolbar(quickAction?.showInToolbar ?? true);
			setUseDefaultSystemPrompt(quickAction?.useDefaultSystemPrompt ?? true);
			setErrors({});

			// 自动聚焦到名称输入框
			setTimeout(() => {
				nameInputRef.current?.focus();
			}, 100);
		}
	}, [visible, quickAction]);

	// 验证表单
	const validateForm = useCallback(() => {
		const newErrors: { name?: string; prompt?: string } = {};
		
		// 验证名称
		if (!name.trim()) {
			newErrors.name = localInstance.quick_action_edit_name_required;
		} else if (name.length > 20) {
			newErrors.name = localInstance.quick_action_edit_name_too_long;
		} else {
			// 检查名称重复（编辑模式下排除自己）
			const otherNames = isEditMode
				? existingQuickActionNames.filter(n => n !== quickAction?.name)
				: existingQuickActionNames;
			if (otherNames.includes(name.trim())) {
				newErrors.name = localInstance.quick_action_edit_name_duplicate;
			}
		}
		
		// 验证提示词
		if (!prompt.trim()) {
			newErrors.prompt = localInstance.quick_action_edit_prompt_required;
		}
		
		setErrors(newErrors);
		return Object.keys(newErrors).length === 0;
	}, [name, prompt, existingQuickActionNames, isEditMode, quickAction]);

	// 处理保存
	const handleSave = useCallback(() => {
		if (!validateForm()) {
			return;
		}

		const now = Date.now();
		const savedQuickAction: QuickAction = {
			id: quickAction?.id || uuidv4(),
			name: name.trim(),
			prompt: prompt.trim(),
			promptSource: 'custom',
			modelTag: modelTag || undefined,
			showInToolbar,
			useDefaultSystemPrompt,
			order: quickAction?.order ?? existingQuickActionNames.length,
			createdAt: quickAction?.createdAt || now,
			updatedAt: now
		};

		onSave(savedQuickAction);
		new Notice(
			isEditMode
				? localInstance.quick_action_edit_updated
				: localInstance.quick_action_edit_created
		);
	}, [name, prompt, showInToolbar, useDefaultSystemPrompt, quickAction, existingQuickActionNames.length, validateForm, onSave, isEditMode]);

	// 插入模板引用
	const handleInsertTemplate = useCallback(async () => {
		// 获取提示词模板目录下的文件
		const files = app.vault.getMarkdownFiles().filter(f => 
			f.path.startsWith(promptTemplateFolder + '/') || f.path === promptTemplateFolder
		);
		
		if (files.length === 0) {
			new Notice(localInstance.ai_template_folder_empty);
			return;
		}
		
		// 简单选择第一个文件作为示例（实际应该弹出选择器）
		// 这里先插入占位符语法提示
		const templateSyntax = '{{template:模板文件名}}';
		
		if (promptTextareaRef.current) {
			const textarea = promptTextareaRef.current;
			const start = textarea.selectionStart;
			const end = textarea.selectionEnd;
			const newPrompt = prompt.substring(0, start) + templateSyntax + prompt.substring(end);
			setPrompt(newPrompt);
			
			// 选中模板文件名部分以便用户修改
			setTimeout(() => {
				textarea.focus();
				textarea.setSelectionRange(start + 11, start + 16);
			}, 0);
		} else {
			setPrompt(prompt + (prompt ? '\n' : '') + templateSyntax);
		}
	}, [app, promptTemplateFolder, prompt]);

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
		<div className="quick-action-edit-modal-overlay" onClick={onClose}>
			<div className="quick-action-edit-modal" onClick={(e) => e.stopPropagation()}>
				{/* 头部 */}
				<div className="quick-action-edit-modal-header">
					<span className="quick-action-edit-modal-title">
						{isEditMode
							? localInstance.quick_action_edit_title_edit
							: localInstance.quick_action_edit_title_add}
					</span>
					<button
						className="quick-action-edit-modal-close"
						onClick={onClose}
						title={localInstance.close}
					>
						<X size={18} />
					</button>
				</div>

				{/* 表单内容 */}
				<div className="quick-action-edit-modal-body">
					{/* 操作名称 */}
					<div className="quick-action-edit-field">
						<label className="quick-action-edit-label">
							{localInstance.quick_action_edit_name_label}
							<span className="quick-action-edit-required">*</span>
						</label>
						<div className="quick-action-edit-name-row">
							<input
								ref={nameInputRef}
								type="text"
								className={`quick-action-edit-input ${errors.name ? 'quick-action-edit-input-error' : ''}`}
								value={name}
								onChange={(e) => setName(e.target.value)}
								placeholder={localInstance.quick_action_edit_name_placeholder}
								maxLength={20}
							/>
							<span className="quick-action-edit-name-counter">{name.length}/20</span>
							<button
								className="quick-action-edit-icon-btn"
								title={localInstance.quick_action_edit_select_icon}
							>
								<Heart size={18} />
							</button>
						</div>
						{errors.name && (
							<span className="quick-action-edit-error">{errors.name}</span>
						)}
					</div>

					{/* 提示词内容 */}
					<div className="quick-action-edit-field">
						<label className="quick-action-edit-label">
							{localInstance.quick_action_edit_prompt_label}
							<span className="quick-action-edit-required">*</span>
						</label>
						<div className="quick-action-edit-prompt-hint">
							{localInstance.quick_action_edit_prompt_hint}
							<button
								className="quick-action-edit-link-btn"
								onClick={handleInsertTemplate}
							>
								{localInstance.quick_action_edit_show_example}
							</button>
						</div>
						<textarea
							ref={promptTextareaRef}
							className={`quick-action-edit-textarea ${errors.prompt ? 'quick-action-edit-input-error' : ''}`}
							value={prompt}
							onChange={(e) => setPrompt(e.target.value)}
							placeholder={localInstance.quick_action_edit_prompt_placeholder}
							rows={8}
						/>
						{errors.prompt && (
							<span className="quick-action-edit-error">{errors.prompt}</span>
						)}
					</div>

					{/* 使用默认系统提示词设置 */}
					<div className="quick-action-edit-field">
						<label className="quick-action-edit-label">
							{localInstance.quick_action_edit_use_default_system_prompt}
						</label>
						<div className="quick-action-edit-checkbox-row">
							<input
								type="checkbox"
								id="useDefaultSystemPrompt"
								checked={useDefaultSystemPrompt}
								onChange={(e) => setUseDefaultSystemPrompt(e.target.checked)}
								className="quick-action-edit-checkbox"
							/>
							<label htmlFor="useDefaultSystemPrompt" className="quick-action-edit-checkbox-label">
								{localInstance.quick_action_edit_use_default_system_prompt_hint}
							</label>
						</div>
					</div>

					{/* AI模型选择 */}
					<div className="quick-action-edit-field">
						<label className="quick-action-edit-label">
							{localInstance.quick_action_edit_model_label}
						</label>
						<select
							className="quick-action-edit-select"
							value={modelTag ?? ''}
							onChange={(e) => setModelTag(e.target.value)}
						>
							<option value="">
								{localInstance.quick_action_edit_model_default}
							</option>
							<option value="__EXEC_TIME__">
								{localInstance.quick_action_edit_model_exec_time}
							</option>
							{providers.map(provider => (
								<option key={provider.tag} value={provider.tag}>
									{provider.tag}
								</option>
							))}
						</select>
						<div className="quick-action-edit-model-hint">
							{localInstance.quick_action_edit_model_hint}
						</div>
					</div>
				</div>

				{/* 底部操作栏 */}
				<div className="quick-action-edit-modal-footer">
					<button
						className="quick-action-edit-btn quick-action-edit-btn-secondary"
						onClick={onClose}
					>
						{localInstance.cancel}
					</button>
					<button
						className="quick-action-edit-btn quick-action-edit-btn-primary"
						onClick={handleSave}
					>
						{localInstance.save}
					</button>
				</div>
			</div>
		</div>
	);

	return createPortal(modalContent, document.body);
};

export default QuickActionEditModal;
