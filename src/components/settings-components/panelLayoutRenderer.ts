import { App, Setting } from 'obsidian'
import {
	DEFAULT_MESSAGE_MANAGEMENT_SETTINGS,
	normalizeMessageManagementSettings,
} from 'src/domains/chat/config'
import type { ChatSettings } from 'src/domains/chat/types'
import type { QuickActionDataService } from 'src/domains/quick-actions/service-data'
import type { AiRuntimeSettings } from 'src/domains/settings/types-ai-runtime'
import type { ObsidianApiProvider } from 'src/providers/providers.types'
import { t } from 'src/i18n/ai-runtime/helper'
import { localInstance } from 'src/i18n/locals'
import { renderQuickActionsSettingsSection } from 'src/components/settings-components/quick-actions/panelActions'
import { formatProviderOptionLabel } from 'src/components/chat-components/chatSettingsHelpers'

const CHEVRON_SVG = `
	<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
		<polyline points="6 9 12 15 18 9"></polyline>
	</svg>
`

interface CollapsibleSectionParams {
	containerEl: HTMLElement
	name: string
	desc?: string
	sectionClassName: string
	isCollapsed: () => boolean
	setCollapsed: (value: boolean) => void
	buildHeaderControls?: (wrapper: HTMLElement) => void
	ignoreButtonClicks?: boolean
}

interface AiRuntimePanelLayoutParams {
	app: App
	containerEl: HTMLElement
	rootContainerEl: HTMLElement
	promptTemplateFolder: string
	settings: AiRuntimeSettings
	chatSettings: ChatSettings
	showModelSelectionSection: boolean
	showProvidersSection: boolean
	showProvidersPlainSection: boolean
	showVendorApiKeysSection: boolean
	showQuickActionsSection: boolean
	showTabCompletionSection: boolean
	showQuickActionsPlainSection: boolean
	showTabCompletionPlainSection: boolean
	setProvidersContainerEl: (container: HTMLElement) => void
	renderProvidersGroupedByVendor: () => void
	openCreateProviderConfigModal: () => void
	openVendorApiKeysModal: () => void
	getVendorApiKey: (vendor: string) => string
	setVendorApiKey: (vendor: string, value: string) => void
	normalizeProviderVendor: (vendor: string) => string
	saveSettings: () => Promise<void>
	updateChatSettings: (partial: Partial<ChatSettings>) => Promise<void>
	rerender: (expandLastProvider?: boolean, keepOpenIndex?: number) => void
	quickActionDataService: QuickActionDataService
	obsidianApi: ObsidianApiProvider
	notify: (message: string, timeout?: number) => void
	quickActionGroupExpandedState: Map<string, boolean>
	resolveActiveQuickActionsListContainer: () => HTMLElement | null
	setActiveQuickActionsListContainer: (container: HTMLElement | null) => void
	refreshQuickActionsCache?: () => Promise<void>
	isProvidersCollapsed: () => boolean
	setProvidersCollapsed: (value: boolean) => void
	isVendorApiKeysCollapsed: () => boolean
	setVendorApiKeysCollapsed: (value: boolean) => void
	isSelectionToolbarCollapsed: () => boolean
	setSelectionToolbarCollapsed: (value: boolean) => void
	isTabCompletionCollapsed: () => boolean
	setTabCompletionCollapsed: (value: boolean) => void
}

