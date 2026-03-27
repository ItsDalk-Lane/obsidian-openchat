import { App, Modal, Setting } from 'obsidian';
import { claudeVendor } from 'src/LLMProviders/claude';
import { geminiVendor } from 'src/LLMProviders/gemini';
import type { ReasoningCapabilityRecord } from 'src/LLMProviders/modelCapability';
import { openAIVendor } from 'src/LLMProviders/openAI';
import { ollamaVendor } from 'src/LLMProviders/ollama';
import { t } from 'src/i18n/ai-runtime/helper';
import { availableVendors } from 'src/settings/ai-runtime';
import type { ProviderSettings, Vendor } from 'src/types/provider';
import { createProviderGroupId } from 'src/utils/aiProviderMetadata';
import { ProviderGroupConfigModalController } from './ProviderGroupConfigModalController';
import {
	createEmptyDraft,
	type ProviderGroupDraft,
} from './providerGroupAdapter';

const DEFAULT_CONTEXT_LENGTH = 128000;
const PROVIDER_PROTOCOL_OPTIONS = [openAIVendor, claudeVendor, geminiVendor];

export interface ProviderGroupConfigModalParams {
	mode: 'create' | 'edit';
	draft: ProviderGroupDraft;
	title: string;
	getVendorApiKey: (vendorName: string) => string;
	onCommit: (draft: ProviderGroupDraft) => Promise<void>;
	probeReasoningCapability: (provider: ProviderSettings, vendor: Vendor) => Promise<ReasoningCapabilityRecord>;
	testProviderConfiguration: (provider: ProviderSettings) => Promise<boolean>;
}

export class ProviderGroupConfigModal extends Modal {
	private configContainer!: HTMLElement;
	private readonly controller: ProviderGroupConfigModalController;

	constructor(app: App, private readonly params: ProviderGroupConfigModalParams) {
		super(app);
		this.controller = new ProviderGroupConfigModalController({
			app,
			params,
			getConfigContainer: () => this.configContainer,
			getDraft: () => this.draft,
			getSelectedVendor: () => this.selectedVendor,
			isCustomMode: () => this.isCustomMode,
			render: () => this.render(),
		});
	}

	private get draft(): ProviderGroupDraft {
		return this.params.draft;
	}

	private get selectedVendor(): Vendor | undefined {
		return availableVendors.find((vendor) => vendor.name === this.draft.protocolVendorName);
	}

	private get isCustomMode(): boolean {
		return this.draft.source === 'custom';
	}

	private ensureProtocolDefaults(): void {
		if (this.draft.source === 'custom' && !this.draft.protocolVendorName) {
			this.draft.protocolVendorName = openAIVendor.name;
			this.controller.applyVendorDefaults(this.draft.protocolVendorName);
		}
	}

	onOpen() {
		this.ensureProtocolDefaults();
		this.titleEl.hide();
		this.modalEl.addClass('provider-group-config-modal-wrapper');
		this.contentEl.style.maxHeight = '80vh';
		this.contentEl.style.overflowY = 'auto';
		this.contentEl.style.overflowX = 'hidden';
		this.contentEl.style.padding = '18px';
		this.configContainer = this.contentEl.createDiv({ cls: 'provider-group-config-modal' });
		this.render();
	}

	onClose() {
		this.modalEl.removeClass('provider-group-config-modal-wrapper');
		const shouldCommit = this.params.mode === 'edit' || this.draft.models.length > 0;
		if (shouldCommit) {
			void this.params.onCommit(this.draft);
		}
		this.contentEl.empty();
	}

	private render(): void {
		this.ensureProtocolDefaults();
		this.configContainer.empty();
		this.renderVendorRow();
		if (this.isCustomMode) {
			this.renderProtocolRow();
		}
		this.renderBaseUrlRow();
		if (this.isCustomMode) {
			this.renderApiKeyRow();
		}
		this.controller.renderModelToolbarRow();
		this.controller.renderModelList();
		this.controller.renderAddModelButton();
	}

