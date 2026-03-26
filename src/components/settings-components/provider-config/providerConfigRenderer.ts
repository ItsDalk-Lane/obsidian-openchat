import { Notice, Setting } from 'obsidian'
import { ClaudeOptions, claudeVendor } from 'src/LLMProviders/claude'
import { DeepSeekOptions, deepSeekVendor } from 'src/LLMProviders/deepSeek'
import { DoubaoOptions, doubaoVendor } from 'src/LLMProviders/doubao'
import {
	DoubaoImageOptions,
	isDoubaoImageGenerationModel
} from 'src/LLMProviders/doubaoImage'
import { AzureOptions, azureVendor } from 'src/LLMProviders/azure'
import { GptImageOptions, gptImageVendor } from 'src/LLMProviders/gptImage'
import { GrokOptions, grokVendor } from 'src/LLMProviders/grok'
import { KimiOptions, kimiVendor } from 'src/LLMProviders/kimi'
import { ollamaVendor } from 'src/LLMProviders/ollama'
import { OpenAIOptions, openAIVendor } from 'src/LLMProviders/openAI'
import {
	isImageGenerationModel,
	OpenRouterOptions,
	openRouterVendor
} from 'src/LLMProviders/openRouter'
import { PoeOptions, poeVendor } from 'src/LLMProviders/poe'
import { QianFanOptions, qianFanVendor } from 'src/LLMProviders/qianFan'
import { QwenOptions, qwenVendor } from 'src/LLMProviders/qwen'
import { ZhipuOptions, zhipuVendor } from 'src/LLMProviders/zhipu'
import type { ReasoningCapabilityRecord } from 'src/LLMProviders/modelCapability'
import { getCapabilityDisplayText } from 'src/LLMProviders/utils'
import { t } from 'src/i18n/ai-runtime/helper'
import { localInstance } from 'src/i18n/locals'
import { getProviderModelDisplayName } from 'src/utils/aiProviderMetadata'
import type {
	BaseOptions,
	Optional,
	ProviderSettings,
	Vendor
} from 'src/types/provider'
import type { ProviderSettingModal } from 'src/components/modals/AiRuntimeProviderModals'
import {
	ensureDoubaoImageDefaults,
	renderDoubaoImageSections,
	renderDoubaoSections
} from './doubaoSections'
import {
	renderOpenRouterImageGenerationSections,
	renderOpenRouterReasoningSections,
	renderOpenRouterWebSearchSections
} from './openRouterSections'
import {
	renderAzureSections,
	renderDeepSeekSections,
	renderGrokSections,
	renderKimiSections,
	renderOllamaSections,
	renderOpenAISections,
	renderPoeSections,
	renderQianFanSections,
	renderQwenSections,
	renderZhipuSections
} from './reasoningSections'
import type {
	ProviderSectionContext
} from './types'
import { MODEL_FETCH_CONFIGS } from './providerUtils'

interface ProviderConfigSectionDelegates {
	addBaseURLSection: (details: HTMLElement, options: BaseOptions, defaultValue: string) => void
	addModelButtonSection: (
		details: HTMLElement,
		options: BaseOptions,
		modelConfig: typeof MODEL_FETCH_CONFIGS[keyof typeof MODEL_FETCH_CONFIGS],
		desc: string,
		vendorName?: string,
		index?: number,
		settings?: ProviderSettings,
		vendor?: Vendor,
		modal?: ProviderSettingModal
	) => void
	addModelDropDownSection: (
		details: HTMLElement,
		options: BaseOptions,
		models: string[],
		desc: string
	) => void
	addModelTextSection: (details: HTMLElement, options: BaseOptions, desc: string) => void
	addOllamaModelTextSection: (details: HTMLElement, options: BaseOptions, desc: string) => void
	addClaudeSections: (details: HTMLElement, options: ClaudeOptions) => void
	addEndpointOptional: (
		details: HTMLElement,
		options: BaseOptions & Pick<Optional, 'endpoint'>
	) => void
	addApiVersionOptional: (
		details: HTMLElement,
		options: BaseOptions & Pick<Optional, 'apiVersion'>
	) => void
	addContextLengthSection: (details: HTMLElement, options: BaseOptions) => void
	addParametersSection: (details: HTMLElement, options: BaseOptions) => void
	addGptImageSections: (details: HTMLElement, options: GptImageOptions) => void
}

