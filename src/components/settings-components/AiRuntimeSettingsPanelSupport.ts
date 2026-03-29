import { App } from 'obsidian'
import { QuickActionDataService } from 'src/domains/quick-actions/service-data'
import { VendorApiKeysModal } from 'src/components/settings-components/VendorApiKeysModal'
import { ollamaVendor } from 'src/LLMProviders/ollama'
import {
	type ModelCapabilityCache,
	type ReasoningCapabilityRecord,
	REASONING_CAPABILITY_CACHE_TTL_MS,
	buildReasoningCapabilityCacheKey,
	classifyReasoningProbeError,
	createProbeCapabilityRecord,
	inferReasoningCapabilityFromMetadata,
	resolveReasoningCapability,
	writeReasoningCapabilityCache,
} from 'src/LLMProviders/modelCapability'
import type { AiRuntimeSettings } from 'src/settings/ai-runtime/api'
import type { ObsidianApiProvider } from 'src/providers/providers.types'
import type { QuickAction } from 'src/types/chat'
import type { Message as ProviderMessage, ResolveEmbedAsBinary } from 'src/types/provider'
import type { BaseOptions, ProviderSettings, Vendor } from 'src/types/provider'
import { isCustomOpenChatProvider } from 'src/utils/aiProviderMetadata'

export class AiRuntimeReasoningCapabilityManager {
	private ensureModelCapabilityCache(settings: AiRuntimeSettings): ModelCapabilityCache {
		if (!settings.modelCapabilityCache) {
			settings.modelCapabilityCache = {}
		}
		return settings.modelCapabilityCache
	}

	resolveModelReasoningCapability(
		settings: AiRuntimeSettings,
		vendorName: string,
		options: BaseOptions,
		rawModel?: unknown
	): ReasoningCapabilityRecord {
		return resolveReasoningCapability({
			vendorName,
			baseURL: options.baseURL,
			model: options.model,
			rawModel,
			cache: settings.modelCapabilityCache,
		})
	}

	writeReasoningCapabilityRecord(
		settings: AiRuntimeSettings,
		vendorName: string,
		options: BaseOptions,
		record: ReasoningCapabilityRecord
	): void {
		const key = buildReasoningCapabilityCacheKey(vendorName, options.baseURL, options.model)
		settings.modelCapabilityCache = writeReasoningCapabilityCache(
			this.ensureModelCapabilityCache(settings),
			key,
			record,
			Date.now(),
			REASONING_CAPABILITY_CACHE_TTL_MS
		)
	}

	cacheReasoningCapabilityFromMetadata(
		settings: AiRuntimeSettings,
		vendorName: string,
		options: BaseOptions,
		rawModel?: unknown
	): ReasoningCapabilityRecord | undefined {
		const metadataRecord = inferReasoningCapabilityFromMetadata(vendorName, rawModel)
		if (!metadataRecord || !options.model) return undefined
		this.writeReasoningCapabilityRecord(settings, vendorName, options, metadataRecord)
		return metadataRecord
	}

	getReasoningCapabilityHintText(record: ReasoningCapabilityRecord): string {
		if (record.state === 'supported') {
			if (record.source === 'metadata') return 'Reasoning is supported (metadata)'
			if (record.source === 'probe') return 'Reasoning is supported (probe)'
			return 'Reasoning is supported'
		}

		if (record.state === 'unsupported') {
			if (record.source === 'metadata') return 'Reasoning is unsupported (metadata)'
			if (record.source === 'probe') return 'Reasoning is unsupported (probe)'
			return 'Reasoning is unsupported'
		}

		return 'Reasoning is unknown'
	}

	private createReasoningProbeOptions(vendorName: string, options: BaseOptions): BaseOptions {
		const cloned = JSON.parse(JSON.stringify(options || {})) as BaseOptions & Record<string, unknown>
		const normalizedVendor = vendorName.toLowerCase()

		if (normalizedVendor === 'qwen' || normalizedVendor === 'claude' || normalizedVendor === 'qianfan') {
			cloned.enableThinking = true
		} else {
			cloned.enableReasoning = true
		}

		if (normalizedVendor === 'doubao' || normalizedVendor === 'zhipu') {
			cloned.enableReasoning = true
			cloned.thinkingType = 'enabled'
		}

		return cloned as BaseOptions
	}

