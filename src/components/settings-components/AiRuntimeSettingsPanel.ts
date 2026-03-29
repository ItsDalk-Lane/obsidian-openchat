import { App } from 'obsidian'
import { renderAiRuntimeSettingsPanelLayout } from 'src/components/settings-components/panelLayoutRenderer'
import {
	AiRuntimeQuickActionsManager,
	AiRuntimeReasoningCapabilityManager,
	AiRuntimeVendorApiKeyManager,
} from 'src/components/settings-components/AiRuntimeSettingsPanelSupport'
import { renderProvidersGroupedByVendor } from 'src/components/settings-components/provider-config/providerCards'
import { renderProviderConfigForPanel } from 'src/components/settings-components/provider-config/panelRenderBridge'
import { testProviderConfiguration } from 'src/components/settings-components/provider-config/providerTest'
import { ProviderGroupConfigModal, createNewProviderGroupDraft } from 'src/components/settings-components/provider-config/ProviderGroupConfigModal'
import { buildProviderGroups, buildProvidersFromDraft, createDraftFromGroup, type ProviderGroupDraft, type ProviderGroupRecord } from 'src/components/settings-components/provider-config/providerGroupAdapter'
import type { ChatSettings } from 'src/domains/chat/types'
import { availableVendors } from 'src/domains/settings/config-ai-runtime-vendors'
import type { AiRuntimeSettings } from 'src/domains/settings/types-ai-runtime'
import { t } from 'src/i18n/ai-runtime/helper'
import { ProviderSettingModal } from 'src/components/modals/AiRuntimeProviderModals'
import { ProviderSettings, Vendor } from 'src/types/provider'
import { getCapabilityDisplayText } from 'src/LLMProviders/utils'
import { type ReasoningCapabilityRecord } from 'src/LLMProviders/modelCapability'
import type { McpRuntimeManager } from 'src/domains/mcp/types'
import type { ObsidianApiProvider } from 'src/providers/providers.types'
import { isCustomOpenChatProvider } from 'src/utils/aiProviderMetadata'
export interface AiRuntimeSettingsContext {
	getObsidianApiProvider: () => ObsidianApiProvider
	getSettings: () => AiRuntimeSettings
	getChatSettings: () => ChatSettings
	getAiDataFolder: () => string
	getPromptTemplateFolder: () => string
	saveSettings: () => Promise<void>
	updateChatSettings: (partial: Partial<ChatSettings>) => Promise<void>
	refreshQuickActionsCache?: () => Promise<void>
	getMcpClientManager?: () => McpRuntimeManager | null
}
export interface AiRuntimeSettingsPanelSections {
	modelSelection?: boolean
	providers?: boolean
	vendorApiKeys?: boolean
	quickActions?: boolean
	tabCompletion?: boolean
}
export interface AiRuntimeSettingsPanelOptions {
	sections?: AiRuntimeSettingsPanelSections
	plainSections?: AiRuntimeSettingsPanelSections
	initialCollapsed?: AiRuntimeSettingsPanelSections
	state?: AiRuntimeSettingsPanelState
}
export interface AiRuntimeSettingsPanelState {
	isProvidersCollapsed?: boolean
	isVendorApiKeysCollapsed?: boolean
	isQuickActionsCollapsed?: boolean
	isTabCompletionCollapsed?: boolean
	quickActionGroupExpandedState?: Map<string, boolean>
	vendorGroupExpandedState?: Map<string, boolean>
}
export class AiRuntimeSettingsPanel {
	private containerEl!: HTMLElement
	private providersContainerEl!: HTMLElement
	private providerTitleEls = new Map<number, HTMLElement>()
	private providerCapabilityEls = new Map<number, HTMLElement>()
	private currentOpenProviderIndex = -1
	private autoSaveEnabled = true
	private isProvidersCollapsed = true // 默认折叠列表
	private isSelectionToolbarCollapsed = true // 默认折叠AI划词设置
	private isTabCompletionCollapsed = true // 默认折叠Tab补全设置
	private isVendorApiKeysCollapsed = true // 默认折叠模型提供商密钥设置
	private doubaoRenderers = new Map<unknown, () => void>()
	private quickActionGroupExpandedState = new Map<string, boolean>()
	private activeQuickActionsListContainer: HTMLElement | null = null
	/** 各服务商分组的展开/折叠状态（vendorName → isExpanded） */
	private vendorGroupExpandedState = new Map<string, boolean>()
	private readonly sections: Required<AiRuntimeSettingsPanelSections>
	private readonly plainSections: Required<AiRuntimeSettingsPanelSections>
	private readonly sharedState?: AiRuntimeSettingsPanelState
	private readonly reasoningCapabilityManager = new AiRuntimeReasoningCapabilityManager()
	private readonly vendorApiKeyManager = new AiRuntimeVendorApiKeyManager()
	private readonly quickActionsManager: AiRuntimeQuickActionsManager
	constructor(
		private readonly app: App,
		private readonly settingsContext: AiRuntimeSettingsContext,
		options?: AiRuntimeSettingsPanelOptions
	) {
		this.sharedState = options?.state
		this.quickActionsManager = new AiRuntimeQuickActionsManager(
			this.settingsContext.getObsidianApiProvider(),
			() => this.settingsContext.getAiDataFolder(),
			(quickActions) => {
				this.settingsContext.getChatSettings().quickActions = quickActions
			},
		)
		this.sections = {
			modelSelection: options?.sections?.modelSelection ?? false,
			providers: options?.sections?.providers ?? true,
			vendorApiKeys: options?.sections?.vendorApiKeys ?? true,
			quickActions: options?.sections?.quickActions ?? true,
			tabCompletion: options?.sections?.tabCompletion ?? true,
		}
		this.plainSections = {
			modelSelection: options?.plainSections?.modelSelection ?? false,
			providers: options?.plainSections?.providers ?? false,
			vendorApiKeys: options?.plainSections?.vendorApiKeys ?? false,
			quickActions: options?.plainSections?.quickActions ?? false,
			tabCompletion: options?.plainSections?.tabCompletion ?? false,
		}
		if (this.sharedState) {
			if (!this.sharedState.quickActionGroupExpandedState) {
				this.sharedState.quickActionGroupExpandedState = new Map<string, boolean>()
			}
			if (!this.sharedState.vendorGroupExpandedState) {
				this.sharedState.vendorGroupExpandedState = new Map<string, boolean>()
			}
			this.quickActionGroupExpandedState = this.sharedState.quickActionGroupExpandedState
			this.vendorGroupExpandedState = this.sharedState.vendorGroupExpandedState
		} else {
			this.quickActionGroupExpandedState = new Map<string, boolean>()
			this.vendorGroupExpandedState = new Map<string, boolean>()
		}
		this.isProvidersCollapsed =
			this.sharedState?.isProvidersCollapsed
			?? options?.initialCollapsed?.providers
			?? true
		this.isVendorApiKeysCollapsed =
			this.sharedState?.isVendorApiKeysCollapsed
			?? options?.initialCollapsed?.vendorApiKeys
			?? true
		this.isSelectionToolbarCollapsed =
			this.sharedState?.isQuickActionsCollapsed
			?? options?.initialCollapsed?.quickActions
			?? true
		this.isTabCompletionCollapsed =
			this.sharedState?.isTabCompletionCollapsed
			?? options?.initialCollapsed?.tabCompletion
			?? true
	}

