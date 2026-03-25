import { DropdownComponent, Notice, Setting } from 'obsidian'
import {
	DEFAULT_DOUBAO_THINKING_TYPE,
	DOUBAO_REASONING_EFFORT_OPTIONS,
	type DoubaoOptions,
	type DoubaoReasoningEffort,
	type DoubaoThinkingType,
	doubaoVendor
} from 'src/LLMProviders/doubao'
import {
	DEFAULT_DOUBAO_IMAGE_OPTIONS,
	DOUBAO_IMAGE_SIZE_PRESETS,
	type DoubaoImageOptions
} from 'src/LLMProviders/doubaoImage'
import { t } from 'src/i18n/ai-runtime/helper'
import { localInstance } from 'src/i18n/locals'
import type { ProviderSectionContext } from './types'

export const ensureDoubaoImageDefaults = (options: DoubaoOptions & Partial<DoubaoImageOptions>) => {
	options.displayWidth ??= DEFAULT_DOUBAO_IMAGE_OPTIONS.displayWidth
	options.size ??= DEFAULT_DOUBAO_IMAGE_OPTIONS.size
	options.response_format ??= DEFAULT_DOUBAO_IMAGE_OPTIONS.response_format
	options.watermark ??= DEFAULT_DOUBAO_IMAGE_OPTIONS.watermark
	options.sequential_image_generation ??= DEFAULT_DOUBAO_IMAGE_OPTIONS.sequential_image_generation
	options.stream ??= DEFAULT_DOUBAO_IMAGE_OPTIONS.stream
	options.optimize_prompt_mode ??= DEFAULT_DOUBAO_IMAGE_OPTIONS.optimize_prompt_mode
	options.max_images ??= 5
}

export const renderDoubaoSections = (
	details: HTMLElement,
	options: DoubaoOptions,
	context: ProviderSectionContext
) => {
	const thinkingContainer = details.createDiv({ cls: 'ai-runtime-doubao-thinking-section' })
	const renderThinkingControls = () => {
		thinkingContainer.empty()
		renderDoubaoThinkingControls(thinkingContainer, options, context)
	}
	renderThinkingControls()
	context.registerDoubaoRenderer(options, renderThinkingControls)

	new Setting(details)
		.setName(t('Doubao image detail'))
		.setDesc(t('Doubao image detail description'))
		.addDropdown((dropdown) =>
			dropdown
				.addOptions({
					'': t('Unset (use default)'),
					low: t('Low resolution (faster)'),
					high: t('High resolution (more detail)')
				})
				.setValue(options.imageDetail || '')
				.onChange(async (value) => {
					options.imageDetail = value ? (value as 'low' | 'high') : undefined
					await context.saveSettings()
				})
		)

	new Setting(details)
		.setName(t('Doubao min pixels'))
		.setDesc(t('Doubao min pixels description'))
		.addText((text) =>
			text
				.setPlaceholder(t('For example: 3136'))
				.setValue(options.imagePixelLimit?.minPixels?.toString() || '')
				.onChange(async (value) => {
					const numValue = Number.parseInt(value, 10)
					if (!options.imagePixelLimit) {
						options.imagePixelLimit = {}
					}
					if (value === '' || Number.isNaN(numValue) || numValue === 0) {
						delete options.imagePixelLimit.minPixels
					} else if (numValue >= 196 && numValue <= 36_000_000) {
						options.imagePixelLimit.minPixels = numValue
					} else {
						new Notice(localInstance.ai_runtime_image_pixel_limit_invalid)
						return
					}
					await context.saveSettings()
				})
		)

	new Setting(details)
		.setName(t('Doubao max pixels'))
		.setDesc(t('Doubao max pixels description'))
		.addText((text) =>
			text
				.setPlaceholder(t('For example: 1048576'))
				.setValue(options.imagePixelLimit?.maxPixels?.toString() || '')
				.onChange(async (value) => {
					const numValue = Number.parseInt(value, 10)
					if (!options.imagePixelLimit) {
						options.imagePixelLimit = {}
					}
					if (value === '' || Number.isNaN(numValue) || numValue === 0) {
						delete options.imagePixelLimit.maxPixels
					} else if (numValue >= 196 && numValue <= 36_000_000) {
						options.imagePixelLimit.maxPixels = numValue
					} else {
						new Notice(localInstance.ai_runtime_image_pixel_limit_invalid)
						return
					}
					await context.saveSettings()
				})
		)
}

