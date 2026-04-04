import { useEffect, useState } from 'react'
import type {
	SkillArgumentDefaultValue,
	SkillArgumentDefinition,
	SkillDefinition,
	SkillExecutionMode,
} from 'src/domains/skills/types'
import Dialog from 'src/components/dialog/Dialog'
import { ToggleSwitch } from 'src/components/toggle-switch/ToggleSwitch'
import { localInstance } from 'src/i18n/locals'
import '../chat-components/ChatSettingsModal.css'
import './SkillEditorModal.css'

export interface SkillEditorDetail {
	readonly skill: SkillDefinition
	readonly sourceLabel: string
	readonly bodyContent: string
	readonly errorMessage: string | null
}

export interface SkillEditorDraft {
	description: string
	enabled: boolean
	whenToUseInput: string
	argumentsInput: string
	executionMode: SkillExecutionMode
	bodyContent: string
}

export interface SkillEditorSubmitValue {
	readonly description: string
	readonly enabled: boolean
	readonly whenToUse: string | null
	readonly arguments: readonly SkillArgumentDefinition[] | null
	readonly executionMode: SkillExecutionMode
	readonly bodyContent: string
}

interface SkillEditorModalProps {
	open: boolean
	detail: SkillEditorDetail | null
	onOpenChange: (open: boolean) => void
	onSave: (value: SkillEditorSubmitValue) => Promise<void>
	onTestRun: () => Promise<void>
	onOpenFile: () => void
}

const SKILL_EXECUTION_MODE_OPTIONS: readonly SkillExecutionMode[] = [
	'inline',
	'isolated',
	'isolated_resume',
]

const normalizeLineEndings = (value: string): string => value.replace(/\r\n/gu, '\n')

const formatArgumentsInput = (
	argumentDefinitions?: readonly SkillArgumentDefinition[],
): string => {
	if (argumentDefinitions === undefined) {
		return ''
	}
	return JSON.stringify(argumentDefinitions, null, 2)
}

const normalizeOptionalString = (value: string): string | null => {
	const trimmed = value.trim()
	return trimmed ? trimmed : null
}

const readRequiredArgumentName = (value: unknown, index: number): string => {
	if (typeof value !== 'string' || !value.trim()) {
		throw new Error(`参数定义第 ${index + 1} 项缺少有效的 name`)
	}
	return value.trim()
}

const readOptionalArgumentString = (
	value: unknown,
	fieldName: string,
	index: number,
): string | undefined => {
	if (value === undefined) {
		return undefined
	}
	if (typeof value !== 'string') {
		throw new Error(`参数定义第 ${index + 1} 项的 ${fieldName} 必须是字符串`)
	}
	const trimmed = value.trim()
	return trimmed ? trimmed : undefined
}

const readOptionalArgumentBoolean = (
	value: unknown,
	fieldName: string,
	index: number,
): boolean | undefined => {
	if (value === undefined) {
		return undefined
	}
	if (typeof value !== 'boolean') {
		throw new Error(`参数定义第 ${index + 1} 项的 ${fieldName} 必须是布尔值`)
	}
	return value
}

const readOptionalArgumentDefault = (
	value: unknown,
	index: number,
): SkillArgumentDefaultValue | undefined => {
	if (value === undefined) {
		return undefined
	}
	if (
		value === null
		|| typeof value === 'string'
		|| typeof value === 'number'
		|| typeof value === 'boolean'
	) {
		return value
	}
	throw new Error(`参数定义第 ${index + 1} 项的 default 类型不受支持`)
}

const parseSkillArgumentsInput = (
	value: string,
): readonly SkillArgumentDefinition[] | null => {
	const trimmed = value.trim()
	if (!trimmed) {
		return null
	}
	let parsed: unknown
	try {
		parsed = JSON.parse(trimmed)
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error)
		throw new Error(`参数定义解析失败：${reason}`)
	}
	if (!Array.isArray(parsed)) {
		throw new Error('参数定义必须是 JSON 数组')
	}
	return parsed.map((item, index) => {
		if (!item || typeof item !== 'object' || Array.isArray(item)) {
			throw new Error(`参数定义第 ${index + 1} 项必须是对象`)
		}
		const record = item as Record<string, unknown>
		return {
			name: readRequiredArgumentName(record.name, index),
			...(readOptionalArgumentString(record.description, 'description', index) !== undefined
				? { description: readOptionalArgumentString(record.description, 'description', index) }
				: {}),
			...(readOptionalArgumentBoolean(record.required, 'required', index) !== undefined
				? { required: readOptionalArgumentBoolean(record.required, 'required', index) }
				: {}),
			...(readOptionalArgumentDefault(record.default, index) !== undefined
				? { default: readOptionalArgumentDefault(record.default, index) }
				: {}),
		}
	})
}

