import { App, Setting } from 'obsidian'
import { ollamaVendor } from 'src/LLMProviders/ollama'
import { DebugLogger } from 'src/utils/DebugLogger'
import { t } from 'src/i18n/ai-runtime/helper'
import { SelectVendorModal } from 'src/components/modals/AiRuntimeProviderModals'
import { availableVendors, resolveToolExecutionSettings, syncToolExecutionSettings } from 'src/settings/ai-runtime'
import type { AiRuntimeSettings } from 'src/settings/ai-runtime'
import { localInstance } from 'src/i18n/locals'
import type { ChatSettings } from 'src/types/chat'
import type { Vendor } from 'src/types/provider'
import { renderQuickActionsSettingsSection } from 'src/components/settings-components/quick-actions/panelActions'

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
	setProvidersContainerEl: (container: HTMLElement) => void
	renderProvidersGroupedByVendor: (expandLastProvider: boolean, keepOpenIndex: number) => void
	getVendorApiKey: (vendor: string) => string
	setVendorApiKey: (vendor: string, value: string) => void
	normalizeProviderVendor: (vendor: string) => string
	saveSettings: () => Promise<void>
	updateChatSettings: (partial: Partial<ChatSettings>) => Promise<void>
	rerender: (expandLastProvider?: boolean, keepOpenIndex?: number) => void
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
	isAdvancedCollapsed: () => boolean
	setAdvancedCollapsed: (value: boolean) => void
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

const renderVendorApiKeySection = (params: AiRuntimePanelLayoutParams): void => {
	const { sectionEl } = createCollapsibleSection({
		containerEl: params.containerEl,
		name: t('Vendor API keys'),
		desc: t('Vendor API keys description'),
		sectionClassName: 'vendor-api-keys-container',
		isCollapsed: params.isVendorApiKeysCollapsed,
		setCollapsed: params.setVendorApiKeysCollapsed
	})

	const vendors = availableVendors
		.filter((vendor) => vendor.name !== ollamaVendor.name)
		.map((vendor) => params.normalizeProviderVendor(vendor.name))
	const uniqueVendors = Array.from(new Set(vendors))

	for (const vendorName of uniqueVendors) {
		let inputEl: HTMLInputElement | null = null
		let isPasswordVisible = false

		new Setting(sectionEl)
			.setName(`${vendorName} ${t('API key')}`)
			.setDesc(t('Vendor API key empty description'))
			.addText((text) => {
				inputEl = text.inputEl
				inputEl.type = 'password'
				text
					.setPlaceholder(t('API key'))
					.setValue(params.getVendorApiKey(vendorName))
					.onChange(async (value) => {
						params.setVendorApiKey(vendorName, value)
						await params.saveSettings()
					})
			})
			.addButton((btn) => {
				btn
					.setIcon('eye-off')
					.setTooltip(t('Show or hide secret'))
					.onClick(() => {
						isPasswordVisible = !isPasswordVisible
						if (inputEl) {
							inputEl.type = isPasswordVisible ? 'text' : 'password'
						}
						btn.setIcon(isPasswordVisible ? 'eye' : 'eye-off')
					})
			})
	}
}

