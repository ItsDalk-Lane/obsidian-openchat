import { App, Notice, Setting } from 'obsidian';
import { SelectModelModal } from 'src/components/modals/AiRuntimeProviderModals';
import { ollamaVendor } from 'src/LLMProviders/ollama';
import { t } from 'src/i18n/ai-runtime/helper';
import { availableVendors } from 'src/settings/ai-runtime';
import type { BaseOptions, ProviderSettings, Vendor } from 'src/types/provider';
import {
	createProviderGroupId,
	getProviderModelDisplayName,
	mergeProviderParametersWithMetadata,
} from 'src/utils/aiProviderMetadata';
import {
	MODEL_FETCH_CONFIGS,
	fetchModels,
	fetchOllamaLocalModels,
} from './providerUtils';
import type { ProviderGroupConfigModalParams } from './ProviderGroupConfigModal';
import {
	modelHasSettings,
	openModelSettingsModal,
	openParametersModal,
} from './ProviderGroupConfigModalSettings';
import {
	type ProviderGroupDraft,
	type ProviderModelDraft,
} from './providerGroupAdapter';

type ModelFetchOptions = BaseOptions & { apiSecret?: string };

type ProviderGroupConfigControllerOptions = {
	app: App;
	params: ProviderGroupConfigModalParams;
	getConfigContainer: () => HTMLElement;
	getDraft: () => ProviderGroupDraft;
	getSelectedVendor: () => Vendor | undefined;
	isCustomMode: () => boolean;
	render: () => void;
};

