import { Setting } from 'obsidian'
import type { ClaudeOptions } from 'src/LLMProviders/claude'
import type { GptImageOptions } from 'src/LLMProviders/gptImage'
import { t } from 'src/i18n/ai-runtime/helper'
import type { BaseOptions, Optional } from 'src/types/provider'
import { isValidUrl } from './providerUtils'

export const addBaseUrlSection = (params: {
	details: HTMLElement
	options: BaseOptions
	defaultValue: string
	saveSettings: () => Promise<void>
}) => {
	let textInput: HTMLInputElement | null = null
	const setting = new Setting(params.details)
		.setName('baseURL')
		.setDesc(`${t('Default:')} ${params.defaultValue}`)
		.addExtraButton((btn) => {
			btn
				.setIcon('reset')
				.setTooltip(t('Restore default'))
				.onClick(async () => {
					params.options.baseURL = params.defaultValue
					await params.saveSettings()
					if (textInput) {
						textInput.value = params.defaultValue
					}
				})
		})
		.addText((text) => {
			textInput = text.inputEl
			text.setValue(params.options.baseURL).onChange(async (value) => {
				params.options.baseURL = value.trim()
				await params.saveSettings()
			})
		})
	setting.descEl.addClass('provider-base-url-desc')
	setting.descEl.setAttr('title', `${t('Default:')} ${params.defaultValue}`)
	return setting
}

const addSecretInputSection = (params: {
	details: HTMLElement
	name: string
	desc: string
	placeholder: string
	value: string
	onChange: (value: string) => Promise<void>
}) => {
	let isPasswordVisible = false
	let textInput: HTMLInputElement | null = null
	let toggleButton: HTMLButtonElement | null = null
	const setting = new Setting(params.details)
		.setName(params.name)
		.setDesc(params.desc)
		.addText((text) => {
			textInput = text.inputEl
			textInput.type = 'password'
			text
				.setPlaceholder(params.placeholder)
				.setValue(params.value)
				.onChange(async (value) => {
					await params.onChange(value.trim())
				})
		})
		.addButton((btn) => {
			toggleButton = btn.buttonEl
			btn
				.setIcon('eye-off')
				.setTooltip(t('Show or hide secret'))
				.onClick(() => {
					isPasswordVisible = !isPasswordVisible
					if (textInput) {
						textInput.type = isPasswordVisible ? 'text' : 'password'
					}
					if (toggleButton) {
						btn.setIcon(isPasswordVisible ? 'eye' : 'eye-off')
					}
				})
			toggleButton.addClass('clickable-icon')
		})
	return setting
}

export const addApiKeySection = (params: {
	details: HTMLElement
	options: BaseOptions
	desc?: string
	saveSettings: () => Promise<void>
}) =>
	addSecretInputSection({
		details: params.details,
		name: t('API key'),
		desc: params.desc ?? '',
		placeholder: t('API key (required)'),
		value: params.options.apiKey,
		onChange: async (value) => {
			params.options.apiKey = value
			await params.saveSettings()
		},
	})

export const addApiSecretSection = (params: {
	details: HTMLElement
	options: BaseOptions & Pick<Optional, 'apiSecret'>
	desc?: string
	saveSettings: () => Promise<void>
}) =>
	addSecretInputSection({
		details: params.details,
		name: t('API Secret'),
		desc: params.desc ?? '',
		placeholder: '',
		value: params.options.apiSecret,
		onChange: async (value) => {
			params.options.apiSecret = value
			await params.saveSettings()
		},
	})

export const addEndpointSection = (params: {
	details: HTMLElement
	options: BaseOptions & Pick<Optional, 'endpoint'>
	saveSettings: () => Promise<void>
	notify: (message: string, timeout?: number) => void
}) =>
	new Setting(params.details)
		.setName(t('Endpoint'))
		.setDesc('e.g. https://docs-test-001.openai.azure.com/')
		.addText((text) =>
			text
				.setPlaceholder('')
				.setValue(params.options.endpoint)
				.onChange(async (value) => {
					const url = value.trim()
					if (url.length === 0) {
						params.options.endpoint = ''
						await params.saveSettings()
					} else if (!isValidUrl(url)) {
						params.notify(t('Invalid URL'))
					} else {
						params.options.endpoint = url
						await params.saveSettings()
					}
				})
		)

export const addApiVersionSection = (params: {
	details: HTMLElement
	options: BaseOptions & Pick<Optional, 'apiVersion'>
	saveSettings: () => Promise<void>
}) =>
	new Setting(params.details)
		.setName(t('API version'))
		.setDesc('e.g. 2024-xx-xx-preview')
		.addText((text) =>
			text
				.setPlaceholder('')
				.setValue(params.options.apiVersion)
				.onChange(async (value) => {
					params.options.apiVersion = value.trim()
					await params.saveSettings()
				})
		)

export const addContextLengthSection = (params: {
	details: HTMLElement
	options: BaseOptions
	saveSettings: () => Promise<void>
}) => {
	const DEFAULT_CONTEXT_LENGTH = 128000
	return new Setting(params.details)
		.setName(t('Context length'))
		.setDesc(t('Context length description'))
		.addText((text) =>
			text
				.setPlaceholder('128000')
				.setValue(String(params.options.contextLength ?? DEFAULT_CONTEXT_LENGTH))
				.onChange(async (value) => {
					const num = parseInt(value.trim(), 10)
					params.options.contextLength =
						Number.isNaN(num) || num <= 0 ? DEFAULT_CONTEXT_LENGTH : num
					await params.saveSettings()
				})
		)
}