const renderModelSelectionSection = (params: AiRuntimePanelLayoutParams) => {
	const providers = params.settings.providers ?? []
	const providerOptions = providers.map((provider) => ({
		value: provider.tag,
		label: formatProviderOptionLabel(provider, providers),
	}))
	const messageManagement = normalizeMessageManagementSettings({
		...DEFAULT_MESSAGE_MANAGEMENT_SETTINGS,
		...(params.chatSettings.messageManagement ?? {}),
	})

	new Setting(params.containerEl)
		.setName(localInstance.chat_settings_default_model)
		.setDesc(localInstance.chat_settings_default_model_desc)
		.addDropdown((dropdown) => {
			if (providers.length === 0) {
				dropdown.addOption('', localInstance.chat_settings_no_models)
				dropdown.setValue('')
				dropdown.setDisabled(true)
				return
			}
			for (const option of providerOptions) {
				dropdown.addOption(option.value, option.label)
			}
			dropdown.setValue(params.chatSettings.defaultModel || providers[0]?.tag || '')
			dropdown.onChange((value) => {
				void params.updateChatSettings({ defaultModel: value })
			})
		})

	new Setting(params.containerEl)
		.setName(localInstance.chat_settings_summary_model)
		.setDesc(localInstance.chat_settings_summary_model_desc)
		.addDropdown((dropdown) => {
			dropdown.addOption('', localInstance.chat_settings_summary_model_follow_current)
			for (const option of providerOptions) {
				dropdown.addOption(option.value, option.label)
			}
			dropdown.setValue(messageManagement.summaryModelTag ?? '')
			dropdown.setDisabled(providers.length === 0)
			dropdown.onChange((value) => {
				void params.updateChatSettings({
					messageManagement: {
						...messageManagement,
						summaryModelTag: value || undefined,
					},
				})
			})
		})
}

const applyHeaderStyle = (headerEl: HTMLElement) => {
	headerEl.style.cursor = 'pointer'
	headerEl.style.borderRadius = '0px'
	headerEl.style.border = '1px solid var(--background-modifier-border)'
	headerEl.style.marginBottom = '0px'
	headerEl.style.padding = '12px 12px'
}

const applySectionStyle = (sectionEl: HTMLElement, isCollapsed: boolean) => {
	sectionEl.style.padding = '0 8px 8px 8px'
	sectionEl.style.backgroundColor = 'var(--background-secondary)'
	sectionEl.style.borderRadius = '0px'
	sectionEl.style.border = '1px solid var(--background-modifier-border)'
	sectionEl.style.borderTop = 'none'
	sectionEl.style.display = isCollapsed ? 'none' : 'block'
}

const applyPlainSectionStyle = (sectionEl: HTMLElement) => {
	sectionEl.style.padding = '8px'
	sectionEl.style.backgroundColor = 'var(--background-secondary)'
	sectionEl.style.borderRadius = '0px'
	sectionEl.style.border = '1px solid var(--background-modifier-border)'
	sectionEl.style.display = 'block'
}

const createChevron = (wrapper: HTMLElement, isCollapsed: boolean): HTMLElement => {
	const chevron = wrapper.createEl('div', { cls: 'ai-provider-chevron' })
	chevron.innerHTML = CHEVRON_SVG
	chevron.style.cssText = `
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--text-muted);
		cursor: pointer;
		transition: transform 0.2s ease;
		transform: ${isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)'};
		width: 16px;
		height: 16px;
	`
	return chevron
}

const createCollapsibleSection = (params: CollapsibleSectionParams) => {
	const headerSetting = new Setting(params.containerEl).setName(params.name)
	if (params.desc) {
		headerSetting.setDesc(params.desc)
	}

	const controlWrapper = headerSetting.controlEl.createDiv({ cls: 'ai-provider-button-wrapper' })
	controlWrapper.style.cssText =
		'display: flex; align-items: center; justify-content: flex-end; gap: 8px;'
	params.buildHeaderControls?.(controlWrapper)
	const chevron = createChevron(controlWrapper, params.isCollapsed())

	applyHeaderStyle(headerSetting.settingEl)
	const sectionEl = params.containerEl.createDiv({ cls: params.sectionClassName })
	applySectionStyle(sectionEl, params.isCollapsed())

	const toggle = () => {
		const nextValue = !params.isCollapsed()
		params.setCollapsed(nextValue)
		chevron.style.transform = nextValue ? 'rotate(-90deg)' : 'rotate(0deg)'
		sectionEl.style.display = nextValue ? 'none' : 'block'
	}

	headerSetting.settingEl.addEventListener('click', (event) => {
		const target = event.target as HTMLElement
		if (params.ignoreButtonClicks !== false && target.closest('button')) {
			return
		}
		if (target.closest('.ai-provider-chevron')) {
			return
		}
		toggle()
	})

	chevron.addEventListener('click', (event) => {
		event.stopPropagation()
		toggle()
	})

	return { headerSetting, sectionEl }
}

