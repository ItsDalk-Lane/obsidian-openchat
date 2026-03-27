import { App, Modal, Notice, Setting } from 'obsidian';
import {
	DEFAULT_DOUBAO_THINKING_TYPE,
	DOUBAO_REASONING_EFFORT_OPTIONS,
	type DoubaoOptions,
	type DoubaoReasoningEffort,
	type DoubaoThinkingType,
	doubaoVendor,
} from 'src/LLMProviders/doubao';
import { type DoubaoImageOptions, isDoubaoImageGenerationModel } from 'src/LLMProviders/doubaoImage';
import { gptImageVendor, type GptImageOptions } from 'src/LLMProviders/gptImage';
import { isImageGenerationModel, openRouterVendor, type OpenRouterOptions } from 'src/LLMProviders/openRouter';
import {
	qianFanIsImageGenerationModel,
	qianFanVendor,
	type QianFanOptions,
} from 'src/LLMProviders/qianFan';
import { qwenVendor } from 'src/LLMProviders/qwen';
import {
	DEFAULT_ZHIPU_THINKING_TYPE,
	type ZhipuOptions,
	type ZhipuThinkingType,
	zhipuVendor,
} from 'src/LLMProviders/zhipu';
import { t } from 'src/i18n/ai-runtime/helper';
import { availableVendors } from 'src/settings/ai-runtime';
import type { BaseOptions, Vendor } from 'src/types/provider';
import { ensureDoubaoImageDefaults, renderDoubaoImageSections } from './doubaoSections';
import { addGptImageSections } from './providerGeneralSections';
import {
	renderOpenRouterImageGenerationSections,
	renderOpenRouterWebSearchSections,
} from './openRouterSections';
import type { ProviderGroupDraft, ProviderModelDraft } from './providerGroupAdapter';

type ToggleOption<T extends string> = {
	value: T;
	label: string;
};

const DEFAULT_CONTEXT_LENGTH = 128000;

const isModelImageGeneration = (vendorName: string, modelName: string): boolean => {
	if (vendorName === gptImageVendor.name) return true;
	if (vendorName === openRouterVendor.name) return isImageGenerationModel(modelName);
	if (vendorName === doubaoVendor.name) return isDoubaoImageGenerationModel(modelName);
	if (vendorName === qianFanVendor.name) return qianFanIsImageGenerationModel(modelName);
	return false;
};

const vendorSupportsStructuredOutput = (vendorName: string): boolean => {
	const vendor = availableVendors.find((item) => item.name === vendorName);
	return vendor?.capabilities.includes('Structured Output') ?? false;
};

class SettingsSubModal extends Modal {
	constructor(
		app: App,
		private readonly modalTitle: string,
		private readonly renderContent: (container: HTMLElement) => void
	) {
		super(app);
	}

	onOpen() {
		this.modalEl.addClass('provider-group-settings-submodal');
		this.titleEl.setText(this.modalTitle);
		this.contentEl.style.maxHeight = '70vh';
		this.contentEl.style.overflowY = 'auto';
		this.contentEl.style.padding = '16px';
		const container = this.contentEl.createDiv({ cls: 'provider-group-settings-content' });
		this.renderContent(container);
	}

	onClose() {
		this.modalEl.removeClass('provider-group-settings-submodal');
		this.contentEl.empty();
	}
}

const isThinkingToggleVendor = (vendorName: string): boolean =>
	vendorName === qwenVendor.name || vendorName === qianFanVendor.name;

const supportsReasoningEffort = (vendorName: string): boolean =>
	vendorName === doubaoVendor.name || vendorName === openRouterVendor.name;

const supportsThinkingType = (vendorName: string): boolean =>
	vendorName === doubaoVendor.name || vendorName === zhipuVendor.name;

const vendorSupportsWebSearch = (vendorName: string): boolean => {
	const vendor = availableVendors.find((item) => item.name === vendorName);
	return vendor?.capabilities.includes('Web Search') ?? false;
};

const vendorSupportsReasoning = (vendorName: string): boolean => {
	const vendor = availableVendors.find((item) => item.name === vendorName);
	return vendor?.capabilities.includes('Reasoning') ?? false;
};

