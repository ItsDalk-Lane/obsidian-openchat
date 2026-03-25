import { Setting } from 'obsidian'
import type { OpenRouterOptions } from 'src/LLMProviders/openRouter'
import { t } from 'src/i18n/ai-runtime/helper'
import type { ProviderSectionContext } from './types'

export const renderOpenRouterWebSearchSections = (
	details: HTMLElement,
	options: OpenRouterOptions,
	context: Pick<ProviderSectionContext, 'saveSettings'>
) => {
	new Setting(details)
		.setName(t('Search engine'))
		.setDesc(t('Search engine description'))
		.addDropdown((dropdown) =>
			dropdown
				.addOptions({
					auto: t('Auto select (recommended)'),
					native: t('Native search'),
					exa: t('General search with Exa')
				})
				.setValue(options.webSearchEngine || 'auto')
				.onChange(async (value) => {
					if (value === 'auto') {
						options.webSearchEngine = undefined
					} else {
						options.webSearchEngine = value as 'native' | 'exa'
					}
					await context.saveSettings()
				})
		)

	new Setting(details)
		.setName(t('Search result count'))
		.setDesc(t('Search result count description'))
		.addSlider((slider) =>
			slider
				.setLimits(1, 10, 1)
				.setValue(options.webSearchMaxResults ?? 5)
				.setDynamicTooltip()
				.onChange(async (value) => {
					options.webSearchMaxResults = value
					await context.saveSettings()
				})
		)

	new Setting(details)
		.setName(t('Custom search prompt'))
		.setDesc(t('Custom search prompt description'))
		.addTextArea((text) => {
			text
				.setPlaceholder(t('Default web search prompt'))
				.setValue(options.webSearchPrompt || '')
				.onChange(async (value) => {
					const trimmed = value.trim()
					options.webSearchPrompt = trimmed || undefined
					await context.saveSettings()
				})
			text.inputEl.rows = 4
			text.inputEl.style.width = '100%'
			return text
		})
}

export const renderOpenRouterImageGenerationSections = (
	details: HTMLElement,
	options: OpenRouterOptions,
	context: Pick<ProviderSectionContext, 'saveSettings'>
) => {
	new Setting(details)
		.setName(t('Parameter scope'))
		.setDesc(t('OpenRouter image parameter scope description'))

	new Setting(details)
		.setName(t('Image aspect ratio'))
		.setDesc(t('Image aspect ratio description'))
		.addDropdown((dropdown) =>
			dropdown
				.addOptions({
					'1:1': '1:1 (1024×1024)',
					'2:3': '2:3 (832×1248)',
					'3:2': '3:2 (1248×832)',
					'3:4': '3:4 (864×1184)',
					'4:3': '4:3 (1184×864)',
					'4:5': '4:5 (896×1152)',
					'5:4': '5:4 (1152×896)',
					'9:16': '9:16 (768×1344)',
					'16:9': '16:9 (1344×768)',
					'21:9': '21:9 (1536×672)'
				})
				.setValue(options.imageAspectRatio || '1:1')
				.onChange(async (value) => {
					options.imageAspectRatio = value as OpenRouterOptions['imageAspectRatio']
					await context.saveSettings()
				})
		)

	new Setting(details)
		.setName(t('Streaming image generation'))
		.setDesc(t('Streaming image generation description'))
		.addToggle((toggle) =>
			toggle.setValue(options.imageStream ?? false).onChange(async (value) => {
				options.imageStream = value
				await context.saveSettings()
			})
		)

	new Setting(details)
		.setName(t('Image response format'))
		.setDesc(t('Image response format description'))
		.addDropdown((dropdown) =>
			dropdown
				.addOptions({
					b64_json: t('Base64 JSON (recommended)'),
					url: 'URL'
				})
				.setValue(options.imageResponseFormat || 'b64_json')
				.onChange(async (value) => {
					options.imageResponseFormat = value as 'url' | 'b64_json'
					await context.saveSettings()
				})
		)

	new Setting(details)
		.setName(t('Image save as attachment'))
		.setDesc(t('Image save as attachment description'))
		.addToggle((toggle) =>
			toggle.setValue(options.imageSaveAsAttachment ?? true).onChange(async (value) => {
				options.imageSaveAsAttachment = value
				await context.saveSettings()
			})
		)

	if (options.imageSaveAsAttachment) {
		new Setting(details)
			.setName(t('Image Display Width'))
			.setDesc(t('Image display width description pixels'))
			.addSlider((slider) =>
				slider
					.setLimits(200, 800, 50)
					.setValue(options.imageDisplayWidth || 400)
					.setDynamicTooltip()
					.onChange(async (value) => {
						options.imageDisplayWidth = value
						await context.saveSettings()
					})
			)
	}
}

export const renderOpenRouterReasoningSections = (
	details: HTMLElement,
	options: OpenRouterOptions,
	context: Pick<ProviderSectionContext, 'saveSettings'>
) => {
	new Setting(details)
		.setName(t('Reasoning effort'))
		.setDesc(t('OpenRouter reasoning effort description'))
		.addDropdown((dropdown) =>
			dropdown
				.addOptions({
					minimal: t('Minimal'),
					low: t('Low'),
					medium: t('Medium (recommended)'),
					high: t('High')
				})
				.setValue(options.reasoningEffort || 'medium')
				.onChange(async (value) => {
					options.reasoningEffort = value as OpenRouterOptions['reasoningEffort']
					await context.saveSettings()
				})
		)
}
