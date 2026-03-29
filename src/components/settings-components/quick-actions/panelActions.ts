import { App, Modal, Setting } from 'obsidian'
import type { ChatSettings, QuickAction } from 'src/domains/chat/types'
import type { QuickActionDataService } from 'src/domains/quick-actions/service-data'
import type { ObsidianApiProvider } from 'src/providers/providers.types'
import { localInstance } from 'src/i18n/locals'
import type { ProviderSettings } from 'src/types/provider'
import { openQuickActionEditModal } from './editModal'
import { renderQuickActionsList } from './listRenderer'
import type { QuickActionEditModalOptions } from './types'

interface QuickActionsPanelParams {
	app: App
	containerEl: HTMLElement
	rootContainerEl: HTMLElement
	chatSettings: ChatSettings
	providers: ProviderSettings[]
	promptTemplateFolder: string
	obsidianApi: ObsidianApiProvider
	quickActionDataService: QuickActionDataService
	notify: (message: string, timeout?: number) => void
	quickActionGroupExpandedState: Map<string, boolean>
	resolveActiveQuickActionsListContainer: () => HTMLElement | null
	setActiveQuickActionsListContainer: (container: HTMLElement | null) => void
	isSelectionToolbarCollapsed: boolean
	setSelectionToolbarCollapsed: (value: boolean) => void
	collapsible?: boolean
	updateChatSettings: (partial: Partial<ChatSettings>) => Promise<void>
	refreshQuickActionsCache?: () => Promise<void>
}

const CHEVRON_SVG = `
	<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
		<polyline points="6 9 12 15 18 9"></polyline>
	</svg>
`

const getQuickActionManagementHintText = (chatSettings: ChatSettings): string =>
	localInstance.quick_action_management_hint.replace(
		'{0}',
		String(chatSettings.maxQuickActionButtons ?? 4)
	)

const getQuickActionsFromService = async (
	quickActionDataService: QuickActionDataService
): Promise<QuickAction[]> => {
	await quickActionDataService.initialize()
	return await quickActionDataService.getSortedQuickActions()
}

const saveQuickAction = async (
	quickActionDataService: QuickActionDataService,
	notify: (message: string, timeout?: number) => void,
	quickAction: QuickAction,
	refreshQuickActionsCache?: () => Promise<void>
): Promise<void> => {
	await quickActionDataService.initialize()

	const existingQuickActions = await quickActionDataService.getQuickActions()
	const existingIndex = existingQuickActions.findIndex((item) => item.id === quickAction.id)

	await quickActionDataService.saveQuickAction(quickAction)
	await refreshQuickActionsCache?.()

	notify(
		existingIndex >= 0
			? localInstance.quick_action_edit_updated
			: localInstance.quick_action_edit_created
	)
}

const deleteQuickAction = async (
	quickActionDataService: QuickActionDataService,
	notify: (message: string, timeout?: number) => void,
	quickActionId: string,
	refreshQuickActionsCache?: () => Promise<void>
): Promise<void> => {
	await quickActionDataService.initialize()
	await quickActionDataService.deleteQuickAction(quickActionId)
	await refreshQuickActionsCache?.()
	notify(localInstance.quick_action_edit_deleted)
}

const updateQuickActionShowInToolbar = async (
	quickActionDataService: QuickActionDataService,
	quickActionId: string,
	showInToolbar: boolean,
	refreshQuickActionsCache?: () => Promise<void>
): Promise<void> => {
	await quickActionDataService.initialize()
	await quickActionDataService.updateQuickActionShowInToolbar(quickActionId, showInToolbar)
	await refreshQuickActionsCache?.()
}

const renderList = async (
	params: QuickActionsPanelParams,
	container: HTMLElement
): Promise<void> => {
	await renderQuickActionsList(
		{
			quickActionDataService: params.quickActionDataService,
			notify: params.notify,
			quickActionGroupExpandedState: params.quickActionGroupExpandedState,
			getQuickActionsFromService: () => getQuickActionsFromService(params.quickActionDataService),
			refreshQuickActionsCache: params.refreshQuickActionsCache,
			deleteQuickAction: (quickActionId) =>
				deleteQuickAction(
					params.quickActionDataService,
					params.notify,
					quickActionId,
					params.refreshQuickActionsCache
				),
			updateQuickActionShowInToolbar: (quickActionId, showInToolbar) =>
				updateQuickActionShowInToolbar(
					params.quickActionDataService,
					quickActionId,
					showInToolbar,
					params.refreshQuickActionsCache
				),
			openQuickActionEditModal: (quickAction) =>
				openEditModal(params, quickAction)
		},
		container
	)
}