export const addParametersSection = (params: {
	details: HTMLElement
	options: BaseOptions
	saveSettings: () => Promise<void>
	notify: (message: string, timeout?: number) => void
}) => {
	const setting = new Setting(params.details)
		.setName(t('Additional parameters'))
		.setDesc(t('Additional parameters description'))
		.addTextArea((text) =>
			text
				.setPlaceholder('{"temperature": 0.7, "top_p": 0.9}')
				.setValue(JSON.stringify(params.options.parameters))
				.onChange(async (value) => {
					try {
						const trimmed = value.trim()
						if (trimmed === '') {
							params.options.parameters = {}
							await params.saveSettings()
							return
						}
						const parsed = JSON.parse(trimmed)
						if (parsed.model) {
							params.notify(t('Please set model in the Model field above, not here'))
							return
						}
						params.options.parameters = parsed
						await params.saveSettings()
					} catch {
						return
					}
				})
		)
	setting.descEl.createEl('div', {
		text: t('Common parameters example'),
		cls: 'setting-item-description'
	})
	return setting
}

export const addClaudeSections = (params: {
	details: HTMLElement
	options: ClaudeOptions
	saveSettings: () => Promise<void>
	notify: (message: string, timeout?: number) => void
}) => {
	new Setting(params.details)
		.setName(t('Thinking'))
		.setDesc(
			t('When enabled, Claude will show its reasoning process before giving the final answer.')
		)
		.addToggle((toggle) =>
			toggle.setValue(params.options.enableThinking ?? false).onChange(async (value) => {
				params.options.enableThinking = value
				await params.saveSettings()
			})
		)

	new Setting(params.details)
		.setName(t('Budget tokens for thinking'))
		.setDesc(t('Must be ≥1024 and less than max_tokens'))
		.addText((text) =>
			text
				.setPlaceholder('')
				.setValue(params.options.budget_tokens ? String(params.options.budget_tokens) : '1600')
				.onChange(async (value) => {
					const number = parseInt(value, 10)
					if (Number.isNaN(number)) {
						params.notify(t('Please enter a number'))
						return
					}
					if (number < 1024) {
						params.notify(t('Minimum value is 1024'))
						return
					}
					params.options.budget_tokens = number
					await params.saveSettings()
				})
		)

	new Setting(params.details)
		.setName('Max tokens')
		.setDesc(t('Refer to the technical documentation'))
		.addText((text) =>
			text
				.setPlaceholder('')
				.setValue(String(params.options.max_tokens))
				.onChange(async (value) => {
					const number = parseInt(value, 10)
					if (Number.isNaN(number)) {
						params.notify(t('Please enter a number'))
						return
					}
					if (number < 256) {
						params.notify(t('Minimum value is 256'))
						return
					}
					params.options.max_tokens = number
					await params.saveSettings()
				})
		)
}

export const addGptImageSections = (params: {
	details: HTMLElement
	options: GptImageOptions
	saveSettings: () => Promise<void>
}) => {
	new Setting(params.details)
		.setName(t('Image Display Width'))
		.setDesc(t('Example: 400px width would output as ![[image.jpg|400]]'))
		.addSlider((slider) =>
			slider
				.setLimits(200, 800, 100)
				.setValue(params.options.displayWidth)
				.setDynamicTooltip()
				.onChange(async (value) => {
					params.options.displayWidth = value
					await params.saveSettings()
				})
		)
	new Setting(params.details)
		.setName(t('Number of images'))
		.setDesc(t('Number of images to generate (1-5)'))
		.addSlider((slider) =>
			slider
				.setLimits(1, 5, 1)
				.setValue(params.options.n)
				.setDynamicTooltip()
				.onChange(async (value) => {
					params.options.n = value
					await params.saveSettings()
				})
		)
	new Setting(params.details).setName(t('Image size')).addDropdown((dropdown) =>
		dropdown
			.addOptions({
				auto: 'Auto',
				'1024x1024': '1024x1024',
				'1536x1024': `1536x1024 ${t('landscape')}`,
				'1024x1536': `1024x1536 ${t('portrait')}`
			})
			.setValue(params.options.size)
			.onChange(async (value) => {
				params.options.size = value as GptImageOptions['size']
				await params.saveSettings()
			})
	)
	new Setting(params.details).setName(t('Output format')).addDropdown((dropdown) =>
		dropdown
			.addOptions({ png: 'PNG', jpeg: 'JPEG', webp: 'WEBP' })
			.setValue(params.options.output_format)
			.onChange(async (value) => {
				params.options.output_format = value as GptImageOptions['output_format']
				await params.saveSettings()
			})
	)
	new Setting(params.details)
		.setName(t('Quality'))
		.setDesc(t('Quality level for generated images. default: Auto'))
		.addDropdown((dropdown) =>
			dropdown
				.addOptions({
					auto: t('Auto'),
					high: t('High'),
					medium: t('Medium'),
					low: t('Low')
				})
				.setValue(params.options.quality)
				.onChange(async (value) => {
					params.options.quality = value as GptImageOptions['quality']
					await params.saveSettings()
				})
		)
	new Setting(params.details)
		.setName(t('Background'))
		.setDesc(t('Background of the generated image. default: Auto'))
		.addDropdown((dropdown) =>
			dropdown
				.addOptions({
					auto: t('Auto'),
					transparent: t('Transparent'),
					opaque: t('Opaque')
				})
				.setValue(params.options.background)
				.onChange(async (value) => {
					params.options.background = value as GptImageOptions['background']
					await params.saveSettings()
				})
		)
	new Setting(params.details)
		.setName(t('Output compression'))
		.setDesc(
			t('Compression level of the output image, 10% - 100%. Only for webp or jpeg output format')
		)
		.addSlider((slider) =>
			slider
				.setLimits(10, 100, 10)
				.setValue(params.options.output_compression)
				.setDynamicTooltip()
				.onChange(async (value) => {
					params.options.output_compression = value
					await params.saveSettings()
				})
		)
}
