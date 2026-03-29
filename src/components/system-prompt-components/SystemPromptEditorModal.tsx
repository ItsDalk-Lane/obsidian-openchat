import { App, Modal } from 'obsidian';
import { StrictMode, useEffect, useMemo, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { v4 as uuidv4 } from 'uuid';
import { ObsidianAppContext } from 'src/contexts/obsidianAppContext';
import { useObsidianApp } from 'src/contexts/obsidianAppContext';
import { localInstance } from 'src/i18n/locals';
import { createObsidianApiProvider } from 'src/providers/obsidian-api';
import type { AiFeatureId, SystemPromptItem, SystemPromptSourceType } from 'src/types/system-prompt';
import { getPromptTemplatePath } from 'src/utils/AIPathManager';
import './SystemPromptModals.css';

export type SystemPromptEditorMode = 'create' | 'edit';

export class SystemPromptEditorModal extends Modal {
	private root: Root | null = null;

	constructor(
		app: App,
		private readonly params: {
			mode: SystemPromptEditorMode;
			prompt?: SystemPromptItem;
			existingPrompts: SystemPromptItem[];
			onSubmit: (prompt: SystemPromptItem) => Promise<void>;
		}
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl, titleEl } = this;
		contentEl.empty();
		contentEl.addClass('system-prompt-modal-content');
		this.modalEl.addClass('system-prompt-modal');

		titleEl.textContent = this.params.mode === 'create'
			? (localInstance.system_prompt_create_title || '新建系统提示词')
			: (localInstance.system_prompt_edit_title || '编辑系统提示词');

		this.root = createRoot(contentEl);
		this.root.render(
			<StrictMode>
				<ObsidianAppContext.Provider value={this.app}>
					<SystemPromptEditorForm
						mode={this.params.mode}
						prompt={this.params.prompt}
						existingPrompts={this.params.existingPrompts}
						onCancel={() => this.close()}
						onSubmit={async (prompt) => {
							await this.params.onSubmit(prompt);
							this.close();
						}}
					/>
				</ObsidianAppContext.Provider>
			</StrictMode>
		);
	}

	onClose(): void {
		this.root?.unmount();
		this.root = null;
		this.contentEl.empty();
	}
}

const collectPromptTemplateFiles = (
	aiDataFolder: string,
	obsidianApi: ReturnType<typeof createObsidianApiProvider>,
): Array<{ path: string; label: string }> => {
	const folder = getPromptTemplatePath(aiDataFolder);
	const results: Array<{ path: string; label: string }> = [];
	const visit = (folderPath: string) => {
		for (const entry of obsidianApi.listFolderEntries(folderPath)) {
			if (entry.kind === 'folder') {
				visit(entry.path);
				continue;
			}
			if (!entry.path.endsWith('.md')) {
				continue;
			}
			results.push({
				path: entry.path,
				label: entry.path.replace(`${folder}/`, ''),
			});
		}
	};
	visit(folder);
	return results;
};

