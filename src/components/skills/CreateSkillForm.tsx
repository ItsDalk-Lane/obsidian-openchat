import { useEffect, useState } from 'react'
import type { CreateSkillInput, SkillExecutionMode } from 'src/domains/skills/types'
import {
	DEFAULT_NEW_SKILL_BODY,
	DEFAULT_SKILL_ENABLED,
	DEFAULT_SKILL_EXECUTION_MODE,
	SKILL_NAME_PATTERN,
} from 'src/domains/skills/config'
import Dialog from 'src/components/dialog/Dialog'
import { ToggleSwitch } from 'src/components/toggle-switch/ToggleSwitch'
import { localInstance } from 'src/i18n/locals'
import type { SkillEditorDraft } from './SkillEditorModal'
import { parseSkillEditorSubmitValue } from './SkillEditorModal'
import '../chat-components/ChatSettingsModal.css'
import './SkillEditorModal.css'

export interface CreateSkillDraft extends SkillEditorDraft {
	name: string
}

interface CreateSkillFormProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	onSubmit: (value: CreateSkillInput) => Promise<void>
}

const buildCreateSkillDraft = (): CreateSkillDraft => ({
	name: '',
	description: '',
	enabled: DEFAULT_SKILL_ENABLED,
	whenToUseInput: '',
	argumentsInput: '',
	executionMode: DEFAULT_SKILL_EXECUTION_MODE as SkillExecutionMode,
	allowedToolsInput: '',
	bodyContent: DEFAULT_NEW_SKILL_BODY,
})

export function parseCreateSkillSubmitValue(
	draft: CreateSkillDraft,
): CreateSkillInput {
	const name = draft.name.trim()
	if (!name) {
		throw new Error(localInstance.chat_settings_skill_name_required)
	}
	if (!SKILL_NAME_PATTERN.test(name)) {
		throw new Error(localInstance.chat_settings_skill_name_invalid)
	}
	const parsed = parseSkillEditorSubmitValue(draft)
	return {
		name,
		description: parsed.description,
		bodyContent: parsed.bodyContent,
		enabled: parsed.enabled,
		...(parsed.whenToUse !== null ? { when_to_use: parsed.whenToUse } : {}),
		...(parsed.arguments !== null ? { arguments: parsed.arguments } : {}),
		execution: { mode: parsed.executionMode },
		...(parsed.allowedTools !== null ? { allowed_tools: parsed.allowedTools } : {}),
	}
}

export const CreateSkillForm = ({
	open,
	onOpenChange,
	onSubmit,
}: CreateSkillFormProps) => {
	const [draft, setDraft] = useState<CreateSkillDraft>(buildCreateSkillDraft)
	const [actionError, setActionError] = useState<string | null>(null)
	const [isSubmitting, setIsSubmitting] = useState(false)

	useEffect(() => {
		if (!open) {
			return
		}
		setDraft(buildCreateSkillDraft())
		setActionError(null)
		setIsSubmitting(false)
	}, [open])

	const updateDraft = (partial: Partial<CreateSkillDraft>) => {
		setDraft((current) => ({ ...current, ...partial }))
	}

	if (!open) {
		return null
	}

	return (
		<Dialog
			open={open}
			onOpenChange={onOpenChange}
			title={localInstance.chat_settings_skill_create_modal_title}
			description={localInstance.chat_settings_skill_create_modal_desc}
			dialogClassName="skill-editor-modal"
			modal
			closeOnInteractOutside={false}
		>
			{(close) => (
				<div className="skill-editor-modal__body">
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
							disabled={isSubmitting}
							ariaLabel={localInstance.chat_settings_skill_create}
							onChange={(checked) => {
								updateDraft({ enabled: checked })
							}}
						/>
					</div>

					<div className="chat-settings-fields">
						<label className="chat-settings-field">
							<span className="chat-settings-field__title">
								{localInstance.chat_settings_skill_name}
							</span>
							<span className="chat-settings-field__desc">
								{localInstance.chat_settings_skill_name_desc}
							</span>
							<input
								className="chat-settings-input"
								type="text"
								value={draft.name}
								disabled={isSubmitting}
								onChange={(event) => {
									updateDraft({ name: event.currentTarget.value })
								}}
							/>
						</label>

						<label className="chat-settings-field">
							<span className="chat-settings-field__title">
								{localInstance.chat_settings_skill_description}
							</span>
							<input
								className="chat-settings-input"
								type="text"
								value={draft.description}
								disabled={isSubmitting}
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
								disabled={isSubmitting}
								onChange={(event) => {
									updateDraft({ whenToUseInput: event.currentTarget.value })
								}}
							/>
						</label>

						<label className="chat-settings-field">
							<span className="chat-settings-field__title">
								{localInstance.chat_settings_skill_execution_mode}
							</span>
							<select
								className="chat-settings-input"
								value={draft.executionMode}
								disabled={isSubmitting}
								onChange={(event) => {
									updateDraft({
										executionMode: event.currentTarget.value as SkillExecutionMode,
									})
								}}
							>
								<option value="inline">inline</option>
								<option value="isolated">isolated</option>
								<option value="isolated_resume">isolated_resume</option>
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
								disabled={isSubmitting}
								onChange={(event) => {
									updateDraft({ argumentsInput: event.currentTarget.value })
								}}
							/>
						</label>

						<label className="chat-settings-field">
							<span className="chat-settings-field__title">
								{localInstance.chat_settings_skill_allowed_tools}
							</span>
							<span className="chat-settings-field__desc">
								{localInstance.chat_settings_skill_allowed_tools_desc}
							</span>
							<textarea
								className="chat-settings-input skill-editor-modal__textarea"
								rows={4}
								value={draft.allowedToolsInput}
								disabled={isSubmitting}
								onChange={(event) => {
									updateDraft({ allowedToolsInput: event.currentTarget.value })
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
								disabled={isSubmitting}
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
						<div className="skill-editor-modal__footer-group" />
						<div className="skill-editor-modal__footer-group">
							<button
								type="button"
								className="chat-settings-toolbar__button"
								disabled={isSubmitting}
								onClick={close}
							>
								{localInstance.chat_cancel_edit}
							</button>
							<button
								type="button"
								className="mod-cta"
								disabled={isSubmitting}
								onClick={() => {
									void (async () => {
										setIsSubmitting(true)
										setActionError(null)
										try {
											await onSubmit(parseCreateSkillSubmitValue(draft))
											close()
										} catch (error) {
											setActionError(
												error instanceof Error ? error.message : String(error),
											)
										} finally {
											setIsSubmitting(false)
										}
									})()
								}}
							>
								{localInstance.chat_settings_skill_create_submit}
							</button>
						</div>
					</div>
				</div>
			)}
		</Dialog>
	)
}