	async probeReasoningCapability(provider: ProviderSettings, vendor: Vendor): Promise<ReasoningCapabilityRecord> {
		const probeOptions = this.createReasoningProbeOptions(vendor.name, provider.options)
		const sendRequest = vendor.sendRequestFunc(probeOptions)
		const controller = new AbortController()
		const timeoutId = globalThis.setTimeout(() => controller.abort(), 12_000)
		const probeMessages: ProviderMessage[] = [
			{ role: 'system', content: 'Capability probe mode. Keep response short.' },
			{ role: 'user', content: 'Reply with one short sentence.' },
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
					reason: 'Reasoning probe returned streamed output.',
				})
			}
			return createProbeCapabilityRecord({
				state: 'unknown',
				reason: 'Reasoning probe completed without decisive output.',
			})
		} catch (error) {
			return createProbeCapabilityRecord(classifyReasoningProbeError(error))
		} finally {
			globalThis.clearTimeout(timeoutId)
		}
	}
}

export class AiRuntimeVendorApiKeyManager {
	normalizeProviderVendor(vendor: string): string {
		return vendor === 'DoubaoImage' ? 'Doubao' : vendor
	}

	private isCustomProvider(provider: Pick<ProviderSettings, 'options'>): boolean {
		return isCustomOpenChatProvider(provider.options?.parameters)
	}

	private ensureVendorApiKeys(settings: AiRuntimeSettings): Record<string, string> {
		if (!settings.vendorApiKeys) {
			settings.vendorApiKeys = {}
		}
		return settings.vendorApiKeys
	}

	getVendorApiKey(settings: AiRuntimeSettings, vendor: string): string {
		const normalizedVendor = this.normalizeProviderVendor(vendor)
		return settings.vendorApiKeys?.[normalizedVendor] ?? ''
	}

	setVendorApiKey(settings: AiRuntimeSettings, vendor: string, value: string): void {
		const normalizedVendor = this.normalizeProviderVendor(vendor)
		const map = this.ensureVendorApiKeys(settings)
		const trimmed = value.trim()
		if (trimmed) {
			map[normalizedVendor] = trimmed
		} else {
			delete map[normalizedVendor]
		}
		this.syncProviderApiKeysByVendor(settings, normalizedVendor)
	}

	syncProviderApiKeysByVendor(settings: AiRuntimeSettings, vendor: string): void {
		const normalizedVendor = this.normalizeProviderVendor(vendor)
		const resolvedApiKey = this.getVendorApiKey(settings, normalizedVendor)
		for (const provider of settings.providers) {
			if (provider.vendor === ollamaVendor.name) continue
			if (this.isCustomProvider(provider)) continue
			if (this.normalizeProviderVendor(provider.vendor) !== normalizedVendor) continue
			provider.options.apiKey = resolvedApiKey
		}
	}

	syncAllProviderApiKeys(settings: AiRuntimeSettings): void {
		for (const provider of settings.providers) {
			if (provider.vendor === ollamaVendor.name) continue
			if (this.isCustomProvider(provider)) continue
			provider.options.apiKey = this.getVendorApiKey(settings, provider.vendor)
		}
	}

	openVendorApiKeysModal(app: App, settings: AiRuntimeSettings, saveSettings: () => Promise<void>): void {
		new VendorApiKeysModal(app, {
			getVendorApiKey: (vendor) => this.getVendorApiKey(settings, vendor),
			setVendorApiKey: (vendor, value) => this.setVendorApiKey(settings, vendor, value),
			normalizeProviderVendor: (vendor) => this.normalizeProviderVendor(vendor),
			saveSettings,
		}).open()
	}
}

export class AiRuntimeQuickActionsManager {
	private dataService: QuickActionDataService | null = null

	constructor(
		private readonly obsidianApi: ObsidianApiProvider,
		private readonly getAiDataFolder: () => string,
		private readonly syncRuntimeQuickActions: (quickActions: QuickAction[]) => void,
	) {}

	getDataService(): QuickActionDataService {
		if (!this.dataService) {
			this.dataService = new QuickActionDataService(this.obsidianApi, {
				getAiDataFolder: () => this.getAiDataFolder(),
				syncRuntimeQuickActions: (quickActions) => this.syncRuntimeQuickActions(quickActions),
			})
		}
		return this.dataService
	}

	notify(message: string, timeout?: number): void {
		this.obsidianApi.notify(message, timeout)
	}
}