const addDropdownSetting = <T extends string>(
	container: HTMLElement,
	name: string,
	description: string,
	value: T,
	options: Array<ToggleOption<T>>,
	onChange: (value: T) => void,
	disabled = false
): void => {
	new Setting(container)
		.setName(name)
		.setDesc(description)
		.addDropdown((dropdown) => {
			for (const option of options) {
				dropdown.addOption(option.value, option.label);
			}
			dropdown.setValue(value);
			dropdown.setDisabled(disabled);
			dropdown.selectEl.addClass('provider-group-setting-dropdown');
			dropdown.onChange((nextValue) => {
				onChange(nextValue as T);
			});
		});
};

const addToggleSetting = (
	container: HTMLElement,
	name: string,
	description: string,
	value: boolean,
	onChange: (value: boolean) => void
): void => {
	new Setting(container)
		.setName(name)
		.setDesc(description)
		.addToggle((toggle) =>
			toggle.setValue(value).onChange((nextValue) => {
				onChange(nextValue);
			})
		);
};

const renderReasoningSettings = (
	container: HTMLElement,
	vendorName: string,
	modelDraft: ProviderModelDraft
): void => {
	if (supportsThinkingType(vendorName)) {
		if (vendorName === doubaoVendor.name) {
			const options = modelDraft.options as DoubaoOptions;
			const thinkingType = options.thinkingType ?? DEFAULT_DOUBAO_THINKING_TYPE;
			addDropdownSetting<DoubaoThinkingType>(
				container,
				t('Doubao thinking mode'),
				t('Control whether the Doubao model performs deep thinking before answering.'),
				thinkingType,
				[
					{ value: 'enabled', label: t('Enabled') },
					{ value: 'auto', label: t('Auto') },
					{ value: 'disabled', label: t('Disabled') },
				],
				(value) => {
					options.thinkingType = value;
					if (value === 'disabled') {
						options.reasoningEffort = 'minimal';
					}
				}
			);
			addDropdownSetting<DoubaoReasoningEffort>(
				container,
				t('Reasoning effort'),
				t('Adjust how long the model thinks before answering. Only available when deep thinking is enabled.'),
				options.reasoningEffort ?? 'low',
				DOUBAO_REASONING_EFFORT_OPTIONS.map((value) => ({
					value,
					label: value === 'minimal'
						? t('Minimal')
						: value === 'low'
							? t('Low')
							: value === 'medium'
								? t('Medium (recommended)')
								: t('High'),
				})),
				(value) => {
					options.reasoningEffort = value;
				}
			);
			return;
		}

		if (vendorName === zhipuVendor.name) {
			const options = modelDraft.options as ZhipuOptions;
			const current = options.thinkingType ?? DEFAULT_ZHIPU_THINKING_TYPE;
			addDropdownSetting<ZhipuThinkingType>(
				container,
				t('Zhipu thinking type'),
				t('Zhipu thinking type description'),
				current,
				[
					{ value: 'enabled', label: t('Enabled') },
					{ value: 'auto', label: t('Auto') },
					{ value: 'disabled', label: t('Disabled') },
				],
				(value) => {
					options.thinkingType = value;
					options.enableReasoning = value !== 'disabled';
				}
			);
		}
		return;
	}

	if (supportsReasoningEffort(vendorName) && vendorName === openRouterVendor.name) {
		const options = modelDraft.options as OpenRouterOptions;
		addToggleSetting(
			container,
			t('Enable reasoning feature'),
			t('Enable reasoning feature description'),
			options.enableReasoning ?? false,
			(value) => {
				options.enableReasoning = value;
			}
		);
		addDropdownSetting<NonNullable<OpenRouterOptions['reasoningEffort']>>(
			container,
			t('Reasoning effort'),
			t('OpenRouter reasoning effort description'),
			options.reasoningEffort ?? 'medium',
			[
				{ value: 'minimal', label: t('Minimal') },
				{ value: 'low', label: t('Low') },
				{ value: 'medium', label: t('Medium (recommended)') },
				{ value: 'high', label: t('High') },
			],
			(value) => {
				options.reasoningEffort = value;
			}
		);
		return;
	}

	if (isThinkingToggleVendor(vendorName)) {
		const options = modelDraft.options as BaseOptions & { enableThinking?: boolean };
		addToggleSetting(
			container,
			t('Enable reasoning feature'),
			t('Enable reasoning feature description'),
			options.enableThinking ?? false,
			(value) => {
				options.enableThinking = value;
			}
		);
		return;
	}

	const options = modelDraft.options as BaseOptions & { enableReasoning?: boolean };
	addToggleSetting(
		container,
		t('Enable reasoning feature'),
		t('Enable reasoning feature description'),
		options.enableReasoning ?? false,
		(value) => {
			options.enableReasoning = value;
		}
	);
};