export const renderDoubaoImageSections = (
	details: HTMLElement,
	options: DoubaoImageOptions,
	context: Pick<ProviderSectionContext, 'saveSettings'>
) => {
	new Setting(details)
		.setName(t('Image Display Width'))
		.setDesc(t('Example: 400px width would output as ![[image.jpg|400]]'))
		.addSlider((slider) =>
			slider
				.setLimits(200, 800, 100)
				.setValue(options.displayWidth)
				.setDynamicTooltip()
				.onChange(async (value) => {
					options.displayWidth = value
					await context.saveSettings()
				})
		)

	new Setting(details)
		.setName(t('Image size'))
		.setDesc(t('Supports preset resolutions (1K/2K/4K) or exact pixel values'))
		.addDropdown((dropdown) => {
			dropdown
				.addOptions(DOUBAO_IMAGE_SIZE_PRESETS)
				.setValue(options.size)
				.onChange(async (value) => {
					options.size = value
					await context.saveSettings()
				})
			return dropdown
		})

	new Setting(details)
		.setName(t('Image response format'))
		.setDesc(t('Choose how to receive generated images'))
		.addDropdown((dropdown) =>
			dropdown
				.addOptions({
					b64_json: t('Base64 JSON (recommended)'),
					url: 'URL'
				})
				.setValue(options.response_format)
				.onChange(async (value) => {
					options.response_format = value as DoubaoImageOptions['response_format']
					await context.saveSettings()
				})
		)

	new Setting(details)
		.setName(t('Group image generation'))
		.setDesc(t('Group image generation description'))
		.addDropdown((dropdown) =>
			dropdown
				.addOptions({
					disabled: t('Disabled (single image output)'),
					auto: t('Auto (group image output)')
				})
				.setValue(options.sequential_image_generation || 'disabled')
				.onChange(async (value) => {
					options.sequential_image_generation = value as 'auto' | 'disabled'
					await context.saveSettings()
				})
		)

	new Setting(details)
		.setName(t('Maximum image count'))
		.setDesc(t('Maximum image count description'))
		.addSlider((slider) =>
			slider
				.setLimits(1, 15, 1)
				.setValue(options.max_images || 5)
				.setDynamicTooltip()
				.onChange(async (value) => {
					options.max_images = value
					await context.saveSettings()
				})
		)

	new Setting(details)
		.setName(t('Streaming output'))
		.setDesc(t('Streaming output description'))
		.addToggle((toggle) =>
			toggle.setValue(options.stream ?? false).onChange(async (value) => {
				options.stream = value
				await context.saveSettings()
			})
		)

	new Setting(details)
		.setName(t('Prompt optimization mode'))
		.setDesc(t('Prompt optimization mode description'))
		.addDropdown((dropdown) =>
			dropdown
				.addOptions({
					standard: t('Standard mode (recommended)'),
					fast: t('Fast mode')
				})
				.setValue(options.optimize_prompt_mode || 'standard')
				.onChange(async (value) => {
					options.optimize_prompt_mode = value as 'standard' | 'fast'
					await context.saveSettings()
				})
		)

	new Setting(details)
		.setName(t('Watermark'))
		.setDesc(t('Add watermark to generated images'))
		.addToggle((toggle) =>
			toggle.setValue(options.watermark ?? false).onChange(async (value) => {
				options.watermark = value
				await context.saveSettings()
			})
		)
}

