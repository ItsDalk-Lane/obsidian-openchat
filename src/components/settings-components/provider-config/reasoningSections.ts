import { Setting } from 'obsidian'
import type { AzureOptions } from 'src/LLMProviders/azure'
import type { DeepSeekOptions } from 'src/LLMProviders/deepSeek'
import type { GrokOptions } from 'src/LLMProviders/grok'
import type { BaseOptions } from 'src/LLMProviders/index'
import type { KimiOptions } from 'src/LLMProviders/kimi'
import type { ReasoningCapabilityRecord } from 'src/LLMProviders/modelCapability'
import type { OpenAIOptions } from 'src/LLMProviders/openAI'
import type { PoeOptions } from 'src/LLMProviders/poe'
import type { QianFanOptions } from 'src/LLMProviders/qianFan'
import { qianFanIsImageGenerationModel } from 'src/LLMProviders/qianFan'
import { DEFAULT_ZHIPU_THINKING_TYPE, ZHIPU_THINKING_TYPE_OPTIONS, type ZhipuOptions, type ZhipuThinkingType } from 'src/LLMProviders/zhipu'
import type { QwenOptions } from 'src/LLMProviders/qwen'
import { t } from 'src/i18n/ai-runtime/helper'
import type { ProviderSettings } from 'src/types/provider'
import type { ProviderSectionContext } from './types'

type ReasoningToggleOptions = {
	enableReasoning?: boolean
}

type ReasoningToggleArgs<TOptions extends ReasoningToggleOptions> = {
	details: HTMLElement
	options: TOptions
	index: number
	settings: ProviderSettings
	capability: ReasoningCapabilityRecord
	description: string
	context: ProviderSectionContext
}

export const renderZhipuSections = (
	details: HTMLElement,
	options: ZhipuOptions,
	capability: ReasoningCapabilityRecord,
	context: ProviderSectionContext
) => {
	if (capability.state === 'unsupported') {
		new Setting(details)
			.setName(t('Zhipu thinking type'))
			.setDesc(context.getReasoningCapabilityHintText(capability))
			.addDropdown((dropdown) => {
				dropdown.addOption('disabled', t('Disabled'))
				dropdown.setValue('disabled')
				dropdown.setDisabled(true)
			})
		return
	}

	const supportedTypes = ZHIPU_THINKING_TYPE_OPTIONS.map((option) => option.value)
	const initialType: ZhipuThinkingType =
		options.thinkingType && supportedTypes.includes(options.thinkingType)
			? options.thinkingType
			: DEFAULT_ZHIPU_THINKING_TYPE

	new Setting(details)
		.setName(t('Zhipu thinking type'))
		.setDesc(
			t('Zhipu thinking type description') + context.getReasoningCapabilityHintText(capability)
		)
		.addDropdown((dropdown) => {
			for (const option of ZHIPU_THINKING_TYPE_OPTIONS) {
				dropdown.addOption(option.value, option.label)
			}
			dropdown.setValue(initialType)
			dropdown.onChange(async (value) => {
				const nextThinkingType = value as ZhipuThinkingType
				options.thinkingType = nextThinkingType
				options.enableReasoning = nextThinkingType !== 'disabled'
				await context.saveSettings()
			})
		})

	// 结构化输出开关
	new Setting(details)
		.setName(t('Zhipu structured output'))
		.setDesc(t('Zhipu structured output description'))
		.addToggle((toggle) =>
			toggle.setValue(options.enableStructuredOutput ?? false).onChange(async (value) => {
				options.enableStructuredOutput = value
				await context.saveSettings()
			})
		)

	if (capability.state === 'unknown') {
		new Setting(details)
			.setName(t('Model compatibility hint'))
			.setDesc(context.getReasoningCapabilityHintText(capability))
			.setDisabled(true)
	}
}

export const renderQwenSections = (
	details: HTMLElement,
	options: QwenOptions,
	context: Pick<ProviderSectionContext, 'saveSettings'>
) => {
	new Setting(details)
		.setName(t('Qwen thinking mode'))
		.setDesc(t('Qwen thinking mode description'))
		.addToggle((toggle) =>
			toggle.setValue(options.enableThinking ?? false).onChange(async (value) => {
				options.enableThinking = value
				await context.saveSettings()
			})
		)

	const knownThinkingModels = [
		'qwen3-max-preview',
		'qwen-plus',
		'qwen-plus-latest',
		'qwen-plus-2025-04-28',
		'qwen-flash',
		'qwen-flash-2025-07-28',
		'qwen-turbo',
		'qwen-turbo-latest',
		'qwen-turbo-2025-04-28'
	]

	new Setting(details)
		.setName(t('Qwen thinking mode note'))
		.setDesc(
			t('Qwen thinking mode note description').replace('{models}', knownThinkingModels.join(', '))
		)
		.setDisabled(true)
}