const renderWebSearchSettings = (
	container: HTMLElement,
	vendorName: string,
	modelDraft: ProviderModelDraft
): void => {
	const options = modelDraft.options as BaseOptions;
	addToggleSetting(
		container,
		t('Web search'),
		t('Enable web search for AI'),
		options.enableWebSearch ?? false,
		(value) => {
			options.enableWebSearch = value;
		}
	);

	if (vendorName === openRouterVendor.name) {
		renderOpenRouterWebSearchSections(container, modelDraft.options as OpenRouterOptions, {
			saveSettings: async () => undefined,
		});
	}
};

const renderImageSettingsSections = (
	container: HTMLElement,
	vendorName: string,
	modelDraft: ProviderModelDraft
): void => {
	const context = { saveSettings: async () => undefined };
	if (vendorName === openRouterVendor.name) {
		renderOpenRouterImageGenerationSections(container, modelDraft.options as OpenRouterOptions, context);
		return;
	}
	if (vendorName === gptImageVendor.name) {
		addGptImageSections({
			details: container,
			options: modelDraft.options as GptImageOptions,
			saveSettings: async () => undefined,
		});
		return;
	}
	if (vendorName === doubaoVendor.name) {
		const options = modelDraft.options as DoubaoOptions & Partial<DoubaoImageOptions>;
		ensureDoubaoImageDefaults(options);
		renderDoubaoImageSections(container, options as DoubaoImageOptions, context);
		return;
	}
	if (vendorName === qianFanVendor.name) {
		const options = modelDraft.options as QianFanOptions;
		addDropdownSetting<NonNullable<QianFanOptions['imageResponseFormat']>>(
			container,
			t('Image response format'),
			t('Image response format description qianfan'),
			options.imageResponseFormat ?? 'b64_json',
			[
				{ value: 'b64_json', label: t('Base64 JSON (recommended)') },
				{ value: 'url', label: 'URL' },
			],
			(value) => {
				options.imageResponseFormat = value;
			}
		);
		new Setting(container)
			.setName(t('Images per request'))
			.setDesc(t('Images per request description'))
			.addSlider((slider) =>
				slider
					.setLimits(1, 4, 1)
					.setValue(options.imageCount ?? 1)
					.setDynamicTooltip()
					.onChange((value) => {
						options.imageCount = value;
					})
			);
		new Setting(container)
			.setName(t('Image Display Width'))
			.setDesc(t('Image display width description attachment only'))
			.addSlider((slider) =>
				slider
					.setLimits(200, 800, 50)
					.setValue(options.imageDisplayWidth ?? 400)
					.setDynamicTooltip()
					.onChange((value) => {
						options.imageDisplayWidth = value;
					})
			);
	}
};

const renderContextLengthSetting = (
	container: HTMLElement,
	modelDraft: ProviderModelDraft
): void => {
	new Setting(container)
		.setName(t('Context length'))
		.setDesc(t('Context length description'))
		.addText((text) => {
			text.inputEl.type = 'number';
			text
				.setPlaceholder(String(DEFAULT_CONTEXT_LENGTH))
				.setValue(String(modelDraft.options.contextLength ?? DEFAULT_CONTEXT_LENGTH))
				.onChange((value) => {
					const parsed = Number.parseInt(value, 10);
					modelDraft.options.contextLength =
						Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_CONTEXT_LENGTH;
				});
		});
};

