import { DropdownComponent, Notice, Setting, type App } from 'obsidian'
import { ollamaVendor } from 'src/LLMProviders/ollama'
import { SelectModelModal, ProviderSettingModal } from 'src/components/modals/AiRuntimeProviderModals'
import { t } from 'src/i18n/ai-runtime/helper'
import { localInstance } from 'src/i18n/locals'
import type { BaseOptions, ProviderSettings, Vendor } from 'src/types/provider'
import {
	fetchModels,
	fetchOllamaLocalModels,
	type ModelFetchConfig
} from './providerUtils'

type ModelFetchOptions = BaseOptions & { apiSecret?: string }

export const addModelButtonSection = (params: {
	app: App
	details: HTMLElement
	options: BaseOptions
	modelConfig: ModelFetchConfig
	desc: string
	saveSettings: () => Promise<void>
	getVendorApiKey: (vendor: string) => string
	cacheReasoningCapabilityFromMetadata: (
		vendorName: string,
		options: BaseOptions,
		rawModel?: unknown
	) => void
	vendorName?: string
	index?: number
	settings?: ProviderSettings
	vendor?: Vendor
	modal?: ProviderSettingModal
	onModelUpdated?: () => Promise<void> | void
}) => {
	const setting = new Setting(params.details).setName(t('Model')).setDesc(params.desc)
	let buttonComponent: HTMLButtonElement | null = null
	let textInputComponent: HTMLInputElement | null = null
	let switchToCustomButtonEl: HTMLElement | null = null
	let switchToSelectButtonEl: HTMLElement | null = null

	setting.addButton((btn) => {
		buttonComponent = btn.buttonEl
		btn
			.setButtonText(params.options.model ? params.options.model : t('Select the model to use'))
			.onClick(async () => {
				const modelOptions = params.options as ModelFetchOptions
				if (params.vendorName && params.vendorName !== ollamaVendor.name) {
					modelOptions.apiKey = params.getVendorApiKey(params.vendorName)
				}
				if (params.modelConfig.requiresApiKey && !modelOptions.apiKey) {
					new Notice(t('Please input API key first'))
					return
				}
				if (params.modelConfig.requiresApiSecret && !modelOptions.apiSecret) {
					new Notice(localInstance.ai_runtime_api_secret_required)
					return
				}
				try {
					const { models, usedFallback, fallbackReason, rawModelById } = await fetchModels(
						params.modelConfig,
						modelOptions
					)
					if (models.length === 0) {
						throw new Error('No models available from remote endpoint or fallback list')
					}
					if (usedFallback) {
						new Notice(
							localInstance.ai_runtime_model_list_fallback_notice.replace(
								'{reason}',
								fallbackReason ? `: ${fallbackReason}` : ''
							)
						)
					}
					const onChoose = async (selectedModel: string) => {
						params.options.model = selectedModel
						const resolvedVendorName = params.vendor?.name || params.vendorName || ''
						const selectedRawModel = rawModelById?.[selectedModel]
						if (resolvedVendorName && selectedRawModel) {
							params.cacheReasoningCapabilityFromMetadata(
								resolvedVendorName,
								params.options,
								selectedRawModel
							)
						}
						await params.saveSettings()
						btn.setButtonText(selectedModel)
						await params.onModelUpdated?.()
					}
					new SelectModelModal(params.app, models, onChoose).open()
				} catch (error) {
					if (error instanceof Error) {
						const errorMessage = error.message.toLowerCase()
						if (errorMessage.includes('401') || errorMessage.includes('unauthorized')) {
							new Notice(t('API key may be incorrect. Please check your API key.'))
						} else if (errorMessage.includes('403') || errorMessage.includes('forbidden')) {
							new Notice(t('Access denied. Please check your API permissions.'))
						} else {
							new Notice(error.message)
						}
					} else {
						new Notice(String(error))
					}
				}
			})
	})

	setting.addText((text) => {
		textInputComponent = text.inputEl
		text
			.setPlaceholder(t('Enter custom model name'))
			.setValue(params.options.model || '')
			.onChange(async (value) => {
				params.options.model = value.trim()
				await params.saveSettings()
				if (buttonComponent) {
					buttonComponent.textContent = value.trim() || t('Select the model to use')
				}
				await params.onModelUpdated?.()
			})
		textInputComponent.style.display = 'none'
		textInputComponent.style.width = '200px'
	})

	setting.addButton((btn) => {
		switchToCustomButtonEl = btn.buttonEl
		btn
			.setButtonText('✏️')
			.setTooltip(t('Switch to custom input'))
			.onClick(() => {
				if (buttonComponent) {
					buttonComponent.style.display = 'none'
				}
				if (textInputComponent) {
					textInputComponent.style.display = 'inline-block'
					textInputComponent.value = params.options.model || ''
					textInputComponent.focus()
				}
				if (switchToCustomButtonEl) {
					switchToCustomButtonEl.style.display = 'none'
				}
				if (switchToSelectButtonEl) {
					switchToSelectButtonEl.style.display = 'inline-block'
				}
			})
	})

	setting.addButton((btn) => {
		switchToSelectButtonEl = btn.buttonEl
		btn
			.setButtonText('↩')
			.setTooltip(t('Switch to model selection'))
			.onClick(() => {
				if (buttonComponent) {
					buttonComponent.style.display = 'inline-block'
				}
				if (textInputComponent) {
					textInputComponent.style.display = 'none'
				}
				if (switchToCustomButtonEl) {
					switchToCustomButtonEl.style.display = 'inline-block'
				}
				if (switchToSelectButtonEl) {
					switchToSelectButtonEl.style.display = 'none'
				}
			})
		switchToSelectButtonEl.style.display = 'none'
	})

	return setting
}

