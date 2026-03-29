import { t } from 'src/i18n/ai-runtime/helper'
import { localInstance } from 'src/i18n/locals'
import type { QuickAction } from 'src/types/chat'
import { DebugLogger } from 'src/utils/DebugLogger'
import type { QuickActionListContext } from './types'

export const renderQuickActionsList = async (
	context: QuickActionListContext,
	container: HTMLElement
): Promise<void> => {
	container.empty()

	const quickActions = await context.getQuickActionsFromService()
	if (quickActions.length === 0) {
		const emptyTip = container.createEl('div', { cls: 'quick-actions-list-empty' })
		emptyTip.style.cssText =
			'padding:24px;color:var(--text-muted);font-size:var(--font-ui-small);text-align:center;font-style:italic;'
		emptyTip.textContent = localInstance.quick_action_empty
		return
	}

	const byId = new Map(quickActions.map((item) => [item.id, item] as const))
	const referenced = new Set<string>()
	for (const item of quickActions) {
		if (!item.isActionGroup) continue
		for (const childId of item.children ?? []) {
			referenced.add(childId)
		}
	}
	const topLevel = quickActions
		.filter((item) => !referenced.has(item.id))
		.sort((a, b) => a.order - b.order)
	const parentMap = new Map<string, string | null>()
	const indexMap = new Map<string, number>()
	for (const item of quickActions) {
		if (!item.isActionGroup) continue
		for (let i = 0; i < (item.children ?? []).length; i += 1) {
			const childId = (item.children ?? [])[i]
			if (!byId.has(childId)) continue
			parentMap.set(childId, item.id)
			indexMap.set(childId, i)
		}
	}
	for (let i = 0; i < topLevel.length; i += 1) {
		parentMap.set(topLevel[i].id, null)
		indexMap.set(topLevel[i].id, i)
	}

	const { quickActionDataService } = context
	await quickActionDataService.initialize()

	let draggingId: string | null = null
	let activeIndicatorEl: HTMLElement | null = null
	let dragPreviewEl: HTMLElement | null = null
	const clearIndicators = () => {
		container.querySelectorAll('.quick-action-item').forEach((item) => {
			const el = item as HTMLElement
			el.style.borderTop = ''
			el.style.borderBottom = ''
			el.style.outline = ''
		})
		activeIndicatorEl = null
	}
	const getDropZone = (e: DragEvent, el: HTMLElement, isGroup: boolean) => {
		const rect = el.getBoundingClientRect()
		const y = e.clientY - rect.top
		const h = rect.height || 1
		if (y < h * 0.25) return 'before' as const
		if (y > h * 0.75) return 'after' as const
		if (isGroup) return 'into' as const
		return 'after' as const
	}
	const performMove = async (movedId: string, targetParentId: string | null, insertAt: number) => {
		try {
			await quickActionDataService.moveQuickActionToGroup(movedId, targetParentId, insertAt)
			await context.refreshQuickActionsCache?.()
		} catch (error) {
			DebugLogger.error('[QuickActions] Failed to move action', error)
			context.notify(t('Failed to move action. Please try again.'))
		}
	}

	const renderQuickActionNode = (
		quickAction: QuickAction,
		level: number,
		parentId: string | null,
		siblingIndex: number,
		parentContainer: HTMLElement
	) => {
		const quickActionItem = parentContainer.createDiv({ cls: 'quick-action-item' })
		quickActionItem.dataset.quickActionId = quickAction.id
		quickActionItem.dataset.parentId = parentId ?? ''
		quickActionItem.dataset.level = String(level)
		quickActionItem.dataset.siblingIndex = String(siblingIndex)
		quickActionItem.dataset.isActionGroup = String(!!quickAction.isActionGroup)
		quickActionItem.draggable = true
		quickActionItem.style.cssText =
			`display:flex;align-items:center;justify-content:space-between;padding:10px 12px;margin-bottom:4px;margin-left:${level * 24}px;` +
			'background:var(--background-secondary);border-radius:6px;border:1px solid transparent;' +
			'transition:border-color 0.15s ease,transform 0.15s ease,opacity 0.15s ease;cursor:grab;'
		quickActionItem.addEventListener('mouseenter', () => {
			quickActionItem.style.borderColor = 'var(--background-modifier-border)'
		})
		quickActionItem.addEventListener('mouseleave', () => {
			quickActionItem.style.borderColor = 'transparent'
		})
		quickActionItem.addEventListener('dragstart', (e) => {
			draggingId = quickAction.id
			quickActionItem.style.opacity = '0.5'
			e.dataTransfer?.setData('text/plain', quickAction.id)
			dragPreviewEl?.remove()
			dragPreviewEl = document.createElement('div')
			dragPreviewEl.style.cssText =
				'position:fixed;pointer-events:none;z-index:10000;padding:8px 14px;background:var(--background-primary);' +
				'border:1px solid var(--interactive-accent);border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,0.15);' +
				'font-size:var(--font-ui-small);color:var(--text-normal);display:flex;align-items:center;gap:8px;opacity:0.95;'
			dragPreviewEl.innerHTML =
				'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--text-muted);">' +
				'<circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/>' +
				'<circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>' +
				`<span>${quickAction.name}</span>`
			document.body.appendChild(dragPreviewEl)
			const emptyImg = new Image()
			emptyImg.src =
				'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
			e.dataTransfer?.setDragImage(emptyImg, 0, 0)
			const onDrag = (ev: DragEvent) => {
				if (!dragPreviewEl || ev.clientX <= 0 || ev.clientY <= 0) return
				dragPreviewEl.style.left = `${ev.clientX + 12}px`
				dragPreviewEl.style.top = `${ev.clientY + 12}px`
			}
			document.addEventListener('drag', onDrag)
			quickActionItem.addEventListener(
				'dragend',
				() => {
					document.removeEventListener('drag', onDrag)
				},
				{ once: true }
			)
		})
		quickActionItem.addEventListener('dragend', () => {
			draggingId = null
			quickActionItem.style.opacity = '1'
			clearIndicators()
			dragPreviewEl?.remove()
			dragPreviewEl = null
		})
		quickActionItem.addEventListener('dragover', (e) => {
			e.preventDefault()
			if (!draggingId || draggingId === quickAction.id) return
			clearIndicators()
			activeIndicatorEl = quickActionItem
			const zone = getDropZone(e as DragEvent, quickActionItem, !!quickAction.isActionGroup)
			if (zone === 'before') {
				quickActionItem.style.borderTop = '2px solid var(--interactive-accent)'
			} else if (zone === 'after') {
				quickActionItem.style.borderBottom = '2px solid var(--interactive-accent)'
			} else {
				quickActionItem.style.outline = '2px solid var(--interactive-accent)'
				if (quickAction.isActionGroup) {
					const expanded = context.quickActionGroupExpandedState.get(quickAction.id) ?? false
					if (!expanded) {
						context.quickActionGroupExpandedState.set(quickAction.id, true)
						const childrenEl = quickActionItem.nextElementSibling as HTMLElement | null
						if (childrenEl?.classList.contains('quick-action-children-container')) {
							childrenEl.style.display = 'block'
						}
					}
				}
			}
		})
		quickActionItem.addEventListener('dragleave', () => {
			if (activeIndicatorEl === quickActionItem) clearIndicators()
		})
		quickActionItem.addEventListener('drop', async (e) => {
			e.preventDefault()
			e.stopPropagation()
			const draggedId = e.dataTransfer?.getData('text/plain')
			clearIndicators()
			if (!draggedId || draggedId === quickAction.id) return
			const zone = getDropZone(e as DragEvent, quickActionItem, !!quickAction.isActionGroup)
			if (zone === 'into' && quickAction.isActionGroup) {
				await performMove(draggedId, quickAction.id, (quickAction.children ?? []).length)
				await renderQuickActionsList(context, container)
				return
			}
			const targetParentId = quickActionItem.dataset.parentId || null
			const targetIndex = Number(quickActionItem.dataset.siblingIndex || '0')
			let insertAt = zone === 'before' ? targetIndex : targetIndex + 1
			const sourceParentId = parentMap.get(draggedId) ?? null
			const sourceIndex = indexMap.get(draggedId) ?? -1
			if (sourceParentId === targetParentId && sourceIndex >= 0 && sourceIndex < insertAt) {
				insertAt -= 1
			}
			await performMove(draggedId, targetParentId, insertAt)
			await renderQuickActionsList(context, container)
		})

		const leftSection = quickActionItem.createDiv()
		leftSection.style.cssText = 'display:flex;align-items:center;gap:10px;'
		const dragHandle = leftSection.createEl('div', { cls: 'quick-action-drag-handle' })
		dragHandle.innerHTML =
			'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
			'<circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/>' +
			'<circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>'
		dragHandle.style.cssText = 'display:flex;color:var(--text-muted);cursor:grab;'
		dragHandle.title = t('Drag to reorder')

		const contentSection = leftSection.createDiv()
		contentSection.style.cssText = 'display:flex;align-items:center;gap:12px;'
		if (quickAction.isActionGroup) {
			const toggle = contentSection.createEl('div')
			const expanded = context.quickActionGroupExpandedState.get(quickAction.id) ?? false
			toggle.innerHTML =
				'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>'
			toggle.style.cssText =
				`display:flex;align-items:center;justify-content:center;width:14px;height:14px;color:var(--text-muted);cursor:pointer;` +
				`transform:${expanded ? 'rotate(0deg)' : 'rotate(-90deg)'};transition:transform 0.15s ease;`
			toggle.onclick = (e) => {
				e.stopPropagation()
				const next = !(context.quickActionGroupExpandedState.get(quickAction.id) ?? false)
				context.quickActionGroupExpandedState.set(quickAction.id, next)
				const childrenEl = quickActionItem.nextElementSibling as HTMLElement | null
				if (childrenEl?.classList.contains('quick-action-children-container')) {
					childrenEl.style.display = next ? 'block' : 'none'
				}
				toggle.style.transform = next ? 'rotate(0deg)' : 'rotate(-90deg)'
			}
		} else {
			contentSection.createEl('div').style.cssText = 'width:14px;height:14px;'
		}

		const showInToolbarCheckbox = contentSection.createEl('input', { type: 'checkbox' }) as HTMLInputElement
		showInToolbarCheckbox.checked = quickAction.showInToolbar
		showInToolbarCheckbox.style.cssText = 'cursor:pointer;accent-color:var(--interactive-accent);'
		showInToolbarCheckbox.title = quickAction.showInToolbar
			? t('Shown in toolbar')
			: t('Hidden from toolbar')
		showInToolbarCheckbox.onclick = (e) => e.stopPropagation()
		showInToolbarCheckbox.onchange = async () => {
			await context.updateQuickActionShowInToolbar(quickAction.id, showInToolbarCheckbox.checked)
			await renderQuickActionsList(context, container)
		}

		const actionTypeIcon = contentSection.createEl('div')
		actionTypeIcon.style.cssText =
			'display:flex;align-items:center;justify-content:center;width:16px;height:16px;color:var(--text-muted);'
		const actionType = quickAction.actionType || (quickAction.isActionGroup ? 'group' : 'normal')
		if (actionType === 'group') {
			actionTypeIcon.innerHTML =
				'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 14 1.45-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5c0-1.1.9-2 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H18a2 2 0 0 1 2 2v2"/></svg>'
			actionTypeIcon.title = localInstance.quick_action_type_group
		} else {
			actionTypeIcon.innerHTML =
				'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>'
			actionTypeIcon.title = localInstance.quick_action_type_normal
		}

		const quickActionName = contentSection.createEl('span')
		quickActionName.style.cssText =
			`font-size:var(--font-ui-small);color:${quickAction.showInToolbar ? 'var(--interactive-accent)' : 'var(--text-normal)'};` +
			`font-weight:${quickAction.showInToolbar ? '500' : 'normal'};`
		quickActionName.textContent = quickAction.name

		const rightSection = quickActionItem.createDiv()
		rightSection.style.cssText = 'display:flex;align-items:center;gap:8px;'
		const editBtn = rightSection.createEl('button')
		editBtn.style.cssText =
			'padding:4px 8px;border:none;border-radius:4px;background:transparent;color:var(--text-muted);' +
			'font-size:var(--font-ui-smaller);cursor:pointer;transition:background-color 0.15s ease,color 0.15s ease;'
		editBtn.textContent = localInstance.quick_action_edit
		editBtn.addEventListener('mouseenter', () => {
			editBtn.style.backgroundColor = 'var(--background-modifier-hover)'
			editBtn.style.color = 'var(--text-normal)'
		})
		editBtn.addEventListener('mouseleave', () => {
			editBtn.style.backgroundColor = 'transparent'
			editBtn.style.color = 'var(--text-muted)'
		})
		editBtn.onclick = async (e) => {
			e.stopPropagation()
			await context.openQuickActionEditModal(quickAction)
		}

		const deleteBtn = rightSection.createEl('button')
		deleteBtn.style.cssText =
			'padding:4px 8px;border:none;border-radius:4px;background:transparent;color:var(--text-muted);' +
			'font-size:var(--font-ui-smaller);cursor:pointer;transition:background-color 0.15s ease,color 0.15s ease;'
		deleteBtn.textContent = localInstance.quick_action_delete
		deleteBtn.title = localInstance.quick_action_delete
		deleteBtn.addEventListener('mouseenter', () => {
			deleteBtn.style.backgroundColor = 'var(--background-modifier-error)'
			deleteBtn.style.color = 'var(--text-on-accent)'
		})
		deleteBtn.addEventListener('mouseleave', () => {
			deleteBtn.style.backgroundColor = 'transparent'
			deleteBtn.style.color = 'var(--text-muted)'
		})
		deleteBtn.onclick = async (e) => {
			e.stopPropagation()
			if (quickAction.isActionGroup) {
				const descendants = await quickActionDataService.getAllDescendants(quickAction.id)
				const overlay = document.createElement('div')
				overlay.style.cssText =
					'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;' +
					'justify-content:center;z-index:9999;padding:20px;'
				const modal = document.createElement('div')
				modal.style.cssText =
					'width:100%;max-width:420px;background:var(--background-primary);border-radius:12px;' +
					'box-shadow:0 8px 32px rgba(0,0,0,0.2);overflow:hidden;'
				const header = document.createElement('div')
				header.style.cssText =
					'padding:18px 20px;border-bottom:1px solid var(--background-modifier-border);font-weight:600;'
				header.textContent = t('Delete action group confirmation')
				const body = document.createElement('div')
				body.style.cssText =
					'padding:16px 20px;color:var(--text-normal);font-size:var(--font-ui-small);line-height:1.6;'
				body.textContent = t('Action group delete dialog body').replace(
					'{count}',
					String(descendants.length)
				)
				const footer = document.createElement('div')
				footer.style.cssText =
					'display:flex;justify-content:flex-end;gap:10px;padding:14px 20px;border-top:1px solid var(--background-modifier-border);'
				const cancel = document.createElement('button')
				cancel.textContent = localInstance.cancel
				cancel.style.cssText =
					'padding:8px 14px;border:none;border-radius:8px;background:var(--background-modifier-hover);cursor:pointer;'
				cancel.onclick = () => overlay.remove()
				const keepChildren = document.createElement('button')
				keepChildren.textContent = t('Keep child actions')
				keepChildren.style.cssText =
					'padding:8px 14px;border:none;border-radius:8px;background:var(--interactive-accent);color:var(--text-on-accent);cursor:pointer;'
				keepChildren.onclick = async () => {
					try {
						for (const descendant of descendants) {
							await quickActionDataService.moveQuickActionToGroup(descendant.id, null)
						}
						await context.deleteQuickAction(quickAction.id)
						overlay.remove()
						await renderQuickActionsList(context, container)
					} catch (error) {
						DebugLogger.error('[QuickActions] Failed to keep child actions', error)
						context.notify(t('Failed to keep child actions. Please try again.'))
					}
				}
				const deleteChildren = document.createElement('button')
				deleteChildren.textContent = t('Delete child actions')
				deleteChildren.style.cssText =
					'padding:8px 14px;border:none;border-radius:8px;background:var(--background-modifier-error);color:var(--text-on-accent);cursor:pointer;'
				deleteChildren.onclick = async () => {
					try {
						for (let i = descendants.length - 1; i >= 0; i -= 1) {
							await context.deleteQuickAction(descendants[i].id)
						}
						await context.deleteQuickAction(quickAction.id)
						overlay.remove()
						await renderQuickActionsList(context, container)
					} catch (error) {
						DebugLogger.error('[QuickActions] Failed to delete child actions', error)
						context.notify(t('Failed to delete child actions. Please try again.'))
					}
				}
				footer.append(cancel, deleteChildren, keepChildren)
				modal.append(header, body, footer)
				overlay.appendChild(modal)
				overlay.onmousedown = (ev) => {
					if (ev.target === overlay) overlay.remove()
				}
				document.body.appendChild(overlay)
				return
			}
			await context.deleteQuickAction(quickAction.id)
			await renderQuickActionsList(context, container)
		}

		if (quickAction.isActionGroup) {
			const childrenContainer = parentContainer.createDiv({
				cls: 'quick-action-children-container'
			})
			childrenContainer.style.cssText = 'margin-left:0;padding-left:0;'
			const expanded = context.quickActionGroupExpandedState.get(quickAction.id) ?? false
			childrenContainer.style.display = expanded ? 'block' : 'none'
			for (const [idx, childId] of (quickAction.children ?? []).filter((id) => byId.has(id)).entries()) {
				const child = byId.get(childId)
				if (child) renderQuickActionNode(child, level + 1, quickAction.id, idx, childrenContainer)
			}
		}
	}

	container.ondragover = (e) => {
		e.preventDefault()
	}
	container.ondrop = async (e) => {
		e.preventDefault()
		const target = e.target as HTMLElement | null
		if (target?.closest('.quick-action-item')) return
		const draggedId = e.dataTransfer?.getData('text/plain')
		clearIndicators()
		if (!draggedId) return
		await performMove(draggedId, null, topLevel.length)
		await renderQuickActionsList(context, container)
	}

	topLevel.forEach((quickAction, idx) => {
		renderQuickActionNode(quickAction, 0, null, idx, container)
	})
}