export interface RenderProviderConfigParams {
	container: HTMLElement
	index: number
	settings: ProviderSettings
	vendor: Vendor
	modal?: ProviderSettingModal
	currentOpenProviderIndex: number
	getAllProviders: () => ProviderSettings[]
	saveSettings: () => Promise<void>
	saveSettingsDirect: () => Promise<void>
	renderRoot: (container: HTMLElement, expandLastProvider?: boolean, keepOpenIndex?: number) => void
	rootContainer: HTMLElement
	getReasoningCapabilityHintText: (record: ReasoningCapabilityRecord) => string
	resolveModelReasoningCapability: (
		vendorName: string,
		options: BaseOptions,
		rawModel?: unknown
	) => ReasoningCapabilityRecord
	updateProviderCapabilities: (index: number, settings: ProviderSettings) => void
	registerDoubaoRenderer: ProviderSectionContext['registerDoubaoRenderer']
	probeReasoningCapability: (provider: ProviderSettings, vendor: Vendor) => Promise<ReasoningCapabilityRecord>
	writeReasoningCapabilityRecord: (
		vendorName: string,
		options: BaseOptions,
		record: ReasoningCapabilityRecord
	) => void
	testProviderConfiguration: (provider: ProviderSettings) => Promise<boolean>
	renderProviderConfig: (
		container: HTMLElement,
		index: number,
		settings: ProviderSettings,
		vendor: Vendor,
		modal?: ProviderSettingModal
	) => void
	sections: ProviderConfigSectionDelegates
}

