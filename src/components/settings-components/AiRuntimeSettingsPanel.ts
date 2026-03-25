import { App } from 'obsidian'
import { renderAiRuntimeSettingsPanelLayout } from 'src/components/settings-components/panelLayoutRenderer'
import { renderProvidersGroupedByVendor } from 'src/components/settings-components/provider-config/providerCards'
import { renderProviderConfigForPanel } from 'src/components/settings-components/provider-config/panelRenderBridge'
import { testProviderConfiguration } from 'src/components/settings-components/provider-config/providerTest'
import { t } from 'src/i18n/ai-runtime/helper'
import { ProviderSettingModal } from 'src/components/modals/AiRuntimeProviderModals'
import { BaseOptions, ProviderSettings, Vendor } from 'src/types/provider'
import type { Message as ProviderMessage, ResolveEmbedAsBinary } from 'src/types/provider'
import { ollamaVendor } from 'src/LLMProviders/ollama'
import { getCapabilityDisplayText } from 'src/LLMProviders/utils'
import {
	type ModelCapabilityCache,
	type ReasoningCapabilityRecord,
	REASONING_CAPABILITY_CACHE_TTL_MS,
	buildReasoningCapabilityCacheKey,
	classifyReasoningProbeError,
	createProbeCapabilityRecord,
	inferReasoningCapabilityFromMetadata,
	resolveReasoningCapability,
	writeReasoningCapabilityCache
} from 'src/LLMProviders/modelCapability'
import {
	availableVendors
} from 'src/settings/ai-runtime'
import type { AiRuntimeSettings } from 'src/settings/ai-runtime'
import {
	McpClientManager,
} from 'src/services/mcp'
import type { ChatSettings } from 'src/types/chat'

export interface AiRuntimeSettingsContext {
	getSettings: () => AiRuntimeSettings
	getChatSettings: () => ChatSettings
	getAiDataFolder: () => string
	getPromptTemplateFolder: () => string
	saveSettings: () => Promise<void>
	updateChatSettings: (partial: Partial<ChatSettings>) => Promise<void>
	refreshQuickActionsCache?: () => Promise<void>
	getMcpClientManager?: () => McpClientManager | null
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
	private isAdvancedCollapsed = true // 默认折叠高级设置
	private isVendorApiKeysCollapsed = true // 默认折叠模型提供商密钥设置
	private doubaoRenderers = new Map<unknown, () => void>()
	private quickActionGroupExpandedState = new Map<string, boolean>()
	private activeQuickActionsListContainer: HTMLElement | null = null
	/** 各服务商分组的展开/折叠状态（vendorName → isExpanded） */
	private vendorGroupExpandedState = new Map<string, boolean>()

	constructor(private readonly app: App, private readonly settingsContext: AiRuntimeSettingsContext) {}

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

	private async updateChatSettings(partial: Partial<ChatSettings>) {
		await this.settingsContext.updateChatSettings(partial)
	}

	private ensureModelCapabilityCache(): ModelCapabilityCache {
		if (!this.settings.modelCapabilityCache) {
			this.settings.modelCapabilityCache = {}
		}
		return this.settings.modelCapabilityCache
	}

	private resolveModelReasoningCapability(
		vendorName: string,
		options: BaseOptions,
		rawModel?: unknown
	): ReasoningCapabilityRecord {
		return resolveReasoningCapability({
			vendorName,
			baseURL: options.baseURL,
			model: options.model,
			rawModel,
			cache: this.settings.modelCapabilityCache
		})
	}

	private writeReasoningCapabilityRecord(
		vendorName: string,
		options: BaseOptions,
		record: ReasoningCapabilityRecord
	): void {
		const key = buildReasoningCapabilityCacheKey(vendorName, options.baseURL, options.model)
		this.settings.modelCapabilityCache = writeReasoningCapabilityCache(
			this.ensureModelCapabilityCache(),
			key,
			record,
			Date.now(),
			REASONING_CAPABILITY_CACHE_TTL_MS
		)
	}

	private cacheReasoningCapabilityFromMetadata(
		vendorName: string,
		options: BaseOptions,
		rawModel?: unknown
	): ReasoningCapabilityRecord | undefined {
		const metadataRecord = inferReasoningCapabilityFromMetadata(vendorName, rawModel)
		if (!metadataRecord || !options.model) return undefined
		this.writeReasoningCapabilityRecord(vendorName, options, metadataRecord)
		return metadataRecord
	}

