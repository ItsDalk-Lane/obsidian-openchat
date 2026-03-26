import { QuickActionDataService } from 'src/editor/selectionToolbar/QuickActionDataService'
import { formatProviderOptionLabel } from 'src/components/chat-components/chatSettingsHelpers'
import { t } from 'src/i18n/ai-runtime/helper'
import { localInstance } from 'src/i18n/locals'
import type { QuickAction, QuickActionType } from 'src/types/chat'
import type { QuickActionEditModalContext, QuickActionEditModalOptions } from './types'
import { createQuickActionGroupMembersSection } from './editModalGroupMembers'
import { saveQuickActionFromEditModal } from './editModalSave'

export const openQuickActionEditModal = async (
	context: QuickActionEditModalContext,
	quickAction?: QuickAction,
	options?: QuickActionEditModalOptions
): Promise<void> => {
	const stopAllPropagation = (event: Event) => {
		event.stopPropagation()
	}
	const quickActionDataService = QuickActionDataService.getInstance(context.app)
	await quickActionDataService.initialize()
	const allQuickActions = await quickActionDataService.getSortedQuickActions()
	const existingNames = allQuickActions
		.filter((item) => item.id !== quickAction?.id)
		.map((item) => item.name)
	const isEditMode = !!quickAction
	const getInitialQuickActionType = (): QuickActionType => {
		if (quickAction?.actionType) return quickAction.actionType
		if (quickAction?.isActionGroup) return 'group'
		if (options?.initialIsActionGroup) return 'group'
		return 'normal'
	}
	let currentQuickActionType = getInitialQuickActionType()

	const overlay = document.createElement('div')
	overlay.className = 'quick-action-edit-modal-overlay'
	overlay.style.cssText =
		'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px;pointer-events:auto;'
	for (const eventName of ['mousedown', 'mouseup', 'click', 'focusin', 'focusout']) {
		overlay.addEventListener(eventName, stopAllPropagation)
	}

	const modal = document.createElement('div')
	modal.className = 'quick-action-edit-modal'
	modal.style.cssText =
		'display:flex;flex-direction:column;width:100%;max-width:520px;max-height:90vh;background:var(--background-primary);border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.2);overflow:hidden;pointer-events:auto;'
	for (const eventName of [
		'keydown',
		'keyup',
		'keypress',
		'mousedown',
		'mouseup',
		'click',
		'focusin',
		'focusout',
		'input'
	]) {
		modal.addEventListener(eventName, stopAllPropagation)
	}

	const header = document.createElement('div')
	header.style.cssText =
		'display:flex;align-items:center;justify-content:space-between;padding:20px 24px;border-bottom:1px solid var(--background-modifier-border);'
	const title = document.createElement('span')
	title.style.cssText =
		'font-size:var(--font-ui-medium);font-weight:600;color:var(--text-normal);'
	title.textContent = isEditMode
		? localInstance.quick_action_edit_title_edit
		: localInstance.quick_action_edit_title_add
	const closeBtn = document.createElement('button')
	closeBtn.style.cssText =
		'display:flex;align-items:center;justify-content:center;width:32px;height:32px;border:none;border-radius:6px;background:transparent;color:var(--text-muted);cursor:pointer;'
	closeBtn.innerHTML =
		'<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>'
	closeBtn.onclick = () => overlay.remove()
	header.append(title, closeBtn)

	const body = document.createElement('div')
	body.style.cssText = 'flex:1;overflow-y:auto;padding:20px 24px;pointer-events:auto;'

	const nameField = document.createElement('div')
	nameField.style.cssText = 'margin-bottom:20px;pointer-events:auto;'
	const nameLabel = document.createElement('label')
	nameLabel.style.cssText =
		'display:block;margin-bottom:8px;font-size:var(--font-ui-small);font-weight:500;color:var(--text-normal);'
	nameLabel.innerHTML = `${localInstance.quick_action_edit_name_label} <span style="color: var(--text-error);">*</span>`
	const nameRow = document.createElement('div')
	nameRow.style.cssText = 'display:flex;align-items:center;gap:8px;pointer-events:auto;'
	const nameInput = document.createElement('input')
	nameInput.type = 'text'
	nameInput.autocomplete = 'off'
	nameInput.autocapitalize = 'off'
	nameInput.spellcheck = false
	nameInput.style.cssText =
		'flex:1;padding:10px 12px;border:1px solid var(--background-modifier-border);border-radius:8px;background:var(--background-primary);color:var(--text-normal);font-size:var(--font-ui-small);pointer-events:auto;user-select:text;'
	nameInput.placeholder = localInstance.quick_action_edit_name_placeholder
	nameInput.maxLength = 20
	nameInput.value = quickAction?.name ?? ''
	const nameCounter = document.createElement('span')
	nameCounter.style.cssText = 'font-size:var(--font-ui-smaller);color:var(--text-muted);white-space:nowrap;'
	nameCounter.textContent = `${nameInput.value.length}/20`
	nameInput.addEventListener('input', () => {
		nameCounter.textContent = `${nameInput.value.length}/20`
	})
	const iconBtn = document.createElement('button')
	iconBtn.style.cssText =
		'display:flex;align-items:center;justify-content:center;width:40px;height:40px;border:1px solid var(--background-modifier-border);border-radius:8px;background:var(--background-primary);color:var(--text-muted);cursor:pointer;'
	iconBtn.innerHTML =
		'<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>'
	const nameError = document.createElement('span')
	nameError.style.cssText =
		'display:none;margin-top:4px;font-size:var(--font-ui-smaller);color:var(--text-error);'
	nameRow.append(nameInput, nameCounter, iconBtn)
	nameField.append(nameLabel, nameRow, nameError)

	const actionTypeField = document.createElement('div')
	actionTypeField.style.cssText = 'margin-bottom:20px;pointer-events:auto;'
	const actionTypeLabel = document.createElement('label')
	actionTypeLabel.style.cssText =
		'display:block;margin-bottom:8px;font-size:var(--font-ui-small);font-weight:500;color:var(--text-normal);'
	actionTypeLabel.textContent = localInstance.quick_action_type_label
	const actionTypeRow = document.createElement('div')
	actionTypeRow.style.cssText = 'display:flex;gap:16px;margin-bottom:12px;'
	const typeRadioName = `actionType-${crypto.randomUUID()}`
	const createSharedTypeRadio = (value: QuickActionType, labelText: string) => {
		const wrapper = document.createElement('label')
		wrapper.style.cssText = 'display:flex;align-items:center;gap:6px;cursor:pointer;'
		const radio = document.createElement('input')
		radio.type = 'radio'
		radio.name = typeRadioName
		radio.value = value
		radio.checked = currentQuickActionType === value
		radio.style.cssText = 'cursor:pointer;accent-color:var(--interactive-accent);'
		const label = document.createElement('span')
		label.textContent = labelText
		label.style.cssText = 'font-size:var(--font-ui-small);color:var(--text-normal);'
		wrapper.append(radio, label)
		return { wrapper, radio }
	}
	const { wrapper: normalWrapper, radio: normalRadio } = createSharedTypeRadio(
		'normal',
		localInstance.quick_action_type_normal
	)
	const { wrapper: groupWrapper, radio: groupRadio } = createSharedTypeRadio(
		'group',
		localInstance.quick_action_type_group
	)
	actionTypeRow.append(normalWrapper, groupWrapper)
	actionTypeField.append(actionTypeLabel, actionTypeRow)

	const groupMembersSection = await createQuickActionGroupMembersSection({
		quickAction,
		initialQuickActionType: currentQuickActionType,
		allQuickActions,
		quickActionDataService,
		openQuickActionEditModal: context.openQuickActionEditModal
	})

	const modelField = document.createElement('div')
	modelField.style.cssText = 'margin-bottom:20px;pointer-events:auto;'
	const modelLabel = document.createElement('label')
	modelLabel.style.cssText =
		'display:block;margin-bottom:8px;font-size:var(--font-ui-small);font-weight:500;color:var(--text-normal);'
	modelLabel.textContent = localInstance.quick_action_edit_model_label
	const modelHint = document.createElement('div')
	modelHint.style.cssText = 'margin-bottom:8px;font-size:var(--font-ui-smaller);color:var(--text-muted);'
	modelHint.textContent = localInstance.quick_action_edit_model_hint
	const modelSelect = document.createElement('select')
	modelSelect.style.cssText =
		'width:100%;padding:10px 12px;height:42px;border:1px solid var(--background-modifier-border);border-radius:8px;background:var(--background-primary);color:var(--text-normal);font-size:var(--font-ui-small);cursor:pointer;pointer-events:auto;'
	for (const [value, label] of [
		['', localInstance.quick_action_edit_model_default],
		['__EXEC_TIME__', localInstance.quick_action_edit_model_exec_time]
	]) {
		const option = document.createElement('option')
		option.value = value
		option.textContent = label
		option.selected = quickAction?.modelTag === value
		modelSelect.appendChild(option)
	}
	for (const provider of context.providers) {
		const option = document.createElement('option')
		option.value = provider.tag
		option.textContent = formatProviderOptionLabel(provider, context.providers)
		option.selected = quickAction?.modelTag === provider.tag
		modelSelect.appendChild(option)
	}
	modelField.append(modelLabel, modelHint, modelSelect)

	const promptSourceField = document.createElement('div')
	promptSourceField.style.cssText = 'margin-bottom:20px;pointer-events:auto;'
	const promptSourceLabel = document.createElement('label')
	promptSourceLabel.style.cssText =
		'display:block;margin-bottom:8px;font-size:var(--font-ui-small);font-weight:500;color:var(--text-normal);'
	promptSourceLabel.innerHTML = `${localInstance.quick_action_edit_prompt_source_label} <span style="color: var(--text-error);">*</span>`
	const promptSourceRow = document.createElement('div')
	promptSourceRow.style.cssText = 'display:flex;gap:16px;margin-bottom:12px;'
	const promptSourceName = `promptSource-${crypto.randomUUID()}`
	const createPromptSourceRadio = (value: 'custom' | 'template', labelText: string, checked: boolean) => {
		const wrapper = document.createElement('label')
		wrapper.style.cssText = 'display:flex;align-items:center;gap:6px;cursor:pointer;'
		const radio = document.createElement('input')
		radio.type = 'radio'
		radio.name = promptSourceName
		radio.value = value
		radio.checked = checked
		radio.style.cssText = 'cursor:pointer;accent-color:var(--interactive-accent);'
		const label = document.createElement('span')
		label.textContent = labelText
		label.style.cssText = 'font-size:var(--font-ui-small);color:var(--text-normal);'
		wrapper.append(radio, label)
		return { wrapper, radio }
	}
	const { wrapper: customWrapper, radio: customRadio } = createPromptSourceRadio(
		'custom',
		localInstance.quick_action_edit_prompt_source_custom,
		(quickAction?.promptSource ?? 'custom') === 'custom'
	)
	const { wrapper: templateWrapper, radio: templateRadio } = createPromptSourceRadio(
		'template',
		localInstance.quick_action_edit_prompt_source_template,
		quickAction?.promptSource === 'template'
	)
	promptSourceRow.append(customWrapper, templateWrapper)
	promptSourceField.append(promptSourceLabel, promptSourceRow)

	const customPromptSection = document.createElement('div')
	customPromptSection.style.cssText =
		`pointer-events:auto;display:${customRadio.checked ? 'block' : 'none'};`
	const promptHint = document.createElement('div')
	promptHint.style.cssText = 'margin-bottom:8px;font-size:var(--font-ui-smaller);color:var(--text-muted);pointer-events:auto;'
	promptHint.innerHTML = localInstance.quick_action_edit_custom_prompt_hint
	const promptTextarea = document.createElement('textarea')
	promptTextarea.spellcheck = false
	promptTextarea.style.cssText =
		'width:100%;padding:12px;border:1px solid var(--background-modifier-border);border-radius:8px;background:var(--background-primary);color:var(--text-normal);font-size:var(--font-ui-small);font-family:var(--font-text);line-height:1.5;resize:vertical;min-height:150px;box-sizing:border-box;pointer-events:auto;user-select:text;'
	promptTextarea.placeholder = localInstance.quick_action_edit_prompt_placeholder
	promptTextarea.value =
		quickAction?.promptSource === 'custom' || !quickAction?.promptSource ? quickAction?.prompt ?? '' : ''
	customPromptSection.append(promptHint, promptTextarea)

	const templateSection = document.createElement('div')
	templateSection.style.cssText =
		`pointer-events:auto;display:${templateRadio.checked ? 'block' : 'none'};`
	const templateHint = document.createElement('div')
	templateHint.style.cssText = 'margin-bottom:8px;font-size:var(--font-ui-smaller);color:var(--text-muted);'
	templateHint.innerHTML = localInstance.quick_action_edit_template_hint
	const templateSelect = document.createElement('select')
	templateSelect.style.cssText =
		'width:100%;padding:10px 12px;height:42px;border:1px solid var(--background-modifier-border);border-radius:8px;background:var(--background-primary);color:var(--text-normal);font-size:var(--font-ui-small);cursor:pointer;pointer-events:auto;'
	const defaultTemplateOption = document.createElement('option')
	defaultTemplateOption.value = ''
	defaultTemplateOption.textContent = localInstance.quick_action_edit_template_select_placeholder
	templateSelect.appendChild(defaultTemplateOption)
	for (const file of context.app.vault.getMarkdownFiles()) {
		if (
			!file.path.startsWith(`${context.promptTemplateFolder}/`)
			&& !file.path.startsWith(context.promptTemplateFolder)
		) {
			continue
		}
		const option = document.createElement('option')
		option.value = file.path
		option.textContent = file.path.startsWith(`${context.promptTemplateFolder}/`)
			? file.path.substring(context.promptTemplateFolder.length + 1)
			: file.name
		option.selected = quickAction?.templateFile === file.path
		templateSelect.appendChild(option)
	}
	templateSection.append(templateHint, templateSelect)

	const promptError = document.createElement('span')
	promptError.style.cssText =
		'display:none;margin-top:4px;font-size:var(--font-ui-smaller);color:var(--text-error);'
	promptSourceField.append(customPromptSection, templateSection, promptError)

	const useDefaultSystemPromptField = document.createElement('div')
	useDefaultSystemPromptField.style.cssText = 'margin-bottom:20px;pointer-events:auto;'
	const useDefaultSystemPromptLabel = document.createElement('label')
	useDefaultSystemPromptLabel.style.cssText =
		'display:block;margin-bottom:8px;font-size:var(--font-ui-small);font-weight:500;color:var(--text-normal);'
	useDefaultSystemPromptLabel.textContent = localInstance.quick_action_edit_use_default_system_prompt
	const checkboxRow = document.createElement('div')
	checkboxRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin-top:8px;pointer-events:auto;'
	const useDefaultSystemPromptId = `useDefaultSystemPrompt-${crypto.randomUUID()}`
	const useDefaultSystemPromptCheckbox = document.createElement('input')
	useDefaultSystemPromptCheckbox.type = 'checkbox'
	useDefaultSystemPromptCheckbox.id = useDefaultSystemPromptId
	useDefaultSystemPromptCheckbox.checked = quickAction?.useDefaultSystemPrompt ?? true
	useDefaultSystemPromptCheckbox.style.cssText =
		'width:16px;height:16px;cursor:pointer;accent-color:var(--interactive-accent);'
	const useDefaultSystemPromptHint = document.createElement('label')
	useDefaultSystemPromptHint.htmlFor = useDefaultSystemPromptId
	useDefaultSystemPromptHint.style.cssText =
		'font-size:var(--font-ui-smaller);color:var(--text-muted);cursor:pointer;'
	useDefaultSystemPromptHint.textContent = localInstance.quick_action_edit_use_default_system_prompt_hint
	checkboxRow.append(useDefaultSystemPromptCheckbox, useDefaultSystemPromptHint)
	useDefaultSystemPromptField.append(useDefaultSystemPromptLabel, checkboxRow)

	const advancedPromptOptions = document.createElement('div')
	advancedPromptOptions.style.cssText =
		`margin-top:12px;padding-left:24px;border-left:2px solid var(--background-modifier-border);display:${
			quickAction?.useDefaultSystemPrompt !== false ? 'none' : 'block'
		};`
	const promptRoleField = document.createElement('div')
	promptRoleField.style.cssText = 'margin-bottom:12px;'
	const promptRoleLabel = document.createElement('label')
	promptRoleLabel.style.cssText =
		'display:block;margin-bottom:6px;font-size:var(--font-ui-smaller);font-weight:500;color:var(--text-normal);'
	promptRoleLabel.textContent = t('Custom prompt role')
	const promptRoleRadios = document.createElement('div')
	promptRoleRadios.style.cssText = 'display:flex;gap:16px;'
	const promptRoleName = `customPromptRole-${crypto.randomUUID()}`
	const createRoleRadio = (value: 'system' | 'user', labelText: string) => {
		const wrapper = document.createElement('div')
		wrapper.style.cssText = 'display:flex;align-items:center;gap:6px;'
		const radio = document.createElement('input')
		radio.type = 'radio'
		radio.name = promptRoleName
		radio.value = value
		radio.checked = value === (quickAction?.customPromptRole ?? 'system')
		radio.style.cssText = 'cursor:pointer;accent-color:var(--interactive-accent);'
		const label = document.createElement('label')
		label.style.cssText = 'font-size:var(--font-ui-smaller);color:var(--text-normal);cursor:pointer;'
		label.textContent = labelText
		wrapper.append(radio, label)
		return wrapper
	}
	promptRoleRadios.append(
		createRoleRadio('system', t('System message role')),
		createRoleRadio('user', t('User message role'))
	)
	promptRoleField.append(promptRoleLabel, promptRoleRadios)
	advancedPromptOptions.appendChild(promptRoleField)
	useDefaultSystemPromptField.appendChild(advancedPromptOptions)

	const updatePromptSourceDisplay = () => {
		customPromptSection.style.display = customRadio.checked ? 'block' : 'none'
		templateSection.style.display = customRadio.checked ? 'none' : 'block'
	}
	const updateQuickActionTypeDisplay = () => {
		const isNormal = currentQuickActionType === 'normal'
		groupMembersSection.sectionEl.style.display = isNormal ? 'none' : 'block'
		modelField.style.display = isNormal ? 'block' : 'none'
		promptSourceField.style.display = isNormal ? 'block' : 'none'
		useDefaultSystemPromptField.style.display = isNormal ? 'block' : 'none'
		if (!isNormal) {
			promptError.style.display = 'none'
			promptTextarea.style.borderColor = 'var(--background-modifier-border)'
			templateSelect.style.borderColor = 'var(--background-modifier-border)'
		}
	}
	useDefaultSystemPromptCheckbox.addEventListener('change', () => {
		advancedPromptOptions.style.display = useDefaultSystemPromptCheckbox.checked ? 'none' : 'block'
	})
	customRadio.addEventListener('change', updatePromptSourceDisplay)
	templateRadio.addEventListener('change', updatePromptSourceDisplay)
	normalRadio.addEventListener('change', () => {
		if (!normalRadio.checked) return
		currentQuickActionType = 'normal'
		updateQuickActionTypeDisplay()
	})
	groupRadio.addEventListener('change', () => {
		if (!groupRadio.checked) return
		currentQuickActionType = 'group'
		updateQuickActionTypeDisplay()
	})

	body.append(
		nameField,
		actionTypeField,
		groupMembersSection.sectionEl,
		modelField,
		promptSourceField,
		useDefaultSystemPromptField
	)
	updatePromptSourceDisplay()
	updateQuickActionTypeDisplay()

	const footer = document.createElement('div')
	footer.style.cssText =
		'display:flex;align-items:center;justify-content:flex-end;gap:12px;padding:16px 24px;border-top:1px solid var(--background-modifier-border);'
	const cancelBtn = document.createElement('button')
	cancelBtn.style.cssText =
		'padding:10px 20px;border:none;border-radius:8px;background:var(--background-modifier-hover);color:var(--text-normal);font-size:var(--font-ui-small);font-weight:500;cursor:pointer;'
	cancelBtn.textContent = localInstance.cancel
	cancelBtn.onclick = () => overlay.remove()
	const saveBtn = document.createElement('button')
	saveBtn.style.cssText =
		'padding:10px 20px;border:none;border-radius:8px;background:var(--interactive-accent);color:var(--text-on-accent);font-size:var(--font-ui-small);font-weight:500;cursor:pointer;'
	saveBtn.textContent = localInstance.save
	saveBtn.onclick = async () => {
		await saveQuickActionFromEditModal({
			context,
			options,
			overlay,
			modal,
			quickAction,
			currentQuickActionType,
			allQuickActions,
			existingNames,
			quickActionDataService,
			groupMembersSection,
			promptRoleName,
			nameInput,
			nameError,
			customRadio,
			promptTextarea,
			templateSelect,
			promptError,
			modelSelect,
			useDefaultSystemPromptCheckbox
		})
	}
	footer.append(cancelBtn, saveBtn)

	modal.append(header, body, footer)
	overlay.appendChild(modal)
	overlay.onmousedown = (event) => {
		if (event.target === overlay) {
			overlay.remove()
		}
	}
	document.body.appendChild(overlay)
	requestAnimationFrame(() => {
		requestAnimationFrame(() => {
			nameInput.focus()
		})
	})
}