const createPlainSectionContainer = (
	containerEl: HTMLElement,
	sectionClassName: string
): HTMLElement => {
	const sectionEl = containerEl.createDiv({ cls: sectionClassName })
	applyPlainSectionStyle(sectionEl)
	return sectionEl
}

const renderTabCompletionSection = (params: AiRuntimePanelLayoutParams): void => {
	const sectionEl = params.showTabCompletionPlainSection
		? createPlainSectionContainer(params.containerEl, 'tab-completion-settings-container')
		: createCollapsibleSection({
			containerEl: params.containerEl,
			name: t('AI Tab completion'),
			sectionClassName: 'tab-completion-settings-container',
			isCollapsed: params.isTabCompletionCollapsed,
			setCollapsed: params.setTabCompletionCollapsed
		}).sectionEl

	new Setting(sectionEl)
		.setName(t('Enable Tab completion'))
		.setDesc(t('Enable Tab completion description'))
		.addToggle((toggle) =>
			toggle.setValue(params.settings.enableTabCompletion ?? false).onChange(async (value) => {
				params.settings.enableTabCompletion = value
				await params.saveSettings()
			})
		)

	new Setting(sectionEl)
		.setName(t('Tab completion trigger key'))
		.setDesc(t('Tab completion trigger key description'))
		.addDropdown((dropdown) =>
			dropdown
				.addOptions({
					Alt: t('Alt key'),
					'Ctrl-Space': 'Ctrl + Space',
					'Alt-Tab': 'Alt + Tab'
				})
				.setValue(params.settings.tabCompletionTriggerKey ?? 'Alt')
				.onChange(async (value) => {
					params.settings.tabCompletionTriggerKey = value
					await params.saveSettings()
				})
		)

	new Setting(sectionEl)
		.setName(t('Tab completion AI provider'))
		.setDesc(t('Tab completion AI provider description'))
		.addDropdown((dropdown) => {
			dropdown.addOption('', t('Auto select first available'))
			params.settings.providers.forEach((provider) => {
				dropdown.addOption(provider.tag, formatProviderOptionLabel(provider, params.settings.providers))
			})
			dropdown.setValue(params.settings.tabCompletionProviderTag ?? '')
			dropdown.onChange(async (value) => {
				params.settings.tabCompletionProviderTag = value
				await params.saveSettings()
			})
		})

	new Setting(sectionEl)
		.setName(t('Tab completion context before'))
		.setDesc(t('Tab completion context before description'))
		.addSlider((slider) =>
			slider
				.setLimits(200, 3000, 100)
				.setValue(params.settings.tabCompletionContextLengthBefore ?? 1000)
				.setDynamicTooltip()
				.onChange(async (value) => {
					params.settings.tabCompletionContextLengthBefore = value
					await params.saveSettings()
				})
		)

	new Setting(sectionEl)
		.setName(t('Tab completion context after'))
		.setDesc(t('Tab completion context after description'))
		.addSlider((slider) =>
			slider
				.setLimits(0, 1500, 100)
				.setValue(params.settings.tabCompletionContextLengthAfter ?? 500)
				.setDynamicTooltip()
				.onChange(async (value) => {
					params.settings.tabCompletionContextLengthAfter = value
					await params.saveSettings()
				})
		)

	new Setting(sectionEl)
		.setName(t('Tab completion timeout'))
		.setDesc(t('Tab completion timeout description'))
		.addSlider((slider) =>
			slider
				.setLimits(3, 30, 1)
				.setValue((params.settings.tabCompletionTimeout ?? 5000) / 1000)
				.setDynamicTooltip()
				.onChange(async (value) => {
					params.settings.tabCompletionTimeout = value * 1000
					await params.saveSettings()
				})
		)

	new Setting(sectionEl)
		.setName(t('Tab completion prompt template'))
		.setDesc(t('Tab completion prompt template description'))
		.addTextArea((text) => {
			text.setPlaceholder('{{rules}}\n\n{{context}}')
			text.setValue(params.settings.tabCompletionPromptTemplate ?? '{{rules}}\n\n{{context}}')
			text.onChange(async (value) => {
				params.settings.tabCompletionPromptTemplate = value
				await params.saveSettings()
			})
			text.inputEl.style.minHeight = '90px'
			text.inputEl.style.width = '100%'
		})
}