	private renderVendorRow(): void {
		new Setting(this.configContainer)
			.setName(t('AI Provider'))
			.addDropdown((dropdown) => {
				dropdown.addOption('', t('Please select an option'));
				for (const vendor of availableVendors) {
					const hasKey = !!this.params.getVendorApiKey(vendor.name);
					const displayName = hasKey ? `${vendor.name} 🔑` : vendor.name;
					dropdown.addOption(vendor.name, displayName);
				}
				dropdown.addOption('Custom', t('Custom'));
				dropdown.setValue(this.draft.source === 'custom' ? 'Custom' : this.draft.selectedVendorName);
				dropdown.onChange((nextValue) => {
					this.controller.invalidateModelSuggestionCache();
					this.draft.models = [];
					this.draft.activeModelId = undefined;
					if (nextValue === 'Custom') {
						this.draft.source = 'custom';
						this.draft.selectedVendorName = 'Custom';
						this.draft.protocolVendorName = this.draft.protocolVendorName || openAIVendor.name;
						this.controller.applyVendorDefaults(this.draft.protocolVendorName);
					} else if (nextValue) {
						this.draft.source = 'preset';
						this.draft.selectedVendorName = nextValue;
						this.draft.protocolVendorName = nextValue;
						this.controller.applyVendorDefaults(nextValue);
					} else {
						this.draft.source = 'preset';
						this.draft.selectedVendorName = '';
					}
					this.render();
				});
			});
	}

	private renderProtocolRow(): void {
		new Setting(this.configContainer)
			.setName(t('API protocol'))
			.addDropdown((dropdown) => {
				for (const vendor of PROVIDER_PROTOCOL_OPTIONS) {
					dropdown.addOption(vendor.name, vendor.name);
				}
				dropdown.setValue(this.draft.protocolVendorName || openAIVendor.name);
				dropdown.onChange((value) => {
					this.controller.invalidateModelSuggestionCache();
					this.draft.protocolVendorName = value;
					this.controller.applyVendorDefaults(value);
					this.draft.models = [];
					this.draft.activeModelId = undefined;
					this.render();
				});
			});
	}

	private renderBaseUrlRow(): void {
		const vendor = this.selectedVendor;
		const defaultValue = vendor?.defaultOptions.baseURL ?? '';
		let textInput: HTMLInputElement | null = null;
		const setting = new Setting(this.configContainer)
			.setClass('provider-group-base-url-row')
			.setName('baseURL')
			.setDesc(defaultValue ? `${t('Default:')} ${defaultValue}` : '')
			.addExtraButton((btn) => {
				btn
					.setIcon('reset')
					.setTooltip(t('Restore default'))
					.onClick(() => {
						if (vendor && textInput) {
							this.draft.baseURL = vendor.defaultOptions.baseURL;
							this.controller.invalidateModelSuggestionCache();
							textInput.value = this.draft.baseURL;
						}
					});
			})
			.addText((text) => {
				textInput = text.inputEl;
				text.setValue(this.draft.baseURL).onChange((value) => {
					this.draft.baseURL = value.trim();
					this.controller.invalidateModelSuggestionCache();
				});
			});
		if (defaultValue) {
			setting.descEl.addClass('provider-base-url-desc');
			setting.descEl.setAttr('title', `${t('Default:')} ${defaultValue}`);
		}
	}

	private renderApiKeyRow(): void {
		let textInput: HTMLInputElement | null = null;
		let isVisible = false;
		new Setting(this.configContainer)
			.setName(t('API key'))
			.addButton((btn) => {
				btn
					.setIcon('eye-off')
					.setTooltip(t('Show or hide secret'))
					.onClick(() => {
						isVisible = !isVisible;
						if (textInput) {
							textInput.type = isVisible ? 'text' : 'password';
						}
						btn.setIcon(isVisible ? 'eye' : 'eye-off');
					});
			})
			.addText((text) => {
				textInput = text.inputEl;
				textInput.type = 'password';
				text
					.setPlaceholder(this.draft.protocolVendorName === ollamaVendor.name ? '' : t('API key (required)'))
					.setValue(this.draft.apiKey)
					.onChange((value) => {
						this.draft.apiKey = value.trim();
						this.controller.invalidateModelSuggestionCache();
					});
			});
	}

	private renderContextLengthRow(): void {
		new Setting(this.configContainer)
			.setName(t('Context length'))
			.addText((text) => {
				text.inputEl.type = 'number';
				text
					.setPlaceholder(String(DEFAULT_CONTEXT_LENGTH))
					.setValue(String(this.draft.contextLength ?? DEFAULT_CONTEXT_LENGTH))
					.onChange((value) => {
						const parsed = Number.parseInt(value, 10);
						this.draft.contextLength = Number.isFinite(parsed) && parsed > 0
							? parsed
							: DEFAULT_CONTEXT_LENGTH;
					});
			});
	}
}

export const createNewProviderGroupDraft = (): ProviderGroupDraft => {
	const draft = createEmptyDraft();
	draft.groupId = createProviderGroupId();
	return draft;
};