const renderDoubaoThinkingControls = (
	container: HTMLElement,
	options: DoubaoOptions,
	context: ProviderSectionContext
) => {
	const model = options.model
	const capability = context.resolveModelReasoningCapability(doubaoVendor.name, options)
	const thinkingSetting = new Setting(container).setName(t('Doubao thinking mode'))

	if (!model) {
		thinkingSetting
			.setDesc(t('Select a model first to configure deep thinking.'))
			.addDropdown((dropdown) => {
				dropdown.addOption('', t('Select a model first'))
				dropdown.setValue('')
				dropdown.setDisabled(true)
			})
		return
	}

	if (capability.state === 'unsupported') {
		thinkingSetting
			.setDesc(context.getReasoningCapabilityHintText(capability))
			.addDropdown((dropdown) => {
				dropdown.addOption('', t('Not supported'))
				dropdown.setValue('')
				dropdown.setDisabled(true)
			})
		return
	}

	const inferredSupportedTypes: DoubaoThinkingType[] =
		capability.state === 'supported' && Array.isArray(capability.thinkingModes)
			? capability.thinkingModes
					.map((mode) => mode.toLowerCase())
					.filter(
						(mode): mode is DoubaoThinkingType =>
							mode === 'enabled' || mode === 'disabled' || mode === 'auto'
					)
			: ['enabled', 'disabled']
	const supportedTypes: DoubaoThinkingType[] =
		inferredSupportedTypes.length > 0 ? inferredSupportedTypes : ['enabled', 'disabled']
	const fallbackType: DoubaoThinkingType = supportedTypes.includes(DEFAULT_DOUBAO_THINKING_TYPE)
		? DEFAULT_DOUBAO_THINKING_TYPE
		: supportedTypes[0] ?? 'enabled'
	const initialThinking: DoubaoThinkingType =
		options.thinkingType && supportedTypes.includes(options.thinkingType)
			? options.thinkingType
			: fallbackType

	let reasoningDropdown: DropdownComponent | null = null
	const thinkingLabels: Record<DoubaoThinkingType, string> = {
		enabled: t('Force enable deep thinking'),
		disabled: t('Force disable deep thinking'),
		auto: t('Let the model decide deep thinking automatically')
	}

	thinkingSetting
		.setDesc(
			t('Control whether the Doubao model performs deep thinking before answering.') +
				' ' +
				context.getReasoningCapabilityHintText(capability)
		)
		.addDropdown((dropdown) => {
			for (const type of supportedTypes) {
				dropdown.addOption(type, thinkingLabels[type])
			}
			dropdown.setValue(initialThinking)
			dropdown.onChange(async (value) => {
				const newValue = value as DoubaoThinkingType
				options.thinkingType = newValue
				if (capability.supportsReasoningEffort === true && reasoningDropdown) {
					if (newValue === 'enabled') {
						const validEffort =
							options.reasoningEffort &&
							DOUBAO_REASONING_EFFORT_OPTIONS.includes(options.reasoningEffort)
								? options.reasoningEffort
								: 'low'
						reasoningDropdown.setDisabled(false)
						reasoningDropdown.setValue(validEffort)
						options.reasoningEffort = validEffort
					} else {
						reasoningDropdown.setDisabled(true)
						reasoningDropdown.setValue('minimal')
						options.reasoningEffort = 'minimal'
					}
				}
				await context.saveSettings()
			})
		})

	if (capability.supportsReasoningEffort !== true) {
		return
	}

	const reasoningLabels: Record<DoubaoReasoningEffort, string> = {
		minimal: t('Minimal reasoning (direct answer)'),
		low: t('Low reasoning (quick response)'),
		medium: t('Medium reasoning (balanced)'),
		high: t('High reasoning (deep analysis)')
	}
	const storedEffort =
		options.reasoningEffort && DOUBAO_REASONING_EFFORT_OPTIONS.includes(options.reasoningEffort)
			? options.reasoningEffort
			: 'low'
	const initialReasoning: DoubaoReasoningEffort =
		initialThinking === 'enabled' ? storedEffort : 'minimal'
	if (initialThinking === 'enabled') {
		options.reasoningEffort = storedEffort
	}

	new Setting(container)
		.setName(t('Reasoning effort'))
		.setDesc(
			t(
				'Adjust how long the model thinks before answering. Only available when deep thinking is enabled.'
			)
		)
		.addDropdown((dropdown) => {
			for (const effort of DOUBAO_REASONING_EFFORT_OPTIONS) {
				dropdown.addOption(effort, reasoningLabels[effort])
			}
			dropdown.setValue(initialReasoning)
			dropdown.setDisabled(initialThinking !== 'enabled')
			dropdown.onChange(async (value) => {
				options.reasoningEffort = value as DoubaoReasoningEffort
				await context.saveSettings()
			})
			reasoningDropdown = dropdown
		})
}