	private getReasoningCapabilityHintText(record: ReasoningCapabilityRecord): string {
		if (record.state === 'supported') {
			if (record.source === 'metadata') return t('Reasoning is supported (metadata)')
			if (record.source === 'probe') return t('Reasoning is supported (probe)')
			return t('Reasoning is supported')
		}

		if (record.state === 'unsupported') {
			if (record.source === 'metadata') return t('Reasoning is unsupported (metadata)')
			if (record.source === 'probe') return t('Reasoning is unsupported (probe)')
			return t('Reasoning is unsupported')
		}

		return t('Reasoning is unknown')
	}

	private createReasoningProbeOptions(vendorName: string, options: BaseOptions): BaseOptions {
		const cloned = JSON.parse(JSON.stringify(options || {})) as BaseOptions & Record<string, unknown>
		const normalizedVendor = vendorName.toLowerCase()

		if (normalizedVendor === 'qwen' || normalizedVendor === 'claude' || normalizedVendor === 'qianfan') {
			cloned.enableThinking = true
		} else {
			cloned.enableReasoning = true
		}

		if (normalizedVendor === 'doubao') {
			cloned.enableReasoning = true
			cloned.thinkingType = 'enabled'
		}

		if (normalizedVendor === 'zhipu') {
			cloned.enableReasoning = true
			cloned.thinkingType = 'enabled'
		}

		return cloned as BaseOptions
	}

	private async probeReasoningCapability(provider: ProviderSettings, vendor: Vendor): Promise<ReasoningCapabilityRecord> {
		const probeOptions = this.createReasoningProbeOptions(vendor.name, provider.options)
		const sendRequest = vendor.sendRequestFunc(probeOptions)
		const controller = new AbortController()
		const timeoutId = globalThis.setTimeout(() => controller.abort(), 12_000)
		const probeMessages: ProviderMessage[] = [
			{ role: 'system', content: 'Capability probe mode. Keep response short.' },
			{ role: 'user', content: 'Reply with one short sentence.' }
		]

		const resolveEmbedAsBinary: ResolveEmbedAsBinary = async () => new ArrayBuffer(0)
		const saveAttachment = async (_fileName: string, _data: ArrayBuffer) => {}

		try {
			let hasVisibleOutput = false
			for await (const chunk of sendRequest(probeMessages, controller, resolveEmbedAsBinary, saveAttachment)) {
				if (typeof chunk === 'string' && chunk.trim().length > 0) {
					hasVisibleOutput = true
					break
				}
			}
			controller.abort()
			if (hasVisibleOutput) {
				return createProbeCapabilityRecord({
					state: 'supported',
					reason: 'Reasoning probe returned streamed output.'
				})
			}
			return createProbeCapabilityRecord({
				state: 'unknown',
				reason: 'Reasoning probe completed without decisive output.'
			})
		} catch (error) {
			return createProbeCapabilityRecord(classifyReasoningProbeError(error))
		} finally {
			globalThis.clearTimeout(timeoutId)
		}
	}

	private normalizeProviderVendor(vendor: string): string {
		return vendor === 'DoubaoImage' ? 'Doubao' : vendor
	}

	private ensureVendorApiKeys(): Record<string, string> {
		if (!this.settings.vendorApiKeys) {
			this.settings.vendorApiKeys = {}
		}
		return this.settings.vendorApiKeys
	}

	private getVendorApiKey(vendor: string): string {
		const normalizedVendor = this.normalizeProviderVendor(vendor)
		return this.settings.vendorApiKeys?.[normalizedVendor] ?? ''
	}

	private setVendorApiKey(vendor: string, value: string): void {
		const normalizedVendor = this.normalizeProviderVendor(vendor)
		const map = this.ensureVendorApiKeys()
		const trimmed = value.trim()
		if (trimmed) {
			map[normalizedVendor] = trimmed
		} else {
			delete map[normalizedVendor]
		}
		this.syncProviderApiKeysByVendor(normalizedVendor)
	}

	private syncProviderApiKeysByVendor(vendor: string): void {
		const normalizedVendor = this.normalizeProviderVendor(vendor)
		const resolvedApiKey = this.getVendorApiKey(normalizedVendor)
		for (const provider of this.settings.providers) {
			if (provider.vendor === ollamaVendor.name) continue
			if (this.normalizeProviderVendor(provider.vendor) !== normalizedVendor) continue
			provider.options.apiKey = resolvedApiKey
		}
	}