const openEditModal = async (
	params: QuickActionsPanelParams,
	quickAction?: QuickAction,
	options?: QuickActionEditModalOptions
): Promise<void> => {
	await openQuickActionEditModal(
		{
			app: params.app,
			obsidianApi: params.obsidianApi,
			quickActionDataService: params.quickActionDataService,
			notify: params.notify,
			providers: params.providers,
			promptTemplateFolder: params.promptTemplateFolder,
			refreshQuickActionsCache: params.refreshQuickActionsCache,
			resolveQuickActionsListContainer: () =>
				params.resolveActiveQuickActionsListContainer() ??
				(params.rootContainerEl.querySelector('.quick-actions-list-content') as HTMLElement | null),
			getQuickActionsFromService: () => getQuickActionsFromService(params.quickActionDataService),
			saveQuickAction: (savedQuickAction) =>
				saveQuickAction(
					params.quickActionDataService,
					params.notify,
					savedQuickAction,
					params.refreshQuickActionsCache
				),
			refreshQuickActionsList: (container) => renderList(params, container),
			openQuickActionEditModal: (childQuickAction, childOptions) =>
				openEditModal(params, childQuickAction, childOptions)
		},
		quickAction,
		options
	)
}

const openManagementModal = (params: QuickActionsPanelParams): void => {
	const modal = new Modal(params.app)
	modal.setTitle(localInstance.quick_action_management)

	modal.onOpen = () => {
		const { contentEl } = modal
		contentEl.empty()
		contentEl.style.paddingBottom = '12px'

		const hint = contentEl.createEl('div')
		hint.style.cssText =
			'padding: 6px 4px 10px; color: var(--text-muted); font-size: var(--font-ui-smaller);'
		hint.textContent = getQuickActionManagementHintText(params.chatSettings)

		const listContainer = contentEl.createDiv({ cls: 'quick-actions-list-content' })
		params.setActiveQuickActionsListContainer(listContainer)
		void renderList(params, listContainer)
	}

	modal.onClose = () => {
		params.setActiveQuickActionsListContainer(null)
		modal.contentEl.empty()
	}

	modal.open()
}

