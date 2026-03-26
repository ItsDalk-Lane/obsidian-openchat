import type { App } from 'obsidian'
import { addApiVersionSection, addBaseUrlSection, addClaudeSections as addProviderClaudeSections, addContextLengthSection as addProviderContextLengthSection, addEndpointSection, addGptImageSections as addProviderGptImageSections, addParametersSection as addProviderParametersSection } from 'src/components/settings-components/provider-config/providerGeneralSections'
import { addModelButtonSection as addProviderModelButtonSection, addModelDropDownSection as addProviderModelDropDownSection, addModelTextSection as addProviderModelTextSection, addOllamaModelTextSection as addProviderOllamaModelTextSection } from 'src/components/settings-components/provider-config/providerModelSections'
import { renderProviderConfigContent } from 'src/components/settings-components/provider-config/providerConfigRenderer'
import type { ProviderSettingModal } from 'src/components/modals/AiRuntimeProviderModals'
import type { ReasoningCapabilityRecord } from 'src/LLMProviders/modelCapability'
import type { BaseOptions, ProviderSettings, Vendor } from 'src/types/provider'

interface RenderProviderConfigForPanelParams {
	app: App
	container: HTMLElement
	index: number
	settings: ProviderSettings
	vendor: Vendor
	modal?: ProviderSettingModal
	currentOpenProviderIndex: number
	providers: ProviderSettings[]
	rootContainer: HTMLElement
	providerTitleEls: Map<number, HTMLElement>
	doubaoRenderers: Map<unknown, () => void>
	saveSettings: () => Promise<void>
	saveSettingsDirect: () => Promise<void>
	renderRoot: (container: HTMLElement, expandLastProvider?: boolean, keepOpenIndex?: number) => void
	renderProviderConfig: (
		container: HTMLElement,
		index: number,
		settings: ProviderSettings,
		vendor: Vendor,
		modal?: ProviderSettingModal
	) => void
	getVendorApiKey: (vendor: string) => string
	cacheReasoningCapabilityFromMetadata: (
		vendorName: string,
		options: BaseOptions,
		rawModel?: unknown
	) => ReasoningCapabilityRecord | undefined
	getReasoningCapabilityHintText: (record: ReasoningCapabilityRecord) => string
	resolveModelReasoningCapability: (
		vendorName: string,
		options: BaseOptions,
		rawModel?: unknown
	) => ReasoningCapabilityRecord
	updateProviderCapabilities: (index: number, settings: ProviderSettings) => void
	probeReasoningCapability: (
		provider: ProviderSettings,
		vendor: Vendor
	) => Promise<ReasoningCapabilityRecord>
	writeReasoningCapabilityRecord: (
		vendorName: string,
		options: BaseOptions,
		record: ReasoningCapabilityRecord
	) => void
	testProviderConfiguration: (provider: ProviderSettings) => Promise<boolean>
}

export const renderProviderConfigForPanel = (
	params: RenderProviderConfigForPanelParams
): void => {
	const savePanelSettings = async () => params.saveSettings()

	renderProviderConfigContent({
		container: params.container,
		index: params.index,
		settings: params.settings,
		vendor: params.vendor,
		modal: params.modal,
		currentOpenProviderIndex: params.currentOpenProviderIndex,
		getAllProviders: () => params.providers,
		saveSettings: params.saveSettings,
		saveSettingsDirect: params.saveSettingsDirect,
		renderRoot: params.renderRoot,
		rootContainer: params.rootContainer,
		getReasoningCapabilityHintText: params.getReasoningCapabilityHintText,
		resolveModelReasoningCapability: params.resolveModelReasoningCapability,
		updateProviderCapabilities: params.updateProviderCapabilities,
		registerDoubaoRenderer: (options, renderer) => {
			params.doubaoRenderers.set(options, renderer)
		},
		probeReasoningCapability: params.probeReasoningCapability,
		writeReasoningCapabilityRecord: params.writeReasoningCapabilityRecord,
		testProviderConfiguration: params.testProviderConfiguration,
		renderProviderConfig: params.renderProviderConfig,
		sections: {
			addBaseURLSection: (details, options, defaultValue) =>
				addBaseUrlSection({
					details,
					options,
					defaultValue,
					saveSettings: savePanelSettings
				}),
			addModelButtonSection: (
				details,
				options,
				modelConfig,
				desc,
				vendorName,
				providerIndex,
				providerSettings,
				providerVendor,
				nextModal
			) =>
				addProviderModelButtonSection({
					app: params.app,
					details,
					options,
					modelConfig,
					desc,
					saveSettings: savePanelSettings,
					getVendorApiKey: params.getVendorApiKey,
					cacheReasoningCapabilityFromMetadata: params.cacheReasoningCapabilityFromMetadata,
					vendorName,
					index: providerIndex,
					settings: providerSettings,
					vendor: providerVendor,
					modal: nextModal,
					onModelUpdated: async () => {
						if (providerIndex !== undefined && providerSettings) {
							params.updateProviderCapabilities(providerIndex, providerSettings)
							if (nextModal && providerVendor) {
								nextModal.configContainer.empty()
								params.renderProviderConfig(
									nextModal.configContainer,
									providerIndex,
									providerSettings,
									providerVendor,
									nextModal
								)
							}
						}
					}
				}),
			addModelDropDownSection: (details, options, models, desc) =>
				addProviderModelDropDownSection({
					details,
					options,
					models,
					desc,
					saveSettings: savePanelSettings,
					onModelUpdated: () => {
						params.doubaoRenderers.get(options)?.()
					}
				}),
			addModelTextSection: (details, options, desc) =>
				addProviderModelTextSection({
					details,
					options,
					desc,
					saveSettings: savePanelSettings
				}),
			addOllamaModelTextSection: (details, options, desc) =>
				addProviderOllamaModelTextSection({
					details,
					options,
					desc,
					saveSettings: savePanelSettings
				}),
			addClaudeSections: (details, options) =>
				addProviderClaudeSections({
					details,
					options,
					saveSettings: savePanelSettings
				}),
			addEndpointOptional: (details, options) =>
				addEndpointSection({
					details,
					options,
					saveSettings: savePanelSettings
				}),
			addApiVersionOptional: (details, options) =>
				addApiVersionSection({
					details,
					options,
					saveSettings: savePanelSettings
				}),
			addContextLengthSection: (details, options) =>
				addProviderContextLengthSection({
					details,
					options,
					saveSettings: savePanelSettings
				}),
			addParametersSection: (details, options) =>
				addProviderParametersSection({
					details,
					options,
					saveSettings: savePanelSettings
				}),
			addGptImageSections: (details, options) =>
				addProviderGptImageSections({
					details,
					options,
					saveSettings: savePanelSettings
				})
		}
	})
}
