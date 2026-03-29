import { App, setIcon } from 'obsidian'
import { availableVendors } from 'src/domains/settings/config-ai-runtime-vendors'
import { getCapabilityDisplayText } from 'src/LLMProviders/utils'
import { t } from 'src/i18n/ai-runtime/helper'
import type { ProviderSettings } from 'src/types/provider'
import { getProviderModelDisplayName } from 'src/utils/aiProviderMetadata'
import type { ProviderGroupRecord } from './providerGroupAdapter'

interface ProviderCardRenderContext {
	app: App
	containerEl: HTMLElement
	providersContainerEl?: HTMLElement
	groups: ProviderGroupRecord[]
	providerTitleEls: Map<number, HTMLElement>
	providerCapabilityEls: Map<number, HTMLElement>
	vendorGroupExpandedState: Map<string, boolean>
	onEditGroup: (group: ProviderGroupRecord) => void
	onDeleteGroup: (group: ProviderGroupRecord) => Promise<void>
	setCurrentOpenProviderIndex: (index: number) => void
}

export const renderProvidersGroupedByVendor = (
	context: ProviderCardRenderContext,
	expandLastProvider: boolean,
	keepOpenIndex: number
): void => {
	for (const group of context.groups) {
		renderVendorGroup(context, group, expandLastProvider, keepOpenIndex)
	}
}

const renderVendorGroup = (
	context: ProviderCardRenderContext,
	group: ProviderGroupRecord,
	expandLastProvider: boolean,
	keepOpenIndex: number
) => {
	const container = context.providersContainerEl || context.containerEl
	const groupContainer = container.createEl('div', { cls: 'vendor-group-container' })
	groupContainer.style.marginBottom = '12px'
	const groupHeader = groupContainer.createEl('div', { cls: 'vendor-group-header' })
	groupHeader.style.cssText =
		'display:flex;align-items:center;padding:10px 12px;background-color:var(--background-secondary);border:1px solid var(--background-modifier-border);border-radius:6px;cursor:pointer;user-select:none;transition:background-color 0.15s ease;'
	let isCollapsed = !(context.vendorGroupExpandedState.get(group.id) ?? false)

	const titleWrap = groupHeader.createEl('div')
	titleWrap.style.cssText = 'display:flex;flex-direction:column;gap:2px;flex:1;'
	const groupName = titleWrap.createEl('span', { cls: 'vendor-group-name' })
	groupName.textContent = group.displayName
	groupName.style.cssText = 'font-weight:600;font-size:14px;color:var(--text-normal);'
	const groupMeta = titleWrap.createEl('span')
	groupMeta.textContent = group.source === 'custom' ? t('Custom') : ''
	groupMeta.style.cssText = 'font-size:12px;color:var(--text-muted);'
	if (!groupMeta.textContent) {
		groupMeta.style.display = 'none'
	}
	const actionWrap = groupHeader.createEl('div')
	actionWrap.style.cssText = 'display:flex;align-items:center;gap:4px;margin-left:auto;'
	const countEl = actionWrap.createEl('span')
	countEl.textContent = String(group.providers.length)
	countEl.style.cssText = 'font-size:12px;color:var(--text-muted);min-width:20px;text-align:right;'

	const settingsButton = actionWrap.createEl('button', { cls: 'clickable-icon' })
	settingsButton.style.cssText = 'padding:6px;'
	setIcon(settingsButton, 'settings')
	settingsButton.setAttribute('aria-label', t('Settings'))
	settingsButton.addEventListener('click', (event) => {
		event.stopPropagation()
		context.onEditGroup(group)
	})

	const deleteButton = actionWrap.createEl('button', { cls: 'clickable-icon' })
	deleteButton.style.cssText = 'padding:6px;'
	setIcon(deleteButton, 'trash')
	deleteButton.setAttribute('aria-label', t('Delete provider'))
	deleteButton.addEventListener('click', async (event) => {
		event.stopPropagation()
		await context.onDeleteGroup(group)
	})

	const collapseIcon = actionWrap.createEl('span', { cls: 'vendor-group-collapse-icon' })
	collapseIcon.style.cssText =
		'display:flex;align-items:center;justify-content:center;width:20px;height:20px;color:var(--text-muted);transition:transform 0.2s ease;'
	setIcon(collapseIcon, 'chevron-right')
	if (!isCollapsed) {
		collapseIcon.style.transform = 'rotate(90deg)'
	}

	const groupContent = groupContainer.createEl('div', { cls: 'vendor-group-content' })
	groupContent.style.cssText = `margin-top:8px;padding-left:12px;display:${isCollapsed ? 'none' : 'block'};`

	groupHeader.addEventListener('click', () => {
		isCollapsed = !isCollapsed
		setIcon(collapseIcon, 'chevron-right')
		collapseIcon.style.transform = isCollapsed ? '' : 'rotate(90deg)'
		groupContent.style.display = isCollapsed ? 'none' : 'block'
		context.vendorGroupExpandedState.set(group.id, !isCollapsed)
	})
	groupHeader.addEventListener('mouseenter', () => {
		groupHeader.style.backgroundColor = 'var(--background-modifier-hover)'
	})
	groupHeader.addEventListener('mouseleave', () => {
		groupHeader.style.backgroundColor = 'var(--background-secondary)'
	})

	for (const { index, settings } of group.providers) {
		const shouldOpen = (index === group.providers.length - 1 && expandLastProvider) || index === keepOpenIndex
		renderProviderSettingCard(context, group, index, settings, shouldOpen, groupContent)
	}
}

const renderProviderSettingCard = (
	context: ProviderCardRenderContext,
	group: ProviderGroupRecord,
	index: number,
	settings: ProviderSettings,
	isOpen: boolean,
	container: HTMLElement
) => {
	const vendor = availableVendors.find((item) => item.name === settings.vendor)
	if (!vendor) {
		throw new Error(`No vendor found ${settings.vendor}`)
	}
	const card = container.createEl('div', { cls: 'ai-provider-card' })
	card.style.cssText =
		'display:flex;align-items:center;justify-content:space-between;padding:12px 16px;margin-bottom:8px;background-color:var(--background-secondary);border:1px solid var(--background-modifier-border);border-radius:var(--radius-m);cursor:pointer;transition:all 0.2s ease;'
	if (isOpen) {
		card.style.borderColor = 'var(--interactive-accent)'
	}
	const leftSection = card.createEl('div', { cls: 'ai-provider-info' })
	leftSection.style.cssText = 'display:flex;flex-direction:column;gap:4px;flex:1;'
	const titleEl = leftSection.createEl('div', { cls: 'ai-provider-title' })
	titleEl.style.cssText = 'font-size:var(--font-ui-medium);font-weight:500;color:var(--text-normal);'
	titleEl.textContent = getProviderModelDisplayName(
		settings,
		group.providers.map((provider) => provider.settings)
	)
	context.providerTitleEls.set(index, titleEl)
	const capabilitiesEl = leftSection.createEl('div', { cls: 'ai-provider-capabilities' })
	capabilitiesEl.style.cssText = 'font-size:var(--font-ui-smaller);color:var(--text-muted);'
	capabilitiesEl.textContent = getCapabilityDisplayText(vendor, settings.options)
	if (!capabilitiesEl.textContent) {
		capabilitiesEl.style.display = 'none'
	}
	context.providerCapabilityEls.set(index, capabilitiesEl)
	card.addEventListener('mouseenter', () => {
		card.style.backgroundColor = 'var(--background-modifier-hover)'
		card.style.borderColor = 'var(--interactive-accent)'
	})
	card.addEventListener('mouseleave', () => {
		card.style.backgroundColor = 'var(--background-secondary)'
		card.style.borderColor = isOpen
			? 'var(--interactive-accent)'
			: 'var(--background-modifier-border)'
	})
	card.addEventListener('click', () => {
		context.setCurrentOpenProviderIndex(index)
		context.onEditGroup(group)
	})
}