	private get settings() {
		return this.settingsContext.getSettings()
	}
	private get chatSettings() {
		return this.settingsContext.getChatSettings()
	}
	private async saveSettings() {
		if (this.autoSaveEnabled) {
			await this.settingsContext.saveSettings()
		}
	}
	private notify(message: string, timeout?: number): void {
		this.settingsContext.getObsidianApiProvider().notify(message, timeout)
	}
	private async updateChatSettings(partial: Partial<ChatSettings>) {
		await this.settingsContext.updateChatSettings(partial)
	}
	private getReasoningCapabilityHintText(record: ReasoningCapabilityRecord): string {
		return t(this.reasoningCapabilityManager.getReasoningCapabilityHintText(record))
	}
	private normalizeProviderVendor(vendor: string): string {
		return this.vendorApiKeyManager.normalizeProviderVendor(vendor)
	}
	private isCustomProvider(provider: Pick<ProviderSettings, 'options'>): boolean {
		return isCustomOpenChatProvider(provider.options?.parameters)
	}
	private getVendorApiKey(vendor: string): string {
		return this.vendorApiKeyManager.getVendorApiKey(this.settings, vendor)
	}
	private setVendorApiKey(vendor: string, value: string): void {
		this.vendorApiKeyManager.setVendorApiKey(this.settings, vendor, value)
	}
	private syncProviderApiKeysByVendor(vendor: string): void {
		this.vendorApiKeyManager.syncProviderApiKeysByVendor(this.settings, vendor)
	}
	private syncAllProviderApiKeys(): void {
		this.vendorApiKeyManager.syncAllProviderApiKeys(this.settings)
	}
	private async probeReasoningCapability(
		provider: ProviderSettings,
		vendor: Vendor
	): Promise<ReasoningCapabilityRecord> {
		return await this.reasoningCapabilityManager.probeReasoningCapability(provider, vendor)
	}
	private openVendorApiKeysModal(): void {
		this.vendorApiKeyManager.openVendorApiKeysModal(this.app, this.settings, async () => {
			await this.saveSettings()
		})
	}