const renderStructuredOutputSetting = (
	container: HTMLElement,
	modelDraft: ProviderModelDraft
): void => {
	addToggleSetting(
		container,
		t('Structured output'),
		t('Structured output description'),
		modelDraft.options.enableStructuredOutput ?? false,
		(value) => {
			modelDraft.options.enableStructuredOutput = value;
		}
	);
};

const shouldShowImageSettingsButton = (vendorName: string, modelName: string): boolean => {
	if (!modelName) {
		return false;
	}
	if (vendorName === gptImageVendor.name) {
		return true;
	}
	if (vendorName === openRouterVendor.name) {
		return isImageGenerationModel(modelName);
	}
	if (vendorName === doubaoVendor.name) {
		return modelName.toLowerCase().includes('seedream') || modelName.toLowerCase().includes('-t2i');
	}
	if (vendorName === qianFanVendor.name) {
		return qianFanIsImageGenerationModel(modelName);
	}
	return false;
};

export const modelHasSettings = (vendorName: string, modelDraft: ProviderModelDraft): boolean => {
	// 所有模型都需要上下文长度设置
	return true;
};

export const openModelSettingsModal = (args: {
	app: App;
	vendor: Vendor;
	modelDraft: ProviderModelDraft;
}): void => {
	new SettingsSubModal(
		args.app,
		args.modelDraft.options.model
			? `${args.modelDraft.options.model} · ${t('Settings')}`
			: t('Settings'),
		(container) => {
			const modelName = args.modelDraft.options.model ?? '';
			const isImageModel = isModelImageGeneration(args.vendor.name, modelName);
			if (!isImageModel) {
				renderContextLengthSetting(container, args.modelDraft);
			} else {
				delete args.modelDraft.options.contextLength;
			}
			if (vendorSupportsReasoning(args.vendor.name) && !isImageModel) {
				renderReasoningSettings(container, args.vendor.name, args.modelDraft);
			}
			if (
				vendorSupportsStructuredOutput(args.vendor.name)
				&& !isImageModel
			) {
				renderStructuredOutputSetting(container, args.modelDraft);
			}
			if (
				vendorSupportsWebSearch(args.vendor.name)
				&& !(args.vendor.name === openRouterVendor.name && isImageGenerationModel(args.modelDraft.options.model ?? ''))
			) {
				renderWebSearchSettings(container, args.vendor.name, args.modelDraft);
			}
			if (shouldShowImageSettingsButton(args.vendor.name, args.modelDraft.options.model ?? '')) {
				renderImageSettingsSections(container, args.vendor.name, args.modelDraft);
			}
		}
	).open();
};

export const openParametersModal = (args: {
	app: App;
	draft: ProviderGroupDraft;
}): void => {
	const modal = new SettingsSubModal(args.app, t('Additional parameters'), (container) => {
		container.createEl('div', {
			cls: 'provider-group-parameters-hint',
			text: t('Additional parameters modal hint'),
		});
		const textarea = container.createEl('textarea', { cls: 'provider-group-parameters-textarea' });
		textarea.placeholder = t('Additional parameters modal placeholder');
		textarea.value = Object.keys(args.draft.parameters).length > 0
			? JSON.stringify(args.draft.parameters, null, 2)
			: '';
		const footer = container.createDiv({ cls: 'provider-group-submodal-footer' });
		const saveButton = footer.createEl('button', {
			cls: 'mod-cta provider-group-borderless-button provider-group-toolbar-button',
			text: t('Save'),
		});
		saveButton.type = 'button';
		saveButton.addEventListener('click', () => {
			try {
				const trimmed = textarea.value.trim();
				if (!trimmed) {
					args.draft.parameters = {};
					modal.close();
					return;
				}
				const parsed = JSON.parse(trimmed) as Record<string, unknown>;
				if (Object.prototype.hasOwnProperty.call(parsed, 'model')) {
					new Notice(t('Please set model in the Model field above, not here'));
					return;
				}
				args.draft.parameters = parsed;
				modal.close();
			} catch {
				new Notice(t('Invalid JSON format'));
			}
		});
	});
	modal.open();
};