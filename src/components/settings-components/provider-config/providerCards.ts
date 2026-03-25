import type { App } from 'obsidian'
import { availableVendors } from 'src/settings/ai-runtime'
import { ProviderSettingModal } from 'src/components/modals/AiRuntimeProviderModals'
import { getCapabilityDisplayText } from 'src/LLMProviders/utils'
import { t } from 'src/i18n/ai-runtime/helper'
import type { ProviderSettings, Vendor } from 'src/types/provider'
import { getSummary } from './providerUtils'

interface ProviderCardRenderContext {
	app: App
	containerEl: HTMLElement
	providersContainerEl?: HTMLElement
	providers: ProviderSettings[]
	providerTitleEls: Map<number, HTMLElement>
	providerCapabilityEls: Map<number, HTMLElement>
	vendorGroupExpandedState: Map<string, boolean>
	renderProviderConfig: (
		container: HTMLElement,
		index: number,
		settings: ProviderSettings,
		vendor: Vendor,
		modal?: ProviderSettingModal
	) => void
	onDeleteProvider: (index: number, vendorName: string) => Promise<void>
	setCurrentOpenProviderIndex: (index: number) => void
}

export const renderProvidersGroupedByVendor = (
	context: ProviderCardRenderContext,
	expandLastProvider: boolean,
	keepOpenIndex: number
): void => {
	const groupedProviders = new Map<string, Array<{ index: number; settings: ProviderSettings }>>()
	const vendorNames: string[] = []
	for (const [index, provider] of context.providers.entries()) {
		const vendor = availableVendors.find((item) => item.name === provider.vendor)
		if (!vendor) continue
		if (!groupedProviders.has(vendor.name)) {
			groupedProviders.set(vendor.name, [])
			vendorNames.push(vendor.name)
		}
		groupedProviders.get(vendor.name)?.push({ index, settings: provider })
	}
	for (const vendorName of vendorNames) {
		renderVendorGroup(
			context,
			vendorName,
			groupedProviders.get(vendorName) ?? [],
			expandLastProvider,
			keepOpenIndex
		)
	}
}

const renderVendorGroup = (
	context: ProviderCardRenderContext,
	vendorName: string,
	providers: Array<{ index: number; settings: ProviderSettings }>,
	expandLastProvider: boolean,
	keepOpenIndex: number
) => {
	const container = context.providersContainerEl || context.containerEl
	const groupContainer = container.createEl('div', { cls: 'vendor-group-container' })
	groupContainer.style.marginBottom = '12px'
	const groupHeader = groupContainer.createEl('div', { cls: 'vendor-group-header' })
	groupHeader.style.cssText =
		'display:flex;align-items:center;padding:10px 12px;background-color:var(--background-secondary);border:1px solid var(--background-modifier-border);border-radius:6px;cursor:pointer;user-select:none;transition:background-color 0.15s ease;'
	let isCollapsed = !(context.vendorGroupExpandedState.get(vendorName) ?? false)
	const collapseIcon = groupHeader.createEl('span', { cls: 'vendor-group-collapse-icon' })
	collapseIcon.textContent = isCollapsed ? '▶' : '▼'
	collapseIcon.style.cssText =
		'margin-right:8px;font-size:10px;transition:transform 0.2s ease;color:var(--text-muted);'
	const groupName = groupHeader.createEl('span', { cls: 'vendor-group-name' })
	groupName.textContent = `${vendorName} (${providers.length})`
	groupName.style.cssText = 'font-weight:600;font-size:14px;color:var(--text-normal);'
	const groupContent = groupContainer.createEl('div', { cls: 'vendor-group-content' })
	groupContent.style.cssText = `margin-top:8px;padding-left:12px;display:${isCollapsed ? 'none' : 'block'};`

	groupHeader.addEventListener('click', () => {
		isCollapsed = !isCollapsed
		collapseIcon.textContent = isCollapsed ? '▶' : '▼'
		groupContent.style.display = isCollapsed ? 'none' : 'block'
		context.vendorGroupExpandedState.set(vendorName, !isCollapsed)
	})
	groupHeader.addEventListener('mouseenter', () => {
		groupHeader.style.backgroundColor = 'var(--background-modifier-hover)'
	})
	groupHeader.addEventListener('mouseleave', () => {
		groupHeader.style.backgroundColor = 'var(--background-secondary)'
	})

	for (const { index, settings } of providers) {
		const shouldOpen = (index === context.providers.length - 1 && expandLastProvider) || index === keepOpenIndex
		renderProviderSettingCard(context, index, settings, shouldOpen, groupContent)
	}
}

const renderProviderSettingCard = (
	context: ProviderCardRenderContext,
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
	const leftSection = card.createEl('div', { cls: 'ai-provider-info' })
	leftSection.style.cssText = 'display:flex;flex-direction:column;gap:4px;flex:1;'
	const titleEl = leftSection.createEl('div', { cls: 'ai-provider-title' })
	titleEl.style.cssText = 'font-size:var(--font-ui-medium);font-weight:500;color:var(--text-normal);'
	titleEl.textContent = getSummary(settings.tag, vendor.name)
	context.providerTitleEls.set(index, titleEl)
	const capabilitiesEl = leftSection.createEl('div', { cls: 'ai-provider-capabilities' })
	capabilitiesEl.style.cssText = 'font-size:var(--font-ui-smaller);color:var(--text-muted);'
	capabilitiesEl.textContent = getCapabilityDisplayText(vendor, settings.options)
	context.providerCapabilityEls.set(index, capabilitiesEl)
	const rightSection = card.createEl('div', { cls: 'ai-provider-actions' })
	rightSection.style.cssText = 'display:flex;gap:8px;align-items:center;'
	const deleteBtn = rightSection.createEl('button', { cls: 'ai-provider-delete-btn' })
	deleteBtn.innerHTML =
		'<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>'
	deleteBtn.style.cssText =
		'padding:4px;background:transparent;border:none;cursor:pointer;color:var(--text-muted);display:flex;align-items:center;justify-content:center;border-radius:var(--radius-s);transition:color 0.2s ease, transform 0.1s ease;'
	deleteBtn.title = t('Delete provider')
	deleteBtn.addEventListener('mouseenter', () => {
		deleteBtn.style.color = 'var(--color-red)'
	})
	deleteBtn.addEventListener('mouseleave', () => {
		deleteBtn.style.color = 'var(--text-muted)'
	})
	card.addEventListener('mouseenter', () => {
		card.style.backgroundColor = 'var(--background-modifier-hover)'
		card.style.borderColor = 'var(--interactive-accent)'
	})
	card.addEventListener('mouseleave', () => {
		card.style.backgroundColor = 'var(--background-secondary)'
		card.style.borderColor = 'var(--background-modifier-border)'
	})

	const openConfigModal = () => {
		const modal = new ProviderSettingModal(context.app, getSummary(settings.tag, vendor.name), (modalContainer) =>
			context.renderProviderConfig(modalContainer, index, settings, vendor, modal)
		)
		modal.open()
	}
	card.addEventListener('click', (event) => {
		if (event.target === deleteBtn || (event.target as HTMLElement).closest('button') === deleteBtn) return
		context.setCurrentOpenProviderIndex(index)
		openConfigModal()
	})
	deleteBtn.addEventListener('click', async (event) => {
		event.stopPropagation()
		await context.onDeleteProvider(index, vendor.name)
	})
	if (isOpen) {
		context.setCurrentOpenProviderIndex(index)
		openConfigModal()
	}
}