function SystemPromptEditorForm(props: {
	mode: SystemPromptEditorMode;
	prompt?: SystemPromptItem;
	existingPrompts: SystemPromptItem[];
	onCancel: () => void;
	onSubmit: (prompt: SystemPromptItem) => Promise<void>;
}) {
	const app = useObsidianApp();
	const obsidianApi = useMemo(() => createObsidianApiProvider(app, async () => ''), [app]);
	const isEdit = props.mode === 'edit';
	const initial = props.prompt;

	const [name, setName] = useState(initial?.name ?? '');
	const [sourceType, setSourceType] = useState<SystemPromptSourceType>(initial?.sourceType ?? 'custom');
	const [content, setContent] = useState(initial?.content ?? '');
	const [templatePath, setTemplatePath] = useState(initial?.templatePath ?? '');
	const [enabled, setEnabled] = useState<boolean>(initial?.enabled ?? true);
	const [excludeFeatures, setExcludeFeatures] = useState<AiFeatureId[]>(initial?.excludeFeatures ?? []);
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		if (!initial) {
			return;
		}
		setName(initial.name ?? '');
		setSourceType(initial.sourceType ?? 'custom');
		setContent(initial.content ?? '');
		setTemplatePath(initial.templatePath ?? '');
		setEnabled(initial.enabled ?? true);
		setExcludeFeatures(initial.excludeFeatures ?? []);
	}, [initial]);

	const featureOptions = useMemo(() => {
		return [
			{
				id: 'ai_chat' as const,
				label: localInstance.system_prompt_feature_ai_chat || 'AI 聊天',
				desc: localInstance.system_prompt_feature_ai_chat_desc || '完整的 AI 聊天界面（模态框/侧边栏模式），支持多模型切换和系统提示词，支持图片上传和视觉理解，支持图像生成、文件/文件夹上下文，聊天历史保存和加载、消息编辑和重新生成',
			},
			{
				id: 'ai_action' as const,
				label: localInstance.system_prompt_feature_ai_action || 'AI 表单动作',
				desc: localInstance.system_prompt_feature_ai_action_desc || '表单工作流中调用 AI 模型进行处理，支持运行时选择模型和提示词模板，支持变量替换（{{@fieldName}}、{{output:variableName}}），支持内链解析功能，流式输出模态框显示 AI 生成过程',
			},
			{
				id: 'tab_completion' as const,
				label: localInstance.system_prompt_feature_tab_completion || 'Tab 自动补全',
				desc: localInstance.system_prompt_feature_tab_completion_desc || '编辑器中按快捷键触发 AI 续写，可配置触发键和上下文长度，智能上下文构建和后处理优化',
			},
			{
				id: 'selection_toolbar' as const,
				label: localInstance.system_prompt_feature_selection_toolbar || '选中文本操作',
				desc: localInstance.system_prompt_feature_selection_toolbar_desc || '使用光标选中部分文本或者输出触发符号选中整个文本后显示操作工具栏，支持自定义 AI 操作（普通操作/操作组/表单操作），支持占位符替换和流式输出',
			},
		];
	}, []);

	const templateFiles = useMemo(() => {
		type OpenChatPluginLike = { settings?: { aiDataFolder?: string } }
		type AppWithPlugins = typeof app & { plugins?: { plugins?: Record<string, OpenChatPluginLike | undefined> } }
		const plugin = (app as AppWithPlugins).plugins?.plugins?.['openchat'];
		return collectPromptTemplateFiles(
			plugin?.settings?.aiDataFolder || 'System/AI Data',
			obsidianApi,
		);
	}, [app, obsidianApi]);

	const validate = (): boolean => {
		const trimmedName = name.trim();
		if (!trimmedName) {
			obsidianApi.notify(localInstance.system_prompt_error_name_required || '提示词名称不能为空');
			return false;
		}

		const other = isEdit
			? props.existingPrompts.filter((p) => p.id !== initial?.id)
			: props.existingPrompts;
		if (other.some((p) => p.name === trimmedName)) {
			obsidianApi.notify(localInstance.system_prompt_error_name_duplicate || '提示词名称已存在');
			return false;
		}

		if (sourceType === 'custom') {
			if (!content.trim()) {
				obsidianApi.notify(localInstance.system_prompt_error_content_required || '提示词内容不能为空');
				return false;
			}
		}

		if (sourceType === 'template') {
			if (!templatePath.trim()) {
				obsidianApi.notify(localInstance.system_prompt_error_template_required || '请选择模板文件');
				return false;
			}
			const file = obsidianApi.getVaultEntry(templatePath.trim());
			if (!file || file.kind !== 'file') {
				obsidianApi.notify(localInstance.system_prompt_error_template_missing || '模板文件不存在');
				return false;
			}
		}

		return true;
	};

	const toggleExclude = (featureId: AiFeatureId, checked: boolean) => {
		setExcludeFeatures((prev) => {
			const set = new Set(prev);
			if (checked) {
				set.add(featureId);
			} else {
				set.delete(featureId);
			}
			return Array.from(set);
		});
	};

	const handleSubmit = async () => {
		if (saving) {
			return;
		}
		if (!validate()) {
			return;
		}

		setSaving(true);
		try {
			const now = Date.now();
			const prompt: SystemPromptItem = {
				id: initial?.id ?? uuidv4(),
				name: name.trim(),
				sourceType,
				content: sourceType === 'custom' ? content.trim() : undefined,
				templatePath: sourceType === 'template' ? templatePath.trim() : undefined,
				enabled,
				excludeFeatures,
				order: initial?.order ?? props.existingPrompts.length,
				createdAt: initial?.createdAt ?? now,
				updatedAt: now,
			};
			await props.onSubmit(prompt);
			obsidianApi.notify(isEdit
				? (localInstance.system_prompt_saved || '已保存')
				: (localInstance.system_prompt_created || '已创建'));
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="system-prompt-editor">
			<div className="system-prompt-form">
				<div className="system-prompt-field">
					<label className="system-prompt-label">{localInstance.system_prompt_name_label || '提示词名称'} *</label>
					<input
						className="system-prompt-input"
						type="text"
						value={name}
						onChange={(e) => setName(e.target.value)}
						placeholder={localInstance.system_prompt_name_placeholder || '请输入唯一名称'}
					/>
				</div>

				<div className="system-prompt-field">
					<label className="system-prompt-label">{localInstance.system_prompt_source_label || '提示词来源'}</label>
					<div className="system-prompt-radio-row">
						<label className="system-prompt-radio">
							<input
								type="radio"
								name="sourceType"
								checked={sourceType === 'custom'}
								onChange={() => setSourceType('custom')}
							/>
							<span>{localInstance.system_prompt_source_custom || '自定义'}</span>
						</label>
						<label className="system-prompt-radio">
							<input
								type="radio"
								name="sourceType"
								checked={sourceType === 'template'}
								onChange={() => setSourceType('template')}
							/>
							<span>{localInstance.system_prompt_source_template || '引入模板'}</span>
						</label>
					</div>
				</div>

				{sourceType === 'custom' && (
					<div className="system-prompt-field">
						<label className="system-prompt-label">{localInstance.system_prompt_content_label || '提示词内容'} *</label>
						<textarea
							className="system-prompt-textarea"
							rows={10}
							value={content}
							onChange={(e) => setContent(e.target.value)}
							placeholder={localInstance.system_prompt_content_placeholder || '请输入系统提示词内容'}
						/>
					</div>
				)}

				{sourceType === 'template' && (
					<div className="system-prompt-field">
						<label className="system-prompt-label">{localInstance.system_prompt_template_label || '模板文件'} *</label>
						<select
							className="system-prompt-select"
							value={templatePath}
							onChange={(e) => setTemplatePath(e.target.value)}
						>
							<option value="">{localInstance.system_prompt_template_placeholder || '请选择模板文件'}</option>
							{templateFiles.map((f) => (
								<option key={f.path} value={f.path}>
									{f.label}
								</option>
							))}
						</select>
					</div>
				)}

				<div className="system-prompt-field">
					<label className="system-prompt-label">{localInstance.system_prompt_status_label || '启用状态'}</label>
					<div className="system-prompt-radio-row">
						<label className="system-prompt-radio">
							<input
								type="radio"
								name="enabled"
								checked={enabled === true}
								onChange={() => setEnabled(true)}
							/>
							<span>{localInstance.system_prompt_enabled || '启用'}</span>
						</label>
						<label className="system-prompt-radio">
							<input
								type="radio"
								name="enabled"
								checked={enabled === false}
								onChange={() => setEnabled(false)}
							/>
							<span>{localInstance.system_prompt_disabled || '禁用'}</span>
						</label>
					</div>
				</div>

				<div className="system-prompt-field">
					<label className="system-prompt-label">{localInstance.system_prompt_exclude_label || '功能排除'}</label>
					<div className="system-prompt-checkbox-grid">
						{featureOptions.map((opt) => {
							const checked = excludeFeatures.includes(opt.id);
							return (
								<label key={opt.id} className="system-prompt-checkbox">
									<input
										type="checkbox"
										checked={checked}
										onChange={(e) => toggleExclude(opt.id, e.target.checked)}
									/>
									<div className="system-prompt-checkbox-text">
										<div className="system-prompt-checkbox-title">{opt.label}</div>
										<div className="system-prompt-checkbox-desc">{opt.desc}</div>
									</div>
								</label>
							);
						})}
					</div>
				</div>
			</div>

			<div className="system-prompt-footer">
				<button className="mod-cta" onClick={props.onCancel} disabled={saving}>
					{localInstance.cancel || '取消'}
				</button>
				<button className="mod-cta" onClick={handleSubmit} disabled={saving}>
					{isEdit ? (localInstance.save || '保存') : (localInstance.create || '创建')}
				</button>
			</div>
		</div>
	);
}