export const renderQianFanSections = (
	details: HTMLElement,
	options: QianFanOptions,
	index: number,
	settings: ProviderSettings,
	capability: ReasoningCapabilityRecord,
	context: ProviderSectionContext
) => {
	const isImageModel = qianFanIsImageGenerationModel(options.model ?? '')
	if (!isImageModel) {
		const unsupported = capability.state === 'unsupported'
		new Setting(details)
			.setName(t('Enable deep thinking'))
			.setDesc(
				t('QianFan deep thinking description') +
					' ' +
					context.getReasoningCapabilityHintText(capability)
			)
			.addToggle((toggle) =>
				toggle
					.setValue(unsupported ? false : options.enableThinking ?? false)
					.setDisabled(unsupported)
					.onChange(async (value) => {
						if (unsupported) return
						options.enableThinking = value
						await context.saveSettings()
						context.updateProviderCapabilities(index, settings)
					})
			)
	}

	new Setting(details)
		.setName(t('Image response format'))
		.setDesc(t('Image response format description qianfan'))
		.addDropdown((dropdown) =>
			dropdown
				.addOptions({
					b64_json: t('Base64 JSON (recommended)'),
					url: 'URL'
				})
				.setValue(options.imageResponseFormat || 'b64_json')
				.onChange(async (value) => {
					options.imageResponseFormat = value as QianFanOptions['imageResponseFormat']
					await context.saveSettings()
				})
		)

	new Setting(details)
		.setName(t('Images per request'))
		.setDesc(t('Images per request description'))
		.addSlider((slider) =>
			slider
				.setLimits(1, 4, 1)
				.setValue(options.imageCount ?? 1)
				.setDynamicTooltip()
				.onChange(async (value) => {
					options.imageCount = value
					await context.saveSettings()
				})
		)

	new Setting(details)
		.setName(t('Image Display Width'))
		.setDesc(t('Image display width description attachment only'))
		.addSlider((slider) =>
			slider
				.setLimits(200, 800, 50)
				.setValue(options.imageDisplayWidth ?? 400)
				.setDynamicTooltip()
				.onChange(async (value) => {
					options.imageDisplayWidth = value
					await context.saveSettings()
				})
		)
}

export const renderKimiSections = (
	details: HTMLElement,
	options: KimiOptions,
	index: number,
	settings: ProviderSettings,
	capability: ReasoningCapabilityRecord,
	context: ProviderSectionContext
) => {
	renderReasoningToggleSection({
		details,
		options,
		index,
		settings,
		capability,
		description: t('Enable reasoning feature description'),
		context
	})
}

export const renderDeepSeekSections = (
	details: HTMLElement,
	options: DeepSeekOptions,
	index: number,
	settings: ProviderSettings,
	capability: ReasoningCapabilityRecord,
	context: ProviderSectionContext
) => {
	renderReasoningToggleSection({
		details,
		options,
		index,
		settings,
		capability,
		description: t('Enable reasoning feature description'),
		context
	})

	new Setting(details)
		.setName(t('Structured output'))
		.setDesc(t('Structured output description'))
		.addToggle((toggle) =>
			toggle.setValue(options.enableStructuredOutput ?? false).onChange(async (value) => {
				options.enableStructuredOutput = value
				await context.saveSettings()
			})
		)
}

export const renderOllamaSections = (
	details: HTMLElement,
	options: BaseOptions & ReasoningToggleOptions,
	index: number,
	settings: ProviderSettings,
	capability: ReasoningCapabilityRecord,
	context: ProviderSectionContext
) => {
	renderReasoningToggleSection({
		details,
		options,
		index,
		settings,
		capability,
		description: t('Enable reasoning feature description'),
		context
	})

	new Setting(details)
		.setName(t('Structured output'))
		.setDesc(t('Structured output description'))
		.addToggle((toggle) =>
			toggle.setValue(options.enableStructuredOutput ?? false).onChange(async (value) => {
				options.enableStructuredOutput = value
				await context.saveSettings()
			})
		)
}

export const renderGrokSections = (
	details: HTMLElement,
	options: GrokOptions,
	index: number,
	settings: ProviderSettings,
	capability: ReasoningCapabilityRecord,
	context: ProviderSectionContext
) => {
	renderReasoningToggleSection({
		details,
		options,
		index,
		settings,
		capability,
		description: t('Enable reasoning feature description'),
		context
	})
}

export const renderOpenAISections = (
	details: HTMLElement,
	options: OpenAIOptions,
	index: number,
	settings: ProviderSettings,
	capability: ReasoningCapabilityRecord,
	context: ProviderSectionContext
) => {
	renderReasoningToggleSection({
		details,
		options,
		index,
		settings,
		capability,
		description: t('OpenAI reasoning description'),
		context
	})
}

export const renderPoeSections = (
	details: HTMLElement,
	options: PoeOptions,
	index: number,
	settings: ProviderSettings,
	capability: ReasoningCapabilityRecord,
	context: ProviderSectionContext
) => {
	renderReasoningToggleSection({
		details,
		options,
		index,
		settings,
		capability,
		description: t('Poe reasoning description'),
		context
	})
}

export const renderAzureSections = (
	details: HTMLElement,
	options: AzureOptions,
	index: number,
	settings: ProviderSettings,
	capability: ReasoningCapabilityRecord,
	context: ProviderSectionContext
) => {
	renderReasoningToggleSection({
		details,
		options,
		index,
		settings,
		capability,
		description: t('Azure reasoning description'),
		context
	})
}

const renderReasoningToggleSection = <TOptions extends ReasoningToggleOptions>({
	details,
	options,
	index,
	settings,
	capability,
	description,
	context
}: ReasoningToggleArgs<TOptions>) => {
	const unsupported = capability.state === 'unsupported'
	new Setting(details)
		.setName(t('Enable reasoning feature'))
		.setDesc(description + ' ' + context.getReasoningCapabilityHintText(capability))
		.addToggle((toggle) =>
			toggle
				.setValue(unsupported ? false : options.enableReasoning ?? false)
				.setDisabled(unsupported)
				.onChange(async (value) => {
					if (unsupported) return
					options.enableReasoning = value
					await context.saveSettings()
					context.updateProviderCapabilities(index, settings)
				})
		)
}
