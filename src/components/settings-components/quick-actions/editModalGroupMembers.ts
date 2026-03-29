import type { QuickActionDataService } from 'src/domains/quick-actions/service-data'
import type { QuickAction, QuickActionType } from 'src/domains/chat/types'
import { t } from 'src/i18n/ai-runtime/helper'
import { localInstance } from 'src/i18n/locals'
import type { QuickActionEditModalOptions } from './types'

interface QuickActionGroupMembersSectionParams {
	quickAction?: QuickAction
	initialQuickActionType: QuickActionType
	allQuickActions: QuickAction[]
	quickActionDataService: QuickActionDataService
	notify: (message: string, timeout?: number) => void
	openQuickActionEditModal: (
		quickAction?: QuickAction,
		options?: QuickActionEditModalOptions
	) => Promise<void>
}

interface QuickActionGroupMembersSectionResult {
	sectionEl: HTMLElement
	getPendingGroupChildrenIds: () => string[]
}

export const createQuickActionGroupMembersSection = async (
	params: QuickActionGroupMembersSectionParams
): Promise<QuickActionGroupMembersSectionResult> => {
	const {
		quickAction,
		initialQuickActionType,
		allQuickActions,
		quickActionDataService,
		notify,
		openQuickActionEditModal
	} = params
	let pendingGroupChildrenIds =
		initialQuickActionType === 'group' ? (quickAction?.children ?? []).slice() : []

	const excludedAddIds = new Set<string>()
	if (quickAction?.id) {
		excludedAddIds.add(quickAction.id)
		if (quickAction.isActionGroup) {
			try {
				const descendants = await quickActionDataService.getAllDescendants(quickAction.id)
				for (const descendant of descendants) {
					excludedAddIds.add(descendant.id)
				}
			} catch {
				// 保存时仍会执行循环与层级校验，这里不阻断编辑。
			}
		}
	}

	const sectionEl = document.createElement('div')
	sectionEl.style.cssText = `
		margin-bottom: 20px;
		padding: 12px;
		border: 1px solid var(--background-modifier-border);
		border-radius: 8px;
		background: var(--background-primary);
		pointer-events: auto;
		display: ${initialQuickActionType === 'group' ? 'block' : 'none'};
	`

	const headerEl = document.createElement('div')
	headerEl.style.cssText =
		'display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;'
	const titleEl = document.createElement('div')
	titleEl.style.cssText =
		'font-size: var(--font-ui-small); font-weight: 600; color: var(--text-normal);'
	titleEl.textContent = t('Action group members')
	const hintEl = document.createElement('div')
	hintEl.style.cssText = 'font-size: var(--font-ui-smaller); color: var(--text-muted);'
	hintEl.textContent = t('Action group members hint')
	headerEl.append(titleEl, hintEl)

	const membersListEl = document.createElement('div')
	membersListEl.style.cssText =
		'display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px;'

	const addExistingRowEl = document.createElement('div')
	addExistingRowEl.style.cssText =
		'display: flex; gap: 8px; align-items: center; margin-bottom: 10px;'
	const addExistingSelect = document.createElement('select')
	addExistingSelect.style.cssText = `
		flex: 1;
		padding: 10px 12px;
		height: 40px;
		border: 1px solid var(--background-modifier-border);
		border-radius: 8px;
		background: var(--background-primary);
		color: var(--text-normal);
		font-size: var(--font-ui-small);
		cursor: pointer;
		pointer-events: auto;
	`
	const addExistingBtn = document.createElement('button')
	addExistingBtn.style.cssText = `
		padding: 10px 12px;
		border: none;
		border-radius: 8px;
		background: var(--background-modifier-hover);
		color: var(--text-normal);
		font-size: var(--font-ui-small);
		cursor: pointer;
	`
	addExistingBtn.textContent = localInstance.add
	addExistingRowEl.append(addExistingSelect, addExistingBtn)

	const createRowEl = document.createElement('div')
	createRowEl.style.cssText = 'display: flex; gap: 8px; align-items: center;'
	const buttonStyle = `
		flex: 1;
		padding: 10px 12px;
		border: none;
		border-radius: 8px;
		background: var(--background-modifier-hover);
		color: var(--text-normal);
		font-size: var(--font-ui-small);
		cursor: pointer;
	`
	const createQuickActionBtn = document.createElement('button')
	createQuickActionBtn.style.cssText = buttonStyle
	createQuickActionBtn.textContent = localInstance.quick_action_add
	const createGroupBtn = document.createElement('button')
	createGroupBtn.style.cssText = buttonStyle
	createGroupBtn.textContent = t('Add action group')
	createRowEl.append(createQuickActionBtn, createGroupBtn)

	const byId = new Map(allQuickActions.map((item) => [item.id, item] as const))
	let draggingMemberId: string | null = null
	const refreshMembersList = () => {
		membersListEl.innerHTML = ''
		pendingGroupChildrenIds = pendingGroupChildrenIds.filter((id) => byId.has(id))
		if (pendingGroupChildrenIds.length === 0) {
			const emptyEl = document.createElement('div')
			emptyEl.style.cssText =
				'padding: 8px 10px; color: var(--text-muted); font-size: var(--font-ui-smaller); background: var(--background-secondary); border-radius: 6px;'
			emptyEl.textContent = t('No action group members yet')
			membersListEl.appendChild(emptyEl)
			return
		}

		for (const childId of pendingGroupChildrenIds) {
			const child = byId.get(childId)
			if (!child) continue
			const rowEl = document.createElement('div')
			rowEl.style.cssText =
				'display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 10px; background: var(--background-secondary); border-radius: 6px; cursor: grab;'
			rowEl.draggable = true

			const leftEl = document.createElement('div')
			leftEl.style.cssText = 'display: flex; align-items: center; gap: 8px; min-width: 0;'
			const tagEl = document.createElement('span')
			tagEl.style.cssText =
				'flex: 0 0 auto; font-size: var(--font-ui-smaller); color: var(--text-muted);'
			tagEl.textContent = child.isActionGroup
				? t('Action group short label')
				: t('Action short label')
			const nameEl = document.createElement('span')
			nameEl.style.cssText =
				'font-size: var(--font-ui-small); color: var(--text-normal); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;'
			nameEl.textContent = child.name
			leftEl.append(tagEl, nameEl)

			const removeBtn = document.createElement('button')
			removeBtn.style.cssText =
				'flex: 0 0 auto; padding: 6px 10px; border: none; border-radius: 6px; background: transparent; color: var(--text-muted); cursor: pointer;'
			removeBtn.textContent = t('Remove')
			removeBtn.onmouseenter = () => {
				removeBtn.style.background = 'var(--background-modifier-hover)'
				removeBtn.style.color = 'var(--text-normal)'
			}
			removeBtn.onmouseleave = () => {
				removeBtn.style.background = 'transparent'
				removeBtn.style.color = 'var(--text-muted)'
			}
			removeBtn.onclick = (event) => {
				event.stopPropagation()
				pendingGroupChildrenIds = pendingGroupChildrenIds.filter((id) => id !== childId)
				refreshMembersList()
				refreshAddExistingOptions()
			}

			rowEl.ondragstart = (event) => {
				event.stopPropagation()
				draggingMemberId = childId
				if (event.dataTransfer) {
					event.dataTransfer.effectAllowed = 'move'
					event.dataTransfer.setData('text/plain', childId)
				}
				rowEl.style.opacity = '0.6'
			}
			rowEl.ondragend = (event) => {
				event.stopPropagation()
				draggingMemberId = null
				rowEl.style.opacity = ''
				rowEl.style.borderTop = ''
				rowEl.style.borderBottom = ''
			}
			rowEl.ondragover = (event) => {
				event.preventDefault()
				event.stopPropagation()
				const fromId = draggingMemberId || event.dataTransfer?.getData('text/plain')
				if (!fromId || fromId === childId) return
				const rect = rowEl.getBoundingClientRect()
				const insertBefore = event.clientY < rect.top + rect.height / 2
				rowEl.style.borderTop = insertBefore ? '2px solid var(--interactive-accent)' : ''
				rowEl.style.borderBottom = insertBefore ? '' : '2px solid var(--interactive-accent)'
				if (event.dataTransfer) {
					event.dataTransfer.dropEffect = 'move'
				}
			}
			rowEl.ondragleave = (event) => {
				event.stopPropagation()
				rowEl.style.borderTop = ''
				rowEl.style.borderBottom = ''
			}
			rowEl.ondrop = (event) => {
				event.preventDefault()
				event.stopPropagation()
				const fromId = draggingMemberId || event.dataTransfer?.getData('text/plain')
				if (!fromId || fromId === childId) return
				const rect = rowEl.getBoundingClientRect()
				const insertBefore = event.clientY < rect.top + rect.height / 2
				const fromIndex = pendingGroupChildrenIds.indexOf(fromId)
				if (fromIndex < 0 || !pendingGroupChildrenIds.includes(childId)) return
				pendingGroupChildrenIds.splice(fromIndex, 1)
				let targetIndex = pendingGroupChildrenIds.indexOf(childId)
				if (targetIndex < 0) {
					targetIndex = pendingGroupChildrenIds.length
				}
				if (!insertBefore) {
					targetIndex += 1
				}
				pendingGroupChildrenIds.splice(targetIndex, 0, fromId)
				rowEl.style.borderTop = ''
				rowEl.style.borderBottom = ''
				refreshMembersList()
			}

			rowEl.append(leftEl, removeBtn)
			membersListEl.appendChild(rowEl)
		}
	}

	membersListEl.ondragover = (event) => {
		event.preventDefault()
	}
	membersListEl.ondrop = (event) => {
		event.preventDefault()
		const fromId = draggingMemberId || event.dataTransfer?.getData('text/plain')
		if (!fromId) return
		const fromIndex = pendingGroupChildrenIds.indexOf(fromId)
		if (fromIndex < 0) return
		pendingGroupChildrenIds.splice(fromIndex, 1)
		pendingGroupChildrenIds.push(fromId)
		refreshMembersList()
	}

	const refreshAddExistingOptions = () => {
		addExistingSelect.innerHTML = ''
		const placeholderOption = document.createElement('option')
		placeholderOption.value = ''
		placeholderOption.textContent = t('Select action or action group to add')
		addExistingSelect.appendChild(placeholderOption)

		const candidates = allQuickActions
			.filter((item) => !excludedAddIds.has(item.id))
			.filter((item) => !pendingGroupChildrenIds.includes(item.id))
			.sort((a, b) => a.order - b.order)
		for (const candidate of candidates) {
			const option = document.createElement('option')
			option.value = candidate.id
			option.textContent = `${
				candidate.isActionGroup ? t('Action group option prefix') : t('Action option prefix')
			}${candidate.name}`
			addExistingSelect.appendChild(option)
		}
	}

	addExistingBtn.onclick = (event) => {
		event.stopPropagation()
		if (!addExistingSelect.value) {
			notify(localInstance.ai_runtime_select_action_required)
			return
		}
		if (!pendingGroupChildrenIds.includes(addExistingSelect.value)) {
			pendingGroupChildrenIds.push(addExistingSelect.value)
			refreshMembersList()
			refreshAddExistingOptions()
		}
	}

	const openCreateModal = (initialIsActionGroup: boolean) => async (event: MouseEvent) => {
		event.stopPropagation()
		await openQuickActionEditModal(undefined, {
			initialIsActionGroup,
			onSaved: async (created) => {
				pendingGroupChildrenIds.push(created.id)
				refreshMembersList()
				refreshAddExistingOptions()
			}
		})
	}
	createQuickActionBtn.onclick = openCreateModal(false)
	createGroupBtn.onclick = openCreateModal(true)

	sectionEl.append(headerEl, membersListEl, addExistingRowEl, createRowEl)
	refreshMembersList()
	refreshAddExistingOptions()

	return {
		sectionEl,
		getPendingGroupChildrenIds: () => pendingGroupChildrenIds.slice()
	}
}
