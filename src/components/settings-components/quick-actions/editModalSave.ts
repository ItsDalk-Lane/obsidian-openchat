import { Notice } from 'obsidian'
import { QuickActionDataService } from 'src/editor/selectionToolbar/QuickActionDataService'
import { localInstance } from 'src/i18n/locals'
import type { QuickAction, QuickActionType } from 'src/types/chat'
import type { QuickActionEditModalContext, QuickActionEditModalOptions } from './types'

interface PendingGroupMembersAccessor {
	getPendingGroupChildrenIds: () => string[]
}

interface SaveQuickActionFromEditModalParams {
	context: QuickActionEditModalContext
	options?: QuickActionEditModalOptions
	overlay: HTMLElement
	modal: HTMLElement
	quickAction?: QuickAction
	currentQuickActionType: QuickActionType
	allQuickActions: QuickAction[]
	existingNames: string[]
	quickActionDataService: QuickActionDataService
	groupMembersSection: PendingGroupMembersAccessor
	promptRoleName: string
	nameInput: HTMLInputElement
	nameError: HTMLElement
	customRadio: HTMLInputElement
	promptTextarea: HTMLTextAreaElement
	templateSelect: HTMLSelectElement
	promptError: HTMLElement
	modelSelect: HTMLSelectElement
	useDefaultSystemPromptCheckbox: HTMLInputElement
}

export const saveQuickActionFromEditModal = async (
	params: SaveQuickActionFromEditModalParams
): Promise<void> => {
	const {
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
	} = params

	let hasError = false
	if (!nameInput.value.trim()) {
		nameError.textContent = localInstance.quick_action_edit_name_required
		nameError.style.display = 'block'
		nameInput.style.borderColor = 'var(--text-error)'
		hasError = true
	} else if (existingNames.includes(nameInput.value.trim())) {
		nameError.textContent = localInstance.quick_action_edit_name_duplicate
		nameError.style.display = 'block'
		nameInput.style.borderColor = 'var(--text-error)'
		hasError = true
	} else {
		nameError.style.display = 'none'
		nameInput.style.borderColor = 'var(--background-modifier-border)'
	}

	const isGroup = currentQuickActionType === 'group'
	const isCustomPrompt = customRadio.checked
	if (!isGroup) {
		if (isCustomPrompt && !promptTextarea.value.trim()) {
			promptError.textContent = localInstance.quick_action_edit_prompt_required
			promptError.style.display = 'block'
			promptTextarea.style.borderColor = 'var(--text-error)'
			hasError = true
		} else if (!isCustomPrompt && !templateSelect.value) {
			promptError.textContent = localInstance.quick_action_edit_template_required
			promptError.style.display = 'block'
			templateSelect.style.borderColor = 'var(--text-error)'
			hasError = true
		} else {
			promptError.style.display = 'none'
			promptTextarea.style.borderColor = 'var(--background-modifier-border)'
			templateSelect.style.borderColor = 'var(--background-modifier-border)'
		}
	} else {
		promptError.style.display = 'none'
	}
	if (hasError) return

	const now = Date.now()
	const savedQuickAction: QuickAction = {
		id: quickAction?.id || crypto.randomUUID(),
		name: nameInput.value.trim(),
		actionType: currentQuickActionType,
		prompt:
			currentQuickActionType === 'normal'
				? (isCustomPrompt ? promptTextarea.value.trim() : '')
				: (quickAction?.prompt ?? ''),
		promptSource:
			currentQuickActionType === 'normal'
				? (isCustomPrompt ? 'custom' : 'template')
				: (quickAction?.promptSource || 'custom'),
		templateFile:
			currentQuickActionType === 'normal'
				? (isCustomPrompt ? undefined : templateSelect.value)
				: quickAction?.templateFile,
		modelTag:
			currentQuickActionType === 'normal' ? modelSelect.value || undefined : quickAction?.modelTag,
		isActionGroup: isGroup,
		children: isGroup ? groupMembersSection.getPendingGroupChildrenIds() : [],
		showInToolbar: quickAction?.showInToolbar ?? true,
		useDefaultSystemPrompt:
			currentQuickActionType === 'normal'
				? useDefaultSystemPromptCheckbox.checked
				: (quickAction?.useDefaultSystemPrompt ?? true),
		customPromptRole:
			currentQuickActionType === 'normal' && !useDefaultSystemPromptCheckbox.checked
				? ((modal.querySelector(`input[name="${promptRoleName}"]:checked`) as HTMLInputElement | null)
					?.value as 'system' | 'user' | undefined) ?? 'system'
				: (quickAction?.customPromptRole ?? 'system'),
		order: quickAction?.order ?? allQuickActions.length,
		createdAt: quickAction?.createdAt || now,
		updatedAt: now
	}
	await context.saveQuickAction(savedQuickAction)

	if (isGroup) {
		try {
			await quickActionDataService.initialize()
			const desired = groupMembersSection
				.getPendingGroupChildrenIds()
				.filter((id) => id !== savedQuickAction.id)
			const previous = quickAction?.isActionGroup ? (quickAction.children ?? []).slice() : []
			const removed = previous.filter((id) => !desired.includes(id))
			await quickActionDataService.updateQuickActionGroupChildren(savedQuickAction.id, [])
			for (const removedId of removed) {
				await quickActionDataService.moveQuickActionToGroup(removedId, null)
			}
			for (let i = 0; i < desired.length; i += 1) {
				await quickActionDataService.moveQuickActionToGroup(desired[i], savedQuickAction.id, i)
			}
			await context.refreshQuickActionsCache?.()
		} catch (error) {
			new Notice(
				localInstance.ai_runtime_quick_action_group_save_failed_prefix +
					(error instanceof Error ? error.message : String(error))
			)
			return
		}
	}

	if ((quickAction?.isActionGroup ?? false) && !isGroup) {
		try {
			const descendants = await quickActionDataService.getAllDescendants(savedQuickAction.id)
			for (const descendant of descendants) {
				await quickActionDataService.moveQuickActionToGroup(descendant.id, null)
			}
		} catch (error) {
			new Notice(
				localInstance.ai_runtime_quick_action_group_release_failed_prefix +
					(error instanceof Error ? error.message : String(error))
			)
		}
	}

	try {
		await options?.onSaved?.(savedQuickAction)
	} catch (error) {
		new Notice(
			localInstance.ai_runtime_callback_failed_prefix +
				(error instanceof Error ? error.message : String(error))
		)
	}

	overlay.remove()
	const quickActionsListContainer = context.resolveQuickActionsListContainer()
	if (quickActionsListContainer) {
		await context.refreshQuickActionsList(quickActionsListContainer)
	}
}