const renderTabCompletionSection = (params: AiRuntimePanelLayoutParams): void => {
	const { sectionEl } = createCollapsibleSection({
		containerEl: params.containerEl,
		name: t('AI Tab completion'),
		sectionClassName: 'tab-completion-settings-container',
		isCollapsed: params.isTabCompletionCollapsed,
		setCollapsed: params.setTabCompletionCollapsed
	})

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
				dropdown.addOption(provider.tag, provider.tag)
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

const renderAdvancedSection = (params: AiRuntimePanelLayoutParams): void => {
	const { sectionEl } = createCollapsibleSection({
		containerEl: params.containerEl,
		name: t('Advanced'),
		sectionClassName: 'advanced-settings-container',
		isCollapsed: params.isAdvancedCollapsed,
		setCollapsed: params.setAdvancedCollapsed
	})

	const sharedToolExecutionSettings = resolveToolExecutionSettings(params.settings)

	new Setting(sectionEl)
		.setName(localInstance.tool_execution_max_tool_calls)
		.setDesc(localInstance.tool_execution_max_tool_calls_desc)
		.addText((text) =>
			text
				.setPlaceholder(String(sharedToolExecutionSettings.maxToolCalls))
				.setValue(String(sharedToolExecutionSettings.maxToolCalls))
				.onChange(async (value) => {
					const parsed = Number.parseInt(value, 10)
					if (!Number.isFinite(parsed) || parsed < 1) {
						return
					}
					syncToolExecutionSettings(params.settings, { maxToolCalls: parsed })
					await params.saveSettings()
				})
		)

	new Setting(sectionEl)
		.setName(localInstance.tool_execution_timeout)
		.setDesc(localInstance.tool_execution_timeout_desc)
		.addText((text) =>
			text
				.setPlaceholder(String(sharedToolExecutionSettings.timeoutMs))
				.setValue(String(sharedToolExecutionSettings.timeoutMs))
				.onChange(async (value) => {
					const parsed = Number.parseInt(value, 10)
					if (!Number.isFinite(parsed) || parsed < 1000) {
						return
					}
					syncToolExecutionSettings(params.settings, { timeoutMs: parsed })
					await params.saveSettings()
				})
		)

	new Setting(sectionEl)
		.setName(t('Debug mode'))
		.setDesc(t('Debug mode description'))
		.addToggle((toggle) =>
			toggle.setValue(params.settings.debugMode ?? false).onChange(async (value) => {
				params.settings.debugMode = value
				await params.saveSettings()
				DebugLogger.setDebugMode(value)
			})
		)

	new Setting(sectionEl)
		.setName(t('LLM console log'))
		.setDesc(t('LLM console log description'))
		.addToggle((toggle) =>
			toggle.setValue(params.settings.enableLlmConsoleLog ?? false).onChange(async (value) => {
				params.settings.enableLlmConsoleLog = value
				await params.saveSettings()
				DebugLogger.setLlmConsoleLogEnabled(value)
			})
		)

	new Setting(sectionEl)
		.setName(t('LLM response preview length'))
		.setDesc(t('LLM response preview length description'))
		.addText((text) =>
			text
				.setPlaceholder('100')
				.setValue(String(params.settings.llmResponsePreviewChars ?? 100))
				.onChange(async (value) => {
					const parsed = Number.parseInt(value, 10)
					const previewChars = Number.isFinite(parsed) && parsed >= 0 ? parsed : 100
					params.settings.llmResponsePreviewChars = previewChars
					await params.saveSettings()
					DebugLogger.setLlmResponsePreviewChars(previewChars)
				})
		)

	new Setting(sectionEl)
		.setName(t('Debug log level'))
		.setDesc(t('Debug log level description'))
		.addDropdown((dropdown) =>
			dropdown
				.addOption('debug', t('Debug log level debug option'))
				.addOption('info', t('Debug log level info option'))
				.addOption('warn', t('Debug log level warn option'))
				.addOption('error', t('Debug log level error option'))
				.setValue(params.settings.debugLevel ?? 'error')
				.onChange(async (value) => {
					const debugLevel = value as AiRuntimeSettings['debugLevel']
					params.settings.debugLevel = debugLevel
					await params.saveSettings()
					DebugLogger.setDebugLevel(debugLevel)
				})
		)
}

export const renderAiRuntimeSettingsPanelLayout = (
	params: AiRuntimePanelLayoutParams,
	expandLastProvider = false,
	keepOpenIndex = -1
): void => {
	params.containerEl.empty()

	const { sectionEl: providersSectionEl } = createCollapsibleSection({
		containerEl: params.containerEl,
		name: t('New AI assistant'),
		desc: t('For those compatible with the OpenAI protocol, you can select OpenAI.'),
		sectionClassName: 'ai-providers-container',
		isCollapsed: params.isProvidersCollapsed,
		setCollapsed: params.setProvidersCollapsed,
		buildHeaderControls: (wrapper) => {
			const addButton = wrapper.createEl('button', { cls: 'mod-cta' })
			addButton.textContent = t('Add AI Provider')
			addButton.onclick = async () => {
				const onChoose = async (vendor: Vendor) => {
					const defaultTag = vendor.name
					const isTagDuplicate = params.settings.providers
						.map((provider) => provider.tag)
						.includes(defaultTag)
					const newTag = isTagDuplicate ? '' : defaultTag
					const deepCopiedOptions = JSON.parse(JSON.stringify(vendor.defaultOptions))
					if (vendor.name !== ollamaVendor.name) {
						deepCopiedOptions.apiKey = params.getVendorApiKey(vendor.name)
					}
					params.settings.providers.push({
						tag: newTag,
						vendor: vendor.name,
						options: deepCopiedOptions
					})
					await params.saveSettings()
					params.setProvidersCollapsed(false)
					params.rerender(true)
				}
				new SelectVendorModal(params.app, availableVendors, onChoose).open()
			}
		}
	})
	params.setProvidersContainerEl(providersSectionEl)

	if (!params.settings.providers.length) {
		const emptyTip = providersSectionEl.createEl('div', { cls: 'ai-providers-empty-tip' })
		emptyTip.textContent = t('Please add at least one AI assistant to start using the plugin.')
		emptyTip.style.cssText = `
			padding: 12px;
			color: var(--text-muted);
			font-size: var(--font-ui-small);
			text-align: center;
			font-style: italic;
		`
	} else {
		params.renderProvidersGroupedByVendor(expandLastProvider, keepOpenIndex)
	}

	renderVendorApiKeySection(params)
	renderQuickActionsSettingsSection({
		app: params.app,
		containerEl: params.containerEl,
		rootContainerEl: params.rootContainerEl,
		chatSettings: params.chatSettings,
		providers: params.settings.providers || [],
		promptTemplateFolder: params.promptTemplateFolder,
		quickActionGroupExpandedState: params.quickActionGroupExpandedState,
		resolveActiveQuickActionsListContainer: params.resolveActiveQuickActionsListContainer,
		setActiveQuickActionsListContainer: params.setActiveQuickActionsListContainer,
		isSelectionToolbarCollapsed: params.isSelectionToolbarCollapsed(),
		setSelectionToolbarCollapsed: params.setSelectionToolbarCollapsed,
		updateChatSettings: params.updateChatSettings,
		refreshQuickActionsCache: params.refreshQuickActionsCache
	})
	renderTabCompletionSection(params)
	renderAdvancedSection(params)
}
