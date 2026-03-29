import { App, Modal, Setting } from 'obsidian'
import { ollamaVendor } from 'src/LLMProviders/ollama'
import { t } from 'src/i18n/ai-runtime/helper'
import { availableVendors } from 'src/settings/ai-runtime/api'

interface VendorApiKeysModalParams {
	getVendorApiKey: (vendor: string) => string
	setVendorApiKey: (vendor: string, value: string) => void
	normalizeProviderVendor: (vendor: string) => string
	saveSettings: () => Promise<void>
}

export class VendorApiKeysModal extends Modal {
	constructor(
		app: App,
		private readonly params: VendorApiKeysModalParams
	) {
		super(app)
	}

	onOpen(): void {
		this.titleEl.setText(t('Vendor API keys'))
		this.contentEl.empty()
		this.contentEl.style.maxHeight = '70vh'
		this.contentEl.style.overflowY = 'auto'
		this.contentEl.style.padding = '8px 0'

		const container = this.contentEl.createDiv({ cls: 'vendor-api-keys-modal' })
		const vendorNames = Array.from(
			new Set(
				availableVendors
					.filter((vendor) => vendor.name !== ollamaVendor.name)
					.map((vendor) => this.params.normalizeProviderVendor(vendor.name))
			)
		)

		for (const vendorName of vendorNames) {
			let inputEl: HTMLInputElement | null = null
			let isPasswordVisible = false

			new Setting(container)
				.setName(vendorName)
				.setDesc(t('Vendor API key empty description'))
				.addText((text) => {
					inputEl = text.inputEl
					inputEl.type = 'password'
					text
						.setPlaceholder(t('API key'))
						.setValue(this.params.getVendorApiKey(vendorName))
						.onChange(async (value) => {
							this.params.setVendorApiKey(vendorName, value)
							await this.params.saveSettings()
						})
				})
				.addButton((btn) => {
					btn
						.setIcon('eye-off')
						.setTooltip(t('Show or hide secret'))
						.onClick(() => {
							isPasswordVisible = !isPasswordVisible
							if (inputEl) {
								inputEl.type = isPasswordVisible ? 'text' : 'password'
							}
							btn.setIcon(isPasswordVisible ? 'eye' : 'eye-off')
						})
				})
		}
	}

	onClose(): void {
		this.contentEl.empty()
	}
}