export const addModelDropDownSection = (params: {
	details: HTMLElement
	options: BaseOptions
	models: string[]
	desc: string
	saveSettings: () => Promise<void>
	onModelUpdated?: () => Promise<void> | void
}) => {
	const CUSTOM_MODEL_KEY = '__custom__'
	const isCustomModel = !params.models.includes(params.options.model) && params.options.model !== ''
	const setting = new Setting(params.details).setName(t('Model')).setDesc(params.desc)
	let dropdownComponent: DropdownComponent | null = null
	let textInputComponent: HTMLInputElement | null = null
	let backButtonEl: HTMLElement | null = null
	let isShowingCustomInput = isCustomModel

	setting.addDropdown((dropdown) => {
		dropdownComponent = dropdown
		const optionsMap = params.models.reduce((acc: Record<string, string>, cur: string) => {
			acc[cur] = cur
			return acc
		}, {})
		optionsMap[CUSTOM_MODEL_KEY] = t('Custom')
		dropdown.addOptions(optionsMap)
		dropdown.setValue(isCustomModel ? CUSTOM_MODEL_KEY : params.options.model || params.models[0])
		dropdown.onChange(async (value) => {
			if (value === CUSTOM_MODEL_KEY) {
				isShowingCustomInput = true
				if (dropdownComponent) {
					dropdownComponent.selectEl.style.display = 'none'
				}
				if (textInputComponent) {
					textInputComponent.style.display = 'inline-block'
					textInputComponent.focus()
				}
				if (backButtonEl) {
					backButtonEl.style.display = 'inline-block'
				}
				return
			}
			params.options.model = value
			await params.saveSettings()
			await params.onModelUpdated?.()
		})
	})

	setting.addText((text) => {
		textInputComponent = text.inputEl
		text
			.setPlaceholder(t('Enter custom model name'))
			.setValue(isCustomModel ? params.options.model : '')
			.onChange(async (value) => {
				params.options.model = value.trim()
				await params.saveSettings()
				await params.onModelUpdated?.()
			})
		textInputComponent.style.display = isShowingCustomInput ? 'inline-block' : 'none'
		textInputComponent.style.width = '200px'
	})

	setting.addButton((btn) => {
		backButtonEl = btn.buttonEl
		btn
			.setButtonText('↩')
			.setTooltip(t('Back to preset models'))
			.onClick(() => {
				isShowingCustomInput = false
				if (textInputComponent) {
					textInputComponent.style.display = 'none'
				}
				if (dropdownComponent) {
					dropdownComponent.selectEl.style.display = 'inline-block'
					if (params.models.length > 0) {
						dropdownComponent.setValue(params.models[0])
						params.options.model = params.models[0]
						void params.saveSettings()
						void params.onModelUpdated?.()
					}
				}
				if (backButtonEl) {
					backButtonEl.style.display = 'none'
				}
			})
		backButtonEl.style.display = isShowingCustomInput ? 'inline-block' : 'none'
	})

	return setting
}