export const renderQuickActionsSettingsSection = (params: QuickActionsPanelParams): void => {
	const createActionButtons = (wrapper: HTMLElement) => {
		wrapper.style.cssText =
			'display: flex; align-items: center; justify-content: flex-end; gap: 8px; flex-wrap: wrap;'

		const addButton = wrapper.createEl('button', { cls: 'mod-cta' })
		addButton.textContent = localInstance.quick_action_add
		addButton.style.cssText = 'font-size: var(--font-ui-smaller); padding: 4px 10px;'
		addButton.onclick = async () => {
			await openEditModal(params)
		}

		const manageButton = wrapper.createEl('button')
		manageButton.textContent = localInstance.quick_action_management
		manageButton.style.cssText = 'font-size: var(--font-ui-smaller); padding: 4px 10px;'
		manageButton.onclick = () => {
			openManagementModal(params)
		}
	}

	const isCollapsible = params.collapsible ?? true
	let section: HTMLElement

	if (isCollapsible) {
		const headerSetting = new Setting(params.containerEl)
			.setName(localInstance.selection_toolbar_settings_section)
			.setDesc(localInstance.system_prompt_feature_selection_toolbar_desc)

		const buttonWrapper = headerSetting.controlEl.createDiv({ cls: 'ai-provider-button-wrapper' })
		createActionButtons(buttonWrapper)

		const chevron = buttonWrapper.createEl('div', { cls: 'ai-provider-chevron' })
		chevron.innerHTML = CHEVRON_SVG
		chevron.style.cssText = `
			display: flex;
			align-items: center;
			justify-content: center;
			color: var(--text-muted);
			cursor: pointer;
			transition: transform 0.2s ease;
			transform: ${params.isSelectionToolbarCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)'};
			width: 16px;
			height: 16px;
		`

		const headerEl = headerSetting.settingEl
		headerEl.style.cursor = 'pointer'
		headerEl.style.borderRadius = '0px'
		headerEl.style.border = '1px solid var(--background-modifier-border)'
		headerEl.style.marginBottom = '0px'
		headerEl.style.padding = '12px 12px'

		section = params.containerEl.createDiv({ cls: 'selection-toolbar-settings-container' })
		section.style.padding = '0 8px 8px 8px'
		section.style.backgroundColor = 'var(--background-secondary)'
		section.style.borderRadius = '0px'
		section.style.border = '1px solid var(--background-modifier-border)'
		section.style.borderTop = 'none'
		section.style.display = params.isSelectionToolbarCollapsed ? 'none' : 'block'

		const toggleSection = () => {
			const nextValue = !params.isSelectionToolbarCollapsed
			params.setSelectionToolbarCollapsed(nextValue)
			params.isSelectionToolbarCollapsed = nextValue
			chevron.style.transform = nextValue ? 'rotate(-90deg)' : 'rotate(0deg)'
			section.style.display = nextValue ? 'none' : 'block'
		}

		headerEl.addEventListener('click', (event) => {
			const target = event.target as HTMLElement
			if (target.closest('button') || target.closest('.ai-provider-chevron')) {
				return
			}
			toggleSection()
		})

		chevron.addEventListener('click', (event) => {
			event.stopPropagation()
			toggleSection()
		})
	} else {
		section = params.containerEl.createDiv({ cls: 'selection-toolbar-settings-container' })
		section.style.padding = '8px'
		section.style.backgroundColor = 'var(--background-secondary)'
		section.style.borderRadius = '0px'
		section.style.border = '1px solid var(--background-modifier-border)'

		const toolbar = section.createDiv({ cls: 'quick-actions-settings-toolbar' })
		toolbar.style.cssText =
			'display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; padding: 4px 4px 12px;'

		const desc = toolbar.createDiv({ cls: 'quick-actions-settings-toolbar__desc' })
		desc.style.cssText =
			'flex: 1; min-width: 220px; color: var(--text-muted); font-size: var(--font-ui-small); line-height: 1.5;'
		desc.textContent = localInstance.system_prompt_feature_selection_toolbar_desc

		const buttonWrapper = toolbar.createDiv({ cls: 'ai-provider-button-wrapper' })
		createActionButtons(buttonWrapper)

		const toolbarSeparator = section.createEl('hr')
		toolbarSeparator.style.cssText =
			'margin: 0 0 12px; border: none; border-top: 1px solid var(--background-modifier-border);'
	}

	new Setting(section)
		.setName(localInstance.selection_toolbar_enable)
		.setDesc(localInstance.selection_toolbar_enable_desc)
		.addToggle((toggle) => {
			toggle.setValue(params.chatSettings.enableQuickActions ?? true)
			toggle.onChange(async (value) => {
				await params.updateChatSettings({ enableQuickActions: value })
			})
		})

	new Setting(section)
		.setName(localInstance.selection_toolbar_max_buttons)
		.setDesc(localInstance.selection_toolbar_max_buttons_desc)
		.addSlider((slider) => {
			slider
				.setLimits(2, 12, 1)
				.setValue(params.chatSettings.maxQuickActionButtons ?? 4)
				.setDynamicTooltip()
				.onChange(async (value) => {
					await params.updateChatSettings({ maxQuickActionButtons: value })
				})
		})

	new Setting(section)
		.setName(localInstance.selection_toolbar_stream_output)
		.setDesc(localInstance.selection_toolbar_stream_output_desc)
		.addToggle((toggle) => {
			toggle.setValue(params.chatSettings.quickActionsStreamOutput ?? true)
			toggle.onChange(async (value) => {
				await params.updateChatSettings({ quickActionsStreamOutput: value })
			})
		})

	new Setting(section)
		.setName(localInstance.chat_trigger_symbol)
		.setDesc(localInstance.chat_trigger_symbol_desc)
		.addText((text) => {
			let symbolsArray = params.chatSettings.chatTriggerSymbol ?? ['@']
			if (typeof symbolsArray === 'string') {
				symbolsArray = [symbolsArray]
			}

			text
				.setPlaceholder('@,/,#')
				.setValue(Array.isArray(symbolsArray) ? symbolsArray.join(',') : '@')
				.onChange(async (value) => {
					const symbols = value
						.split(',')
						.map((item) => item.trim())
						.filter((item) => item.length > 0)
					await params.updateChatSettings({
						chatTriggerSymbol: symbols.length > 0 ? symbols : ['@']
					})
				})
			text.inputEl.style.width = '200px'
		})

	new Setting(section)
		.setName(localInstance.chat_trigger_enable)
		.setDesc(localInstance.chat_trigger_enable_desc)
		.addToggle((toggle) => {
			toggle.setValue(params.chatSettings.enableChatTrigger ?? true)
			toggle.onChange(async (value) => {
				await params.updateChatSettings({ enableChatTrigger: value })
			})
		})
}
