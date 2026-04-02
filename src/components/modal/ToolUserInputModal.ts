import { App, Modal } from 'obsidian';
import type {
	ToolUserInputOption,
	ToolUserInputRequest,
	ToolUserInputResponse,
} from 'src/types/tool';

const renderOptionDescription = (
	container: HTMLElement,
	option: ToolUserInputOption,
): void => {
	if (!option.description) {
		return;
	}
	container.createDiv({
		text: option.description,
		cls: 'mod-muted',
	});
};

class ToolUserInputModal extends Modal {
	private result: ToolUserInputResponse = { outcome: 'cancelled' };
	private settled = false;

	constructor(
		app: App,
		private readonly request: ToolUserInputRequest,
		private readonly resolveResult: (result: ToolUserInputResponse) => void,
	) {
		super(app);
	}

	onOpen(): void {
		this.setTitle('需要你的输入');
		this.renderQuestion();
		this.renderOptions();
		this.renderFreeText();
		this.renderCancelButton();
	}

	onClose(): void {
		this.contentEl.empty();
		if (this.settled) {
			return;
		}
		this.settled = true;
		this.resolveResult(this.result);
	}

	private renderQuestion(): void {
		this.contentEl.createEl('p', {
			text: this.request.question,
		});
	}

	private renderOptions(): void {
		if (!this.request.options || this.request.options.length === 0) {
			return;
		}
		const section = this.contentEl.createDiv();
		section.createEl('h4', { text: '可选项' });
		for (const option of this.request.options) {
			this.renderOption(section, option);
		}
	}

	private renderOption(
		container: HTMLElement,
		option: ToolUserInputOption,
	): void {
		const row = container.createDiv();
		const button = row.createEl('button', {
			text: option.label,
			cls: 'mod-cta',
		});
		button.addEventListener('click', () => {
			this.result = {
				outcome: 'selected',
				selectedValue: option.value,
			};
			this.close();
		});
		renderOptionDescription(row, option);
	}

	private renderFreeText(): void {
		if (!this.request.allowFreeText) {
			return;
		}
		const section = this.contentEl.createDiv();
		section.createEl('h4', {
			text: this.request.options?.length ? '或输入自定义回答' : '输入回答',
		});
		const textarea = section.createEl('textarea');
		textarea.rows = 4;
		textarea.style.width = '100%';
		const submit = section.createEl('button', {
			text: '提交回答',
			cls: 'mod-cta',
		});
		const updateDisabled = () => {
			submit.toggleAttribute('disabled', textarea.value.trim().length === 0);
		};
		textarea.addEventListener('input', updateDisabled);
		submit.addEventListener('click', () => {
			const freeText = textarea.value.trim();
			if (!freeText) {
				return;
			}
			this.result = {
				outcome: 'free-text',
				freeText,
			};
			this.close();
		});
		updateDisabled();
		setTimeout(() => textarea.focus(), 0);
	}

	private renderCancelButton(): void {
		const footer = this.contentEl.createDiv();
		const cancel = footer.createEl('button', {
			text: '取消',
		});
		cancel.addEventListener('click', () => {
			this.close();
		});
	}
}

export const requestToolUserInputViaModal = async (
	app: App,
	request: ToolUserInputRequest,
): Promise<ToolUserInputResponse> => {
	return await new Promise((resolve) => {
		const modal = new ToolUserInputModal(app, request, resolve);
		modal.open();
	});
};