	render(containerEl: HTMLElement, expandLastProvider = false, keepOpenIndex = -1): void {
		this.containerEl = containerEl
		this.syncAllProviderApiKeys()
		this.providerTitleEls.clear()

		renderAiRuntimeSettingsPanelLayout(
			{
				app: this.app,
				containerEl,
				rootContainerEl: this.containerEl,
				promptTemplateFolder: this.settingsContext.getPromptTemplateFolder(),
				settings: this.settings,
				chatSettings: this.chatSettings,
				showModelSelectionSection: this.sections.modelSelection,
				showProvidersSection: this.sections.providers,
				showProvidersPlainSection: this.plainSections.providers,
				showVendorApiKeysSection: this.sections.vendorApiKeys,
				showQuickActionsSection: this.sections.quickActions,
				showTabCompletionSection: this.sections.tabCompletion,
				showQuickActionsPlainSection: this.plainSections.quickActions,
				showTabCompletionPlainSection: this.plainSections.tabCompletion,
				setProvidersContainerEl: (providersContainer) => {
					this.providersContainerEl = providersContainer
				},
				renderProvidersGroupedByVendor: () => this.renderProvidersGroupedByVendor(),
				openCreateProviderConfigModal: () => this.openCreateProviderConfigModal(),
				openVendorApiKeysModal: () => this.openVendorApiKeysModal(),
				getVendorApiKey: (vendor) => this.getVendorApiKey(vendor),
				setVendorApiKey: (vendor, value) => this.setVendorApiKey(vendor, value),
				normalizeProviderVendor: (vendor) => this.normalizeProviderVendor(vendor),
				saveSettings: () => this.saveSettings(),
				updateChatSettings: (partial) => this.updateChatSettings(partial),
				rerender: (shouldExpandLastProvider, nextKeepOpenIndex) =>
					this.render(
						this.containerEl,
						shouldExpandLastProvider ?? false,
						nextKeepOpenIndex ?? -1
					),
				quickActionDataService: this.quickActionsManager.getDataService(),
				obsidianApi: this.settingsContext.getObsidianApiProvider(),
				notify: (message, timeout) => this.quickActionsManager.notify(message, timeout),
				quickActionGroupExpandedState: this.quickActionGroupExpandedState,
				resolveActiveQuickActionsListContainer: () =>
					this.activeQuickActionsListContainer?.isConnected
						? this.activeQuickActionsListContainer
						: null,
				setActiveQuickActionsListContainer: (nextContainer) => {
					this.activeQuickActionsListContainer = nextContainer
				},
				refreshQuickActionsCache: this.settingsContext.refreshQuickActionsCache,
				isProvidersCollapsed: () => this.isProvidersCollapsed,
				setProvidersCollapsed: (value) => {
					this.isProvidersCollapsed = value
					if (this.sharedState) {
						this.sharedState.isProvidersCollapsed = value
					}
				},
				isVendorApiKeysCollapsed: () => this.isVendorApiKeysCollapsed,
				setVendorApiKeysCollapsed: (value) => {
					this.isVendorApiKeysCollapsed = value
					if (this.sharedState) {
						this.sharedState.isVendorApiKeysCollapsed = value
					}
				},
				isSelectionToolbarCollapsed: () => this.isSelectionToolbarCollapsed,
				setSelectionToolbarCollapsed: (value) => {
					this.isSelectionToolbarCollapsed = value
					if (this.sharedState) {
						this.sharedState.isQuickActionsCollapsed = value
					}
				},
				isTabCompletionCollapsed: () => this.isTabCompletionCollapsed,
				setTabCompletionCollapsed: (value) => {
					this.isTabCompletionCollapsed = value
					if (this.sharedState) {
						this.sharedState.isTabCompletionCollapsed = value
					}
				}
			},
			expandLastProvider,
			keepOpenIndex
		)
	}