export const addModelTextSection = (params: {
	details: HTMLElement
	options: BaseOptions
	desc: string
	saveSettings: () => Promise<void>
	onModelUpdated?: () => Promise<void> | void
}) =>
	new Setting(params.details)
		.setName(t('Model'))
		.setDesc(params.desc)
		.addText((text) =>
			text
				.setPlaceholder('')
				.setValue(params.options.model)
				.onChange(async (value) => {
					params.options.model = value.trim()
					await params.saveSettings()
					await params.onModelUpdated?.()
				})
		)

export const addOllamaModelTextSection = (params: {
	details: HTMLElement
	options: BaseOptions
	desc: string
	saveSettings: () => Promise<void>
	onModelUpdated?: () => Promise<void> | void
}) => {
	const setting = new Setting(params.details).setName(t('Model')).setDesc(params.desc)
	let listEl: HTMLDivElement | null = null
	let isLoading = false
	let cachedModels: string[] | null = null
	let removeDocClick: (() => void) | null = null

	const closeList = () => {
		if (listEl) {
			listEl.remove()
			listEl = null
		}
		if (removeDocClick) {
			removeDocClick()
			removeDocClick = null
		}
	}

	const renderList = (models: string[], inputEl: HTMLInputElement) => {
		closeList()
		listEl = document.createElement('div')
		listEl.style.position = 'fixed'
		listEl.style.background = 'var(--background-primary)'
		listEl.style.border = '1px solid var(--background-modifier-border)'
		listEl.style.borderRadius = '6px'
		listEl.style.boxShadow = '0 6px 24px rgba(0, 0, 0, 0.12)'
		listEl.style.maxHeight = '240px'
		listEl.style.overflowY = 'auto'
		listEl.style.zIndex = '9999'
		listEl.style.minWidth = '220px'
		if (models.length === 0) {
			const emptyEl = document.createElement('div')
			emptyEl.textContent = t('No local models detected')
			emptyEl.style.padding = '8px 10px'
			emptyEl.style.color = 'var(--text-muted)'
			emptyEl.style.fontSize = '12px'
			listEl.appendChild(emptyEl)
		} else {
			for (const model of models) {
				const item = document.createElement('div')
				item.textContent = model
				item.style.padding = '8px 10px'
				item.style.cursor = 'pointer'
				item.style.fontSize = '12px'
				item.addEventListener('mouseenter', () => {
					item.style.background = 'var(--background-modifier-hover)'
				})
				item.addEventListener('mouseleave', () => {
					item.style.background = 'transparent'
				})
				item.addEventListener('mousedown', (event) => {
					event.stopPropagation()
				})
				item.addEventListener('click', async () => {
					inputEl.value = model
					params.options.model = model
					await params.saveSettings()
					closeList()
					await params.onModelUpdated?.()
				})
				listEl.appendChild(item)
			}
		}
		const rect = inputEl.getBoundingClientRect()
		listEl.style.left = `${rect.left}px`
		listEl.style.top = `${rect.bottom + 6}px`
		listEl.style.width = `${Math.max(rect.width, 220)}px`
		document.body.appendChild(listEl)
		const onDocClick = (event: MouseEvent) => {
			if (!listEl) return
			if (!setting.controlEl.contains(event.target as Node)) {
				closeList()
			}
		}
		document.addEventListener('mousedown', onDocClick)
		removeDocClick = () => document.removeEventListener('mousedown', onDocClick)
	}

	setting.addText((text) => {
		const inputEl = text.inputEl
		text
			.setPlaceholder(t('Click to scan local models'))
			.setValue(params.options.model)
			.onChange(async (value) => {
				params.options.model = value.trim()
				await params.saveSettings()
				await params.onModelUpdated?.()
			})
		inputEl.addEventListener('focus', async () => {
			if (isLoading) return
			isLoading = true
			try {
				if (!cachedModels) {
					cachedModels = await fetchOllamaLocalModels(params.options.baseURL)
				}
				renderList(cachedModels, inputEl)
			} catch {
				new Notice(localInstance.ai_runtime_ollama_models_unavailable)
			} finally {
				isLoading = false
			}
		})
		inputEl.addEventListener('blur', () => {
			setTimeout(() => closeList(), 120)
		})
	})

	return setting
}