export const renderAiRuntimeSettingsPanelLayout = (
	params: AiRuntimePanelLayoutParams,
	expandLastProvider = false,
	keepOpenIndex = -1
): void => {
	params.containerEl.empty()

	if (params.showModelSelectionSection) {
		renderModelSelectionSection(params)
	}

	if (params.showProvidersSection) {
		let providersSectionEl: HTMLElement
		if (params.showProvidersPlainSection) {
			const headerSetting = new Setting(params.containerEl)
				.setName(t('New AI assistant'))
			headerSetting.addButton((btn) => {
				btn.setButtonText(t('API key'))
					.onClick(() => {
						params.openVendorApiKeysModal()
					})
			})
			headerSetting.addButton((btn) => {
				btn.setButtonText(t('Add AI Provider'))
					.setCta()
					.onClick(() => {
						params.openCreateProviderConfigModal()
					})
			})
			providersSectionEl = createPlainSectionContainer(params.containerEl, 'ai-providers-container')
		} else {
			const section = createCollapsibleSection({
				containerEl: params.containerEl,
				name: t('New AI assistant'),
				sectionClassName: 'ai-providers-container',
				isCollapsed: params.isProvidersCollapsed,
				setCollapsed: params.setProvidersCollapsed,
				buildHeaderControls: (wrapper) => {
					const apiKeyButton = wrapper.createEl('button')
					apiKeyButton.textContent = t('API key')
					apiKeyButton.onclick = () => {
						params.openVendorApiKeysModal()
					}
					const addButton = wrapper.createEl('button', { cls: 'mod-cta' })
					addButton.textContent = t('Add AI Provider')
					addButton.onclick = () => {
						params.openCreateProviderConfigModal()
					}
				}
			})
			providersSectionEl = section.sectionEl
		}
		params.setProvidersContainerEl(providersSectionEl)

		if (params.settings.providers.length > 0) {
			void expandLastProvider
			void keepOpenIndex
			params.renderProvidersGroupedByVendor()
		}
	}

	if (params.showQuickActionsSection) {
		renderQuickActionsSettingsSection({
			app: params.app,
			containerEl: params.containerEl,
			rootContainerEl: params.rootContainerEl,
			chatSettings: params.chatSettings,
			providers: params.settings.providers || [],
			promptTemplateFolder: params.promptTemplateFolder,
			obsidianApi: params.obsidianApi,
			quickActionDataService: params.quickActionDataService,
			notify: params.notify,
			quickActionGroupExpandedState: params.quickActionGroupExpandedState,
			resolveActiveQuickActionsListContainer: params.resolveActiveQuickActionsListContainer,
			setActiveQuickActionsListContainer: params.setActiveQuickActionsListContainer,
			isSelectionToolbarCollapsed: params.isSelectionToolbarCollapsed(),
			setSelectionToolbarCollapsed: params.setSelectionToolbarCollapsed,
			collapsible: !params.showQuickActionsPlainSection,
			updateChatSettings: params.updateChatSettings,
			refreshQuickActionsCache: params.refreshQuickActionsCache
		})
	}

	if (params.showTabCompletionSection) {
		renderTabCompletionSection(params)
	}
}