	private syncAllProviderApiKeys(): void {
		for (const provider of this.settings.providers) {
			if (provider.vendor === ollamaVendor.name) continue
			provider.options.apiKey = this.getVendorApiKey(provider.vendor)
		}
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
				setProvidersContainerEl: (providersContainer) => {
					this.providersContainerEl = providersContainer
				},
				renderProvidersGroupedByVendor: (shouldExpandLastProvider, nextKeepOpenIndex) =>
					this.renderProvidersGroupedByVendor(shouldExpandLastProvider, nextKeepOpenIndex),
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
				},
				isVendorApiKeysCollapsed: () => this.isVendorApiKeysCollapsed,
				setVendorApiKeysCollapsed: (value) => {
					this.isVendorApiKeysCollapsed = value
				},
				isSelectionToolbarCollapsed: () => this.isSelectionToolbarCollapsed,
				setSelectionToolbarCollapsed: (value) => {
					this.isSelectionToolbarCollapsed = value
				},
				isTabCompletionCollapsed: () => this.isTabCompletionCollapsed,
				setTabCompletionCollapsed: (value) => {
					this.isTabCompletionCollapsed = value
				},
				isAdvancedCollapsed: () => this.isAdvancedCollapsed,
				setAdvancedCollapsed: (value) => {
					this.isAdvancedCollapsed = value
				}
			},
			expandLastProvider,
			keepOpenIndex
		)
	}

	/**
	 * 更新提供商卡片中的功能显示
	 */
	private updateProviderCapabilities(index: number, settings: ProviderSettings) {
		const vendor = availableVendors.find((v) => v.name === settings.vendor)
		if (!vendor) return

		const capabilitiesEl = this.providerCapabilityEls.get(index)
		if (capabilitiesEl) {
			capabilitiesEl.textContent = getCapabilityDisplayText(vendor, settings.options)
		}
	}

	/**
	 * 按提供商分组渲染 AI 助手列表
	 */
	private renderProvidersGroupedByVendor(expandLastProvider: boolean, keepOpenIndex: number) {
		renderProvidersGroupedByVendor(
			{
				app: this.app,
				containerEl: this.containerEl,
				providersContainerEl: this.providersContainerEl,
				providers: this.settings.providers,
				providerTitleEls: this.providerTitleEls,
				providerCapabilityEls: this.providerCapabilityEls,
				vendorGroupExpandedState: this.vendorGroupExpandedState,
				renderProviderConfig: (container, index, settings, vendor, modal) =>
					this.renderProviderConfig(container, index, settings, vendor, modal),
				onDeleteProvider: async (index, vendorName) => {
					this.vendorGroupExpandedState.set(vendorName, true)
					this.settings.providers.splice(index, 1)
					await this.settingsContext.saveSettings()
					this.render(this.containerEl)
				},
				setCurrentOpenProviderIndex: (index) => {
					this.currentOpenProviderIndex = index
				}
			},
			expandLastProvider,
			keepOpenIndex
		)
	}

	/**
	 * 在 Modal 容器中渲染服务商配置内容
	 */
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
				this.cacheReasoningCapabilityFromMetadata(providerVendor, providerOptions, rawModel),
			getReasoningCapabilityHintText: (record) => this.getReasoningCapabilityHintText(record),
			resolveModelReasoningCapability: (vendorName, options, rawModel) =>
				this.resolveModelReasoningCapability(vendorName, options, rawModel),
			updateProviderCapabilities: (providerIndex, providerSettings) =>
				this.updateProviderCapabilities(providerIndex, providerSettings),
			probeReasoningCapability: (providerSettings, providerVendor) =>
				this.probeReasoningCapability(providerSettings, providerVendor),
			writeReasoningCapabilityRecord: (vendorName, options, record) =>
				this.writeReasoningCapabilityRecord(vendorName, options, record),
			testProviderConfiguration: (providerSettings) =>
				this.testProviderConfiguration(providerSettings)
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
			getVendorApiKey: (providerVendor) => this.getVendorApiKey(providerVendor)
		})
	}

}

/**
 * MCP 服务器编辑模态框
 */
