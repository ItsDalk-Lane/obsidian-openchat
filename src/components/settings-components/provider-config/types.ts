import type { DoubaoOptions } from 'src/LLMProviders/doubao'
import type { ReasoningCapabilityRecord } from 'src/LLMProviders/modelCapability'
import type { BaseOptions, ProviderSettings } from 'src/types/provider'

export interface ProviderSectionContext {
	saveSettings: () => Promise<void>
	notify: (message: string, timeout?: number) => void
	getReasoningCapabilityHintText: (record: ReasoningCapabilityRecord) => string
	updateProviderCapabilities: (index: number, settings: ProviderSettings) => void
	resolveModelReasoningCapability: (
		vendorName: string,
		options: BaseOptions,
		rawModel?: unknown
	) => ReasoningCapabilityRecord
	registerDoubaoRenderer: (options: DoubaoOptions, renderer: () => void) => void
}