export function buildSkillEditorDraft(detail: SkillEditorDetail): SkillEditorDraft {
	return {
		description: detail.skill.metadata.description,
		enabled: detail.skill.metadata.enabled ?? true,
		whenToUseInput: detail.skill.metadata.when_to_use ?? '',
		argumentsInput: formatArgumentsInput(detail.skill.metadata.arguments),
		executionMode: detail.skill.metadata.execution?.mode ?? 'isolated_resume',
		bodyContent: detail.bodyContent,
	}
}

export function parseSkillEditorSubmitValue(
	draft: SkillEditorDraft,
): SkillEditorSubmitValue {
	const description = draft.description.trim()
	if (!description) {
		throw new Error(localInstance.chat_settings_skill_description_required)
	}
	return {
		description,
		enabled: draft.enabled,
		whenToUse: normalizeOptionalString(draft.whenToUseInput),
		arguments: parseSkillArgumentsInput(draft.argumentsInput),
		executionMode: draft.executionMode,
		bodyContent: normalizeLineEndings(draft.bodyContent),
	}
}

export const SkillEditorModal = ({
	open,
	detail,
	onOpenChange,
	onSave,
	onTestRun,
	onOpenFile,
}: SkillEditorModalProps) => {
	const [draft, setDraft] = useState<SkillEditorDraft | null>(null)
	const [actionError, setActionError] = useState<string | null>(null)
	const [pendingAction, setPendingAction] = useState<'save' | 'test' | null>(null)

	useEffect(() => {
		if (!open || !detail) {
			return
		}
		setDraft(buildSkillEditorDraft(detail))
		setActionError(detail.errorMessage)
		setPendingAction(null)
	}, [detail, open])

	if (!detail || !draft) {
		return null
	}

	const executionModeLabel = localInstance.chat_settings_skill_execution_mode
	const disabled = pendingAction !== null

	const updateDraft = (partial: Partial<SkillEditorDraft>) => {
		setDraft((current) => current ? { ...current, ...partial } : current)
	}

	const runAction = async (
		action: 'save' | 'test',
		executor: () => Promise<void>,
	) => {
		setPendingAction(action)
		setActionError(null)
		try {
			await executor()
		} catch (error) {
			setActionError(error instanceof Error ? error.message : String(error))
		} finally {
			setPendingAction(null)
		}
	}

	return (
		<Dialog
			open={open}
			onOpenChange={onOpenChange}
			title={localInstance.chat_settings_skill_modal_title.replace(
				'{name}',
				detail.skill.metadata.name,
			)}
			description={localInstance.chat_settings_skill_modal_desc}
			dialogClassName="skill-editor-modal"
			modal
			closeOnInteractOutside={false}
		>
			{(close) => (
				<div className="skill-editor-modal__body">
					<div className="skill-editor-modal__readonly-grid">
						<div className="chat-settings-code-block">
							<div className="chat-settings-code-block__title">
								{localInstance.chat_settings_skill_source}
							</div>
							<code className="skill-editor-modal__readonly-value">
								{detail.sourceLabel}
							</code>
						</div>
						<div className="chat-settings-code-block">
							<div className="chat-settings-code-block__title">
								{localInstance.chat_settings_skill_path}
							</div>
							<code className="skill-editor-modal__readonly-value">
								{detail.skill.skillFilePath}
							</code>
						</div>
					</div>

					<div className="chat-settings-switch chat-settings-switch--stacked">
						<div className="chat-settings-field">
							<span className="chat-settings-field__title">
								{localInstance.chat_settings_skill_status}
							</span>
							<span className="chat-settings-field__desc">
								{draft.enabled ? localInstance.enabled : localInstance.disabled}
							</span>
						</div>
						<ToggleSwitch
							checked={draft.enabled}
							disabled={disabled}
							ariaLabel={detail.skill.metadata.name}
							onChange={(checked) => {
								updateDraft({ enabled: checked })
							}}
						/>
					</div>

					<div className="chat-settings-fields">
						<label className="chat-settings-field">
							<span className="chat-settings-field__title">
								{localInstance.chat_settings_skill_description}
							</span>
							<input
								className="chat-settings-input"
								type="text"
								value={draft.description}
								disabled={disabled}
								onChange={(event) => {
									updateDraft({ description: event.currentTarget.value })
								}}
							/>
						</label>

						<label className="chat-settings-field">
							<span className="chat-settings-field__title">
								{localInstance.chat_settings_skill_when_to_use}
							</span>
							<textarea
								className="chat-settings-input skill-editor-modal__textarea"
								rows={4}
								value={draft.whenToUseInput}
								disabled={disabled}
								onChange={(event) => {
									updateDraft({ whenToUseInput: event.currentTarget.value })
								}}
							/>
						</label>

						<label className="chat-settings-field">
							<span className="chat-settings-field__title">
								{executionModeLabel}
							</span>
							<select
								className="chat-settings-input"
								value={draft.executionMode}
								disabled={disabled}
								onChange={(event) => {
									updateDraft({
										executionMode: event.currentTarget.value as SkillExecutionMode,
									})
								}}
							>
								{SKILL_EXECUTION_MODE_OPTIONS.map((mode) => (
									<option key={mode} value={mode}>
										{mode}
									</option>
								))}
							</select>
						</label>

						<label className="chat-settings-field">
							<span className="chat-settings-field__title">
								{localInstance.chat_settings_skill_arguments}
							</span>
							<span className="chat-settings-field__desc">
								{localInstance.chat_settings_skill_arguments_desc}
							</span>
							<textarea
								className="chat-settings-input skill-editor-modal__textarea"
								rows={6}
								value={draft.argumentsInput}
								disabled={disabled}
								onChange={(event) => {
									updateDraft({ argumentsInput: event.currentTarget.value })
								}}
							/>
						</label>

						<label className="chat-settings-field">
							<span className="chat-settings-field__title">
								{localInstance.chat_settings_skill_body}
							</span>
							<textarea
								className={
									'chat-settings-input skill-editor-modal__textarea '
									+ 'skill-editor-modal__textarea--body'
								}
								rows={12}
								value={draft.bodyContent}
								disabled={disabled}
								onChange={(event) => {
									updateDraft({ bodyContent: event.currentTarget.value })
								}}
							/>
						</label>
					</div>

					{actionError && (
						<div className="chat-settings-code-block">
							<div className="chat-settings-code-block__title">
								{localInstance.chat_settings_skill_error}
							</div>
							<pre className="chat-settings-code-block__content">{actionError}</pre>
						</div>
					)}

					<div className="skill-editor-modal__footer">
						<div className="skill-editor-modal__footer-group">
							<button
								type="button"
								className="chat-settings-toolbar__button"
								disabled={disabled}
								onClick={onOpenFile}
							>
								{localInstance.chat_settings_skill_open_file}
							</button>
							<button
								type="button"
								className="chat-settings-toolbar__button"
								disabled={disabled}
								onClick={() => {
									void runAction('test', async () => {
										await onTestRun()
										close()
									})
								}}
							>
								{localInstance.chat_settings_skill_test_run}
							</button>
						</div>

						<div className="skill-editor-modal__footer-group">
							<button
								type="button"
								className="chat-settings-toolbar__button"
								disabled={disabled}
								onClick={close}
							>
								{localInstance.chat_cancel_edit}
							</button>
							<button
								type="button"
								className="mod-cta"
								disabled={disabled}
								onClick={() => {
									void runAction('save', async () => {
										await onSave(parseSkillEditorSubmitValue(draft))
									})
								}}
							>
								{localInstance.chat_save_button_label}
							</button>
						</div>
					</div>
				</div>
			)}
		</Dialog>
	)
}