	dispose(): void {
		this.providerTitleEls.clear()
		this.providerCapabilityEls.clear()
		this.doubaoRenderers.clear()
		this.activeQuickActionsListContainer = null
		if (!this.sharedState) {
			this.quickActionGroupExpandedState.clear()
			this.vendorGroupExpandedState.clear()
		}
	}

	private updateProviderCapabilities(index: number, settings: ProviderSettings) {
		const vendor = availableVendors.find((v) => v.name === settings.vendor)
		if (!vendor) return

		const capabilitiesEl = this.providerCapabilityEls.get(index)
		if (capabilitiesEl) {
			capabilitiesEl.textContent = getCapabilityDisplayText(vendor, settings.options)
		}
	}

	private renderProvidersGroupedByVendor() {
		const groups = buildProviderGroups(this.settings.providers)
		renderProvidersGroupedByVendor(
			{
				app: this.app,
				containerEl: this.containerEl,
				providersContainerEl: this.providersContainerEl,
				groups,
				providerTitleEls: this.providerTitleEls,
				providerCapabilityEls: this.providerCapabilityEls,
				vendorGroupExpandedState: this.vendorGroupExpandedState,
				onEditGroup: (group) => {
					this.openEditProviderGroupModal(group)
				},
				onDeleteGroup: async (group) => {
					await this.deleteProviderGroup(group)
				},
				setCurrentOpenProviderIndex: (_index) => {
					return
				}
			},
			false,
			-1
		)
	}

	private async commitProviderGroupDraft(draft: ProviderGroupDraft): Promise<void> {
		const vendor = availableVendors.find((item) => item.name === draft.protocolVendorName)
		if (!vendor) {
			return
		}

		const nextProviders = buildProvidersFromDraft(
			draft,
			vendor,
			this.settings.providers,
			draft.existingIndices
		)
		const existingIndices = [...draft.existingIndices].sort((left, right) => left - right)
		const remainingProviders = this.settings.providers.filter((_, index) => !existingIndices.includes(index))
		const insertIndex = existingIndices.length > 0 ? existingIndices[0] : remainingProviders.length
		const before = remainingProviders.slice(0, insertIndex)
		const after = remainingProviders.slice(insertIndex)
		const removedTags = this.settings.providers
			.filter((_, index) => existingIndices.includes(index))
			.map((provider) => provider.tag)
		const nextTags = new Set(nextProviders.map((provider) => provider.tag))
		const deletedTags = removedTags.filter((tag) => !nextTags.has(tag))

		this.settings.providers = [...before, ...nextProviders, ...after]
		if (draft.source !== 'custom') {
			this.setVendorApiKey(vendor.name, draft.apiKey)
		}
		if (deletedTags.includes(this.settings.tabCompletionProviderTag)) {
			this.settings.tabCompletionProviderTag = ''
		}
		const chatSettingsUpdate: Partial<ChatSettings> = {}
		if (deletedTags.includes(this.chatSettings.defaultModel)) {
			chatSettingsUpdate.defaultModel = ''
		}
		const summaryModelTag = this.chatSettings.messageManagement?.summaryModelTag
		if (summaryModelTag && deletedTags.includes(summaryModelTag)) {
			chatSettingsUpdate.messageManagement = {
				...this.chatSettings.messageManagement,
				summaryModelTag: undefined,
			}
		}
		if (Object.keys(chatSettingsUpdate).length > 0) {
			await this.updateChatSettings(chatSettingsUpdate)
		}
		await this.settingsContext.saveSettings()
		this.render(this.containerEl)
	}

	private async deleteProviderGroup(group: ProviderGroupRecord): Promise<void> {
		const draft = createDraftFromGroup(group)
		draft.models = []
		await this.commitProviderGroupDraft(draft)
	}