export const renderProviderConfigContent = (params: RenderProviderConfigParams) => {
	const {
		container,
		index,
		settings,
		vendor,
		modal,
		sections
	} = params
	const capabilities = `${t('Supported features')} : ${getCapabilityDisplayText(
		vendor,
		settings.options
	)}`
	container.createEl('p', {
		text: capabilities,
		cls: 'setting-item-description'
	})

	const modelConfig = MODEL_FETCH_CONFIGS[vendor.name as keyof typeof MODEL_FETCH_CONFIGS]
	if (modelConfig) {
		sections.addModelButtonSection(
			container,
			settings.options,
			modelConfig,
			capabilities,
			vendor.name,
			index,
			settings,
			vendor,
			modal
		)
	} else if (vendor.models.length > 0) {
		sections.addModelDropDownSection(container, settings.options, vendor.models, capabilities)
	} else if (vendor.name === ollamaVendor.name) {
		sections.addOllamaModelTextSection(container, settings.options, capabilities)
	} else {
		sections.addModelTextSection(container, settings.options, capabilities)
	}

	const modelReasoningCapability = params.resolveModelReasoningCapability(
		vendor.name,
		settings.options
	)
	const providerSectionContext: ProviderSectionContext = {
		saveSettings: params.saveSettings,
		getReasoningCapabilityHintText: params.getReasoningCapabilityHintText,
		updateProviderCapabilities: params.updateProviderCapabilities,
		resolveModelReasoningCapability: params.resolveModelReasoningCapability,
		registerDoubaoRenderer: params.registerDoubaoRenderer
	}

	if (vendor.name === openRouterVendor.name) {
		const options = settings.options as OpenRouterOptions
		const supportsImageGeneration = isImageGenerationModel(options.model)
		if (!supportsImageGeneration && vendor.capabilities.includes('Web Search')) {
			new Setting(container)
				.setName(t('Web search'))
				.setDesc(t('Enable web search for AI'))
				.addToggle((toggle) =>
					toggle.setValue(settings.options.enableWebSearch ?? false).onChange(async (value) => {
						settings.options.enableWebSearch = value
						await params.saveSettings()
						params.updateProviderCapabilities(index, settings)
					})
				)
			renderOpenRouterWebSearchSections(container, options, providerSectionContext)
		}
		if (supportsImageGeneration) {
			renderOpenRouterImageGenerationSections(container, options, providerSectionContext)
		}
		if (!supportsImageGeneration && vendor.capabilities.includes('Reasoning')) {
			if (modelReasoningCapability.state === 'unsupported') {
				new Setting(container)
					.setName(t('Enable reasoning feature'))
					.setDesc(params.getReasoningCapabilityHintText(modelReasoningCapability))
					.addToggle((toggle) => {
						toggle.setValue(false)
						toggle.setDisabled(true)
					})
			} else {
				new Setting(container)
					.setName(t('Enable reasoning feature'))
					.setDesc(
						`${t('Enable reasoning feature description')} ${params.getReasoningCapabilityHintText(
							modelReasoningCapability
						)}`
					)
					.addToggle((toggle) =>
						toggle.setValue(options.enableReasoning ?? false).onChange(async (value) => {
							options.enableReasoning = value
							await params.saveSettings()
							params.updateProviderCapabilities(index, settings)
						})
					)
				if (options.enableReasoning) {
					renderOpenRouterReasoningSections(container, options, providerSectionContext)
				}
			}
		}
	} else if (vendor.capabilities.includes('Web Search')) {
		new Setting(container)
			.setName(t('Web search'))
			.setDesc(t('Enable web search for AI'))
			.addToggle((toggle) =>
				toggle.setValue(settings.options.enableWebSearch ?? false).onChange(async (value) => {
					settings.options.enableWebSearch = value
					await params.saveSettings()
					params.updateProviderCapabilities(index, settings)
				})
			)
	}

	if (vendor.name === claudeVendor.name) {
		sections.addClaudeSections(container, settings.options as ClaudeOptions)
	}
	if (vendor.name === doubaoVendor.name) {
		const doubaoOptions = settings.options as DoubaoOptions & Partial<DoubaoImageOptions>
		if (isDoubaoImageGenerationModel(doubaoOptions.model)) {
			ensureDoubaoImageDefaults(doubaoOptions)
			renderDoubaoImageSections(
				container,
				doubaoOptions as DoubaoImageOptions,
				providerSectionContext
			)
		} else {
			renderDoubaoSections(container, doubaoOptions, providerSectionContext)
		}
	}
	if (vendor.name === zhipuVendor.name) {
		renderZhipuSections(
			container,
			settings.options as ZhipuOptions,
			modelReasoningCapability,
			providerSectionContext
		)
	}
	if (vendor.name === qwenVendor.name) {
		renderQwenSections(container, settings.options as QwenOptions, providerSectionContext)
	}
	if (vendor.name === qianFanVendor.name) {
		renderQianFanSections(
			container,
			settings.options as QianFanOptions,
			index,
			settings,
			modelReasoningCapability,
			providerSectionContext
		)
	}
	if (vendor.name === gptImageVendor.name) {
		sections.addGptImageSections(container, settings.options as GptImageOptions)
	}
	if (vendor.name === kimiVendor.name) {
		renderKimiSections(
			container,
			settings.options as KimiOptions,
			index,
			settings,
			modelReasoningCapability,
			providerSectionContext
		)
	}
	if (vendor.name === deepSeekVendor.name) {
		renderDeepSeekSections(
			container,
			settings.options as DeepSeekOptions,
			index,
			settings,
			modelReasoningCapability,
			providerSectionContext
		)
	}
	if (vendor.name === grokVendor.name) {
		renderGrokSections(
			container,
			settings.options as GrokOptions,
			index,
			settings,
			modelReasoningCapability,
			providerSectionContext
		)
	}
	if (vendor.name === openAIVendor.name) {
		renderOpenAISections(
			container,
			settings.options as OpenAIOptions,
			index,
			settings,
			modelReasoningCapability,
			providerSectionContext
		)
	}
	if (vendor.name === poeVendor.name) {
		renderPoeSections(
			container,
			settings.options as PoeOptions,
			index,
			settings,
			modelReasoningCapability,
			providerSectionContext
		)
	}
	if (vendor.name === azureVendor.name) {
		renderAzureSections(
			container,
			settings.options as AzureOptions,
			index,
			settings,
			modelReasoningCapability,
			providerSectionContext
		)
	}
	if (vendor.name === ollamaVendor.name) {
		renderOllamaSections(
			container,
			settings.options as { enableReasoning?: boolean },
			index,
			settings,
			modelReasoningCapability,
			providerSectionContext
		)
	}

	sections.addBaseURLSection(container, settings.options, vendor.defaultOptions.baseURL)
	if ('endpoint' in settings.options) {
		sections.addEndpointOptional(
			container,
			settings.options as BaseOptions & Pick<Optional, 'endpoint'>
		)
	}
	if ('apiVersion' in settings.options) {
		sections.addApiVersionOptional(
			container,
			settings.options as BaseOptions & Pick<Optional, 'apiVersion'>
		)
	}
	const titleEl = container.querySelector('.ai-provider-title') as HTMLElement | null
	if (titleEl) {
		titleEl.textContent = getProviderModelDisplayName(settings, params.getAllProviders())
	}
	sections.addContextLengthSection(container, settings.options)
	sections.addParametersSection(container, settings.options)

	const testButtonLabel = t('Test now')
	new Setting(container)
		.setName(t('Test model'))
		.setDesc(t('Test model description'))
		.addButton((btn) => {
			btn.setButtonText(testButtonLabel)
				.setCta()
				.onClick(async () => {
					btn.setDisabled(true)
					btn.setButtonText(t('Testing model...'))
					try {
						const success = await params.testProviderConfiguration(settings)
						btn.setButtonText(
							success
								? `✅ ${t('Model test succeeded')}`
								: `❌ ${t('Model test failed')}`
						)
					} catch (error) {
						const msg = error instanceof Error ? error.message : String(error)
						new Notice(`${t('Model test failed')}: ${msg}`)
						btn.setButtonText(`❌ ${t('Model test failed')}`)
					}
					setTimeout(() => {
						btn.setDisabled(false)
						btn.setButtonText(testButtonLabel)
					}, 2500)
				})
		})

	if (vendor.capabilities.includes('Reasoning')) {
		new Setting(container)
			.setName(t('Reasoning capability probe'))
			.setDesc(t('Reasoning capability probe description'))
			.addButton((btn) => {
				btn.setButtonText(t('Probe reasoning capability'))
					.onClick(async () => {
						btn.setDisabled(true)
						btn.setButtonText(t('Probing reasoning capability...'))
						try {
							const record = await params.probeReasoningCapability(settings, vendor)
							params.writeReasoningCapabilityRecord(vendor.name, settings.options, record)
							await params.saveSettingsDirect()
							new Notice(params.getReasoningCapabilityHintText(record))
							if (modal) {
								modal.configContainer.empty()
								params.renderProviderConfig(
									modal.configContainer,
									index,
									settings,
									vendor,
									modal
								)
							}
						} catch (error) {
							const message = error instanceof Error ? error.message : String(error)
							new Notice(`${t('Reasoning capability probe failed')}: ${message}`)
						} finally {
							setTimeout(() => {
								btn.setDisabled(false)
								btn.setButtonText(t('Probe reasoning capability'))
							}, 1200)
						}
					})
			})
	}

	new Setting(container).addButton((btn) => {
		btn.setButtonText(localInstance.save)
			.setCta()
			.onClick(async () => {
				const tags = params.getAllProviders().map((provider) => provider.tag.toLowerCase())
				if (tags.length !== new Set(tags).size) {
					new Notice(t('Model identifier must be unique'))
					return
				}
				await params.saveSettingsDirect()
				new Notice(localInstance.system_prompt_saved)
				if (vendor.name === openRouterVendor.name) {
					params.renderRoot(params.rootContainer, false, params.currentOpenProviderIndex)
				}
				modal?.close()
			})
	})
}