const DEFAULT_CONTEXT_LENGTH = 128000;
const cloneValue = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export class ProviderGroupConfigModalController {
	private modelSuggestionCache: string[] | null = null;
	private modelSuggestionCacheKey: string | null = null;
	private rawModelById: Record<string, unknown> | undefined;

	constructor(private readonly options: ProviderGroupConfigControllerOptions) {}

	private get app(): App {
		return this.options.app;
	}

	private get params(): ProviderGroupConfigModalParams {
		return this.options.params;
	}

	private get configContainer(): HTMLElement {
		return this.options.getConfigContainer();
	}

	private get draft(): ProviderGroupDraft {
		return this.options.getDraft();
	}

	private get selectedVendor(): Vendor | undefined {
		return this.options.getSelectedVendor();
	}

	private get isCustomMode(): boolean {
		return this.options.isCustomMode();
	}

	invalidateModelSuggestionCache(): void {
		this.modelSuggestionCache = null;
		this.modelSuggestionCacheKey = null;
		this.rawModelById = undefined;
	}

	applyVendorDefaults(vendorName: string): void {
		const vendor = availableVendors.find((item) => item.name === vendorName);
		if (!vendor) {
			return;
		}
		this.draft.baseURL = vendor.defaultOptions.baseURL;
		this.draft.apiKey = this.isCustomMode ? '' : this.params.getVendorApiKey(vendor.name);
		this.draft.contextLength = typeof vendor.defaultOptions.contextLength === 'number'
			? vendor.defaultOptions.contextLength
			: DEFAULT_CONTEXT_LENGTH;
		this.invalidateModelSuggestionCache();
		if (!this.draft.baseTag) {
			this.draft.baseTag = vendor.name;
		}
	}

	renderModelToolbarRow(): void {
		const setting = new Setting(this.configContainer).setName(t('Model'));
		setting.settingEl.addClass('provider-group-toolbar-row');
		setting.addButton((btn) => {
			btn.setButtonText(t('Test now')).onClick(async () => {
				const provider = await this.resolveProviderForTesting();
				if (!provider) {
					new Notice(
						this.draft.models.length > 0
							? t('Please select a model to test')
							: t('Please add a model first')
					);
					return;
				}
				await this.params.testProviderConfiguration(provider);
			});
			this.decorateToolbarButton(btn.buttonEl);
		});
		setting.addButton((btn) => {
			btn.setButtonText(t('Additional parameters')).onClick(() => {
				openParametersModal({ app: this.app, draft: this.draft });
			});
			this.decorateToolbarButton(btn.buttonEl);
		});
		if (!this.isCustomMode) {
			setting.addButton((btn) => {
				btn.setButtonText(t('Probe reasoning capability')).onClick(async () => {
					const provider = this.createActiveProvider();
					const vendor = this.selectedVendor;
					if (!provider || !vendor) {
						new Notice(t('Please add a model first'));
						return;
					}
					await this.params.probeReasoningCapability(provider, vendor);
				});
				this.decorateToolbarButton(btn.buttonEl);
			});
		}
	}

	renderModelList(): void {
		if (this.draft.models.length === 0) {
			this.configContainer.createDiv({
				cls: 'provider-group-empty-state',
				text: t('No models added yet'),
			});
			return;
		}

		for (const modelDraft of this.draft.models) {
			this.renderModelRow(modelDraft);
		}
	}

	renderAddModelButton(): void {
		const setting = new Setting(this.configContainer);
		setting.settingEl.addClass('provider-group-add-model-row');
		setting.addButton((btn) => {
			btn
				.setButtonText(t('Add model'))
				.onClick(() => {
					const vendor = this.selectedVendor;
					if (!vendor) {
						new Notice(t('Please select an AI provider first'));
						return;
					}
					const nextOptions = cloneValue(vendor.defaultOptions);
					nextOptions.baseURL = this.draft.baseURL || vendor.defaultOptions.baseURL;
					nextOptions.apiKey = this.draft.apiKey;
					nextOptions.contextLength = this.draft.contextLength;
					nextOptions.parameters = {};
					const draftModel: ProviderModelDraft = {
						id: createProviderGroupId(),
						tag: '',
						options: nextOptions,
					};
					this.draft.models = [...this.draft.models, draftModel];
					this.draft.activeModelId = draftModel.id;
					this.options.render();
				});
			this.decorateBorderlessButton(btn.buttonEl, 'provider-group-add-model-button');
		});
	}

	private decorateBorderlessButton(buttonEl: HTMLButtonElement, className: string): void {
		buttonEl.addClass('provider-group-borderless-button');
		buttonEl.addClass(className);
	}

	private decorateIconButton(buttonEl: HTMLButtonElement): void {
		this.decorateBorderlessButton(buttonEl, 'provider-group-icon-button');
	}

	private decorateToolbarButton(buttonEl: HTMLButtonElement): void {
		this.decorateBorderlessButton(buttonEl, 'provider-group-toolbar-button');
	}

	private renderModelRow(modelDraft: ProviderModelDraft): void {
		const vendor = this.selectedVendor;
		if (!vendor) {
			return;
		}

		const modelName = modelDraft.options.model ?? '';
		let buttonComponent: HTMLButtonElement | null = null;
		let textInputComponent: HTMLInputElement | null = null;
		let switchToCustomButtonEl: HTMLElement | null = null;
		let switchToSelectButtonEl: HTMLElement | null = null;

		const setting = new Setting(this.configContainer);
		setting.settingEl.addClass('provider-group-model-row');
		setting.addButton((btn) => {
			buttonComponent = btn.buttonEl;
			btn
				.setButtonText(modelName || t('Select the model to use'))
				.onClick(async () => {
					this.draft.activeModelId = modelDraft.id;
					await this.openModelPicker(modelDraft);
				});
			btn.buttonEl.addClass('provider-group-model-select-button');
		});
		setting.addText((text) => {
			textInputComponent = text.inputEl;
			text
				.setPlaceholder(t('Enter custom model name'))
				.setValue(modelName)
				.onChange((value) => {
					modelDraft.options.model = value.trim();
					if (buttonComponent) {
						buttonComponent.textContent = value.trim() || t('Select the model to use');
					}
				});
			textInputComponent.classList.add('provider-group-model-input');
			textInputComponent.style.display = 'none';
		});
		setting.addButton((btn) => {
			btn
				.setIcon('sliders-horizontal')
				.setTooltip(t('Settings'))
				.setDisabled(!modelHasSettings(vendor.name, modelDraft))
				.onClick(() => {
					this.draft.activeModelId = modelDraft.id;
					openModelSettingsModal({
						app: this.app,
						vendor,
						modelDraft,
					});
				});
			this.decorateIconButton(btn.buttonEl);
		});
		setting.addButton((btn) => {
			switchToCustomButtonEl = btn.buttonEl;
			btn
				.setIcon('pencil')
				.setTooltip(t('Switch to custom input'))
				.onClick(() => {
					if (buttonComponent) {
						buttonComponent.style.display = 'none';
					}
					if (textInputComponent) {
						textInputComponent.style.display = 'inline-block';
						textInputComponent.value = modelDraft.options.model || '';
						textInputComponent.focus();
					}
					if (switchToCustomButtonEl) {
						switchToCustomButtonEl.style.display = 'none';
					}
					if (switchToSelectButtonEl) {
						switchToSelectButtonEl.style.display = 'inline-flex';
					}
				});
			this.decorateIconButton(btn.buttonEl);
		});
		setting.addButton((btn) => {
			switchToSelectButtonEl = btn.buttonEl;
			btn
				.setIcon('undo-2')
				.setTooltip(t('Switch to model selection'))
				.onClick(() => {
					if (buttonComponent) {
						buttonComponent.style.display = 'inline-flex';
					}
					if (textInputComponent) {
						textInputComponent.style.display = 'none';
					}
					if (switchToCustomButtonEl) {
						switchToCustomButtonEl.style.display = 'inline-flex';
					}
					if (switchToSelectButtonEl) {
						switchToSelectButtonEl.style.display = 'none';
					}
				});
			btn.buttonEl.style.display = 'none';
			this.decorateIconButton(btn.buttonEl);
		});
		setting.addButton((btn) => {
			btn
				.setIcon('trash-2')
				.setTooltip(t('Delete provider'))
				.onClick(() => {
					this.draft.models = this.draft.models.filter((item) => item.id !== modelDraft.id);
					if (this.draft.activeModelId === modelDraft.id) {
						this.draft.activeModelId = this.draft.models[0]?.id;
					}
					this.options.render();
				});
			this.decorateIconButton(btn.buttonEl);
		});
	}

	private getModelSuggestionCacheKey(vendor: Vendor, options: ModelFetchOptions): string {
		return JSON.stringify({
			vendor: vendor.name,
			source: this.draft.source,
			protocolVendorName: this.draft.protocolVendorName,
			baseURL: String(options.baseURL ?? ''),
			apiKey: String(options.apiKey ?? ''),
		});
	}

	private async getModelSuggestions(): Promise<string[]> {
		const vendor = this.selectedVendor;
		if (!vendor) {
			return [];
		}
		const options = {
			...cloneValue(vendor.defaultOptions),
			apiKey: this.isCustomMode
				? this.draft.apiKey
				: this.params.getVendorApiKey(vendor.name),
			baseURL: this.draft.baseURL || vendor.defaultOptions.baseURL,
		} as ModelFetchOptions;
		const cacheKey = this.getModelSuggestionCacheKey(vendor, options);
		if (this.modelSuggestionCache && this.modelSuggestionCacheKey === cacheKey) {
			return this.modelSuggestionCache;
		}

		if (vendor.name === ollamaVendor.name) {
			this.modelSuggestionCache = await fetchOllamaLocalModels(this.draft.baseURL || vendor.defaultOptions.baseURL);
			this.modelSuggestionCacheKey = cacheKey;
			return this.modelSuggestionCache;
		}
		const modelConfig = MODEL_FETCH_CONFIGS[vendor.name as keyof typeof MODEL_FETCH_CONFIGS];
		if (!modelConfig) {
			this.modelSuggestionCache = [...vendor.models];
			this.modelSuggestionCacheKey = cacheKey;
			return this.modelSuggestionCache;
		}
		if (modelConfig.requiresApiKey && !options.apiKey) {
			new Notice(t('Please input API key first'));
			this.modelSuggestionCache = [...modelConfig.fallbackModels];
			this.modelSuggestionCacheKey = cacheKey;
			return this.modelSuggestionCache;
		}
		const result = await fetchModels(modelConfig, options);
		this.modelSuggestionCache = result.models;
		this.modelSuggestionCacheKey = cacheKey;
		this.rawModelById = result.rawModelById;
		return this.modelSuggestionCache;
	}

	private async openModelPicker(modelDraft: ProviderModelDraft): Promise<void> {
		const models = await this.getModelSuggestions();
		new SelectModelModal(this.app, models, (selectedModel) => {
			this.applySelectedModel(modelDraft, selectedModel);
			this.options.render();
		}).open();
	}

	private applySelectedModel(modelDraft: ProviderModelDraft, modelName: string): void {
		modelDraft.options.model = modelName;
		if (!modelDraft.tag) {
			modelDraft.tag = '';
		}
		const rawModel = this.rawModelById?.[modelName];
		if (rawModel) {
			void rawModel;
		}
	}

	private createProviderFromModelDraft(
		modelDraft: ProviderModelDraft,
		vendor: Vendor
	): ProviderSettings | undefined {
		if (!modelDraft.options.model) {
			return undefined;
		}
		return {
			tag: modelDraft.tag || `${vendor.name}-${modelDraft.options.model}`,
			vendor: vendor.name,
			options: {
				...cloneValue(modelDraft.options),
				apiKey: this.isCustomMode ? this.draft.apiKey : this.params.getVendorApiKey(vendor.name),
				baseURL: this.draft.baseURL,
				contextLength: this.draft.contextLength,
				parameters: mergeProviderParametersWithMetadata(cloneValue(this.draft.parameters), {
					groupId: this.draft.groupId,
					baseTag: this.draft.baseTag,
					source: this.draft.source,
				}),
			},
		};
	}

	private getSelectableTestProviders(vendor: Vendor): Array<{
		modelId: string;
		label: string;
		provider: ProviderSettings;
	}> {
		const providers = this.draft.models
			.map((modelDraft) => ({
				modelId: modelDraft.id,
				provider: this.createProviderFromModelDraft(modelDraft, vendor),
			}))
			.filter((item): item is { modelId: string; provider: ProviderSettings } => Boolean(item.provider));
		return providers.map((item, index) => {
			const baseLabel = getProviderModelDisplayName(
				item.provider,
				providers.map((providerItem) => providerItem.provider)
			);
			const duplicateCount = providers.filter((providerItem) => providerItem.provider.options.model === item.provider.options.model).length;
			return {
				...item,
				label: duplicateCount > 1 ? `${baseLabel} (${index + 1})` : baseLabel,
			};
		});
	}

	private async resolveProviderForTesting(): Promise<ProviderSettings | undefined> {
		const vendor = this.selectedVendor;
		if (!vendor) {
			return undefined;
		}
		const selectableProviders = this.getSelectableTestProviders(vendor);
		if (selectableProviders.length === 0) {
			return undefined;
		}
		if (selectableProviders.length === 1) {
			this.draft.activeModelId = selectableProviders[0].modelId;
			return selectableProviders[0].provider;
		}
		return await new Promise<ProviderSettings | undefined>((resolve) => {
			new SelectModelModal(
				this.app,
				selectableProviders.map((item) => item.label),
				(selectedLabel) => {
					const selected = selectableProviders.find((item) => item.label === selectedLabel);
					if (selected) {
						this.draft.activeModelId = selected.modelId;
					}
					resolve(selected?.provider);
				}
			).open();
		});
	}

	private createActiveProvider(): ProviderSettings | undefined {
		const vendor = this.selectedVendor;
		const activeModel = this.draft.models.find((item) => item.id === this.draft.activeModelId) ?? this.draft.models[0];
		return vendor && activeModel ? this.createProviderFromModelDraft(activeModel, vendor) : undefined;
	}
}