	private openCreateProviderConfigModal(): void {
		const draft = createNewProviderGroupDraft()
		const modal = new ProviderGroupConfigModal(this.app, {
			mode: 'create',
			draft,
			title: t('Add AI Provider'),
			getVendorApiKey: (vendorName) => this.getVendorApiKey(vendorName),
			onCommit: async (nextDraft) => {
				if (nextDraft.models.length === 0) {
					return
				}
				await this.commitProviderGroupDraft(nextDraft)
			},
			probeReasoningCapability: (provider, vendor) => this.probeReasoningCapability(provider, vendor),
			testProviderConfiguration: (provider) => this.testProviderConfiguration(provider),
			notify: (message, timeout) => this.notify(message, timeout),
		})
		modal.open()
	}

	private openEditProviderGroupModal(group: ProviderGroupRecord): void {
		const draft = createDraftFromGroup(group)
		if (group.source !== 'custom') {
			draft.apiKey = this.getVendorApiKey(group.protocolVendorName)
		}
		const modal = new ProviderGroupConfigModal(this.app, {
			mode: 'edit',
			draft,
			title: group.displayName,
			getVendorApiKey: (vendorName) => this.getVendorApiKey(vendorName),
			onCommit: async (nextDraft) => {
				await this.commitProviderGroupDraft(nextDraft)
			},
			probeReasoningCapability: (provider, vendor) => this.probeReasoningCapability(provider, vendor),
			testProviderConfiguration: (provider) => this.testProviderConfiguration(provider),
			notify: (message, timeout) => this.notify(message, timeout),
		})
		modal.open()
	}

	private renderProviderConfig(
		container: HTMLElement,
		index: number,
		settings: ProviderSettings,
		vendor: Vendor,
		modal?: ProviderSettingModal
	) {
		const previousAutoSaveState = this.autoSaveEnabled
		this.autoSaveEnabled = false
		renderProviderConfigForPanel({
			app: this.app,
			container,
			index,
			settings,
			vendor,
			modal,
			currentOpenProviderIndex: this.currentOpenProviderIndex,
			providers: this.settings.providers,
			rootContainer: this.containerEl,
			providerTitleEls: this.providerTitleEls,
			doubaoRenderers: this.doubaoRenderers,
			saveSettings: () => this.saveSettings(),
			saveSettingsDirect: () => this.settingsContext.saveSettings(),
			renderRoot: (rootContainer, expandLastProvider, keepOpenIndex) =>
				this.render(rootContainer, expandLastProvider, keepOpenIndex),
			renderProviderConfig: (nextContainer, providerIndex, providerSettings, providerVendor, nextModal) =>
				this.renderProviderConfig(
					nextContainer,
					providerIndex,
					providerSettings,
					providerVendor,
					nextModal
				),
			getVendorApiKey: (providerVendor) => this.getVendorApiKey(providerVendor),
			cacheReasoningCapabilityFromMetadata: (providerVendor, providerOptions, rawModel) =>
				this.reasoningCapabilityManager.cacheReasoningCapabilityFromMetadata(
					this.settings,
					providerVendor,
					providerOptions,
					rawModel
				),
			getReasoningCapabilityHintText: (record) => this.getReasoningCapabilityHintText(record),
			resolveModelReasoningCapability: (vendorName, options, rawModel) =>
				this.reasoningCapabilityManager.resolveModelReasoningCapability(
					this.settings,
					vendorName,
					options,
					rawModel
				),
			updateProviderCapabilities: (providerIndex, providerSettings) =>
				this.updateProviderCapabilities(providerIndex, providerSettings),
			probeReasoningCapability: (providerSettings, providerVendor) =>
				this.reasoningCapabilityManager.probeReasoningCapability(providerSettings, providerVendor),
			writeReasoningCapabilityRecord: (vendorName, options, record) =>
				this.reasoningCapabilityManager.writeReasoningCapabilityRecord(
					this.settings,
					vendorName,
					options,
					record
				),
			testProviderConfiguration: (providerSettings) =>
				this.testProviderConfiguration(providerSettings),
			notify: (message, timeout) => this.notify(message, timeout)
		})
		this.autoSaveEnabled = previousAutoSaveState
	}

	private async testProviderConfiguration(provider: ProviderSettings): Promise<boolean> {
		const vendor = availableVendors.find((v) => v.name === provider.vendor)
		if (!vendor) {
			return false
		}
		return await testProviderConfiguration({
			provider,
			vendor,
			getVendorApiKey: (providerVendor) => this.getVendorApiKey(providerVendor),
			notify: (message, timeout) => this.notify(message, timeout)
		})
	}
}
