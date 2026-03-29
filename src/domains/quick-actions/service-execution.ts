import type { ObsidianApiProvider } from 'src/providers/providers.types';
import type { QuickAction } from 'src/types/chat';
import type { AiRuntimeSettings } from 'src/settings/ai-runtime/api';
import { availableVendors } from 'src/settings/ai-runtime/api';
import type { Message, ProviderSettings, Vendor } from 'src/types/provider';
import { buildProviderOptionsWithReasoningDisabled } from 'src/LLMProviders/utils';
import { localInstance } from 'src/i18n/locals';
import { DebugLogger } from 'src/utils/DebugLogger';

export interface QuickActionExecutionResult {
	success: boolean;
	content: string;
	error?: string;
}

function getQuickActionType(quickAction: QuickAction): 'normal' | 'group' {
	if (quickAction.actionType) {
		return quickAction.actionType;
	}
	if (quickAction.isActionGroup) {
		return 'group';
	}
	return 'normal';
}

export class QuickActionExecutionService {
	private currentAbortController: AbortController | null = null;

	constructor(
		private readonly obsidianApi: ObsidianApiProvider,
		private readonly getAiRuntimeSettings: () => AiRuntimeSettings,
		private readonly getPromptTemplateFolder: () => string,
	) {}

	cancelCurrentExecution(): void {
		if (this.currentAbortController) {
			this.currentAbortController.abort();
			this.currentAbortController = null;
		}
	}

	async executeQuickAction(
		quickAction: QuickAction,
		selection: string,
		modelTag?: string,
	): Promise<QuickActionExecutionResult> {
		try {
			if (getQuickActionType(quickAction) === 'group') {
				return {
					success: false,
					content: '',
					error: localInstance.quick_action_group_not_executable,
				};
			}
			return await this.executeNormalQuickAction(quickAction, selection, modelTag);
		} catch (error) {
			DebugLogger.error('[QuickActionExecutionService] 执行操作失败', error);
			return {
				success: false,
				content: '',
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	async resolvePrompt(prompt: string, selection: string): Promise<string> {
		let resolvedPrompt = prompt;
		const templatePattern = /\{\{template:([^}]+)\}\}/g;
		let match: RegExpExecArray | null = null;

		while ((match = templatePattern.exec(prompt)) !== null) {
			const templateName = match[1].trim();
			const templateContent = await this.loadTemplate(templateName);
			resolvedPrompt = resolvedPrompt.replace(match[0], templateContent);
		}

		resolvedPrompt = resolvedPrompt.replace(/\{\{\}\}/g, selection);
		resolvedPrompt = resolvedPrompt.replace(/\{\{@[^}]*\}\}/g, selection);
		return resolvedPrompt;
	}

	async resolvePromptTemplateOnly(prompt: string): Promise<string> {
		let resolvedPrompt = prompt;
		const templatePattern = /\{\{template:([^}]+)\}\}/g;
		let match: RegExpExecArray | null = null;

		while ((match = templatePattern.exec(prompt)) !== null) {
			const templateName = match[1].trim();
			const templateContent = await this.loadTemplate(templateName);
			resolvedPrompt = resolvedPrompt.replace(match[0], templateContent);
		}

		return resolvedPrompt;
	}

	async *executeQuickActionStream(
		quickAction: QuickAction,
		selection: string,
		modelTag?: string,
	): AsyncGenerator<string, void, unknown> {
		if (getQuickActionType(quickAction) === 'group') {
			throw new Error(localInstance.quick_action_group_not_executable);
		}

		try {
			const promptContent = await this.resolvePromptContent(quickAction);
			const providerSettings = this.resolveProviderSettings(
				this.getAiRuntimeSettings(),
				modelTag || quickAction.modelTag,
			);
			if (!providerSettings) {
				throw new Error(localInstance.quick_action_no_model_config);
			}

			const messages = await this.buildMessages(
				quickAction.useDefaultSystemPrompt ?? true,
				promptContent,
				selection,
				quickAction.customPromptRole,
			);
			const vendor = this.getVendor(providerSettings.vendor);
			if (!vendor) {
				throw new Error(
					`${localInstance.quick_action_provider_missing_prefix}: ${providerSettings.vendor}`,
				);
			}

			this.currentAbortController = new AbortController();
			const controller = this.currentAbortController;
			const providerOptions = buildProviderOptionsWithReasoningDisabled(
				providerSettings.options,
				providerSettings.vendor,
			);
			const sendRequest = vendor.sendRequestFunc(providerOptions);
			DebugLogger.logLlmMessages(
				'QuickActionExecutionService.executeQuickActionStream',
				messages,
				{ level: 'debug' },
			);

			const resolveEmbed = async () => new ArrayBuffer(0);
			let preview = '';
			try {
				for await (const chunk of sendRequest(messages, controller, resolveEmbed)) {
					if (controller.signal.aborted) {
						DebugLogger.debug('[QuickActionExecutionService] 操作执行已被取消');
						break;
					}
					if (preview.length < 100) {
						preview = `${preview}${chunk}`.slice(0, 100);
					}
					yield chunk;
				}
				DebugLogger.logLlmResponsePreview(
					'QuickActionExecutionService.executeQuickActionStream',
					preview,
					{ level: 'debug', previewChars: 100 },
				);
			} finally {
				this.currentAbortController = null;
			}
		} catch (error) {
			if (error instanceof Error && error.name === 'AbortError') {
				DebugLogger.debug('[QuickActionExecutionService] 操作执行已取消');
				return;
			}
			DebugLogger.error('[QuickActionExecutionService] 流式执行操作失败', error);
			throw error;
		}
	}

	private async executeNormalQuickAction(
		quickAction: QuickAction,
		selection: string,
		modelTag?: string,
	): Promise<QuickActionExecutionResult> {
		try {
			const promptContent = await this.resolvePromptContent(quickAction);
			const providerSettings = this.resolveProviderSettings(
				this.getAiRuntimeSettings(),
				modelTag || quickAction.modelTag,
			);
			if (!providerSettings) {
				return {
					success: false,
					content: '',
					error: localInstance.quick_action_no_model_config,
				};
			}

			const messages = await this.buildMessages(
				quickAction.useDefaultSystemPrompt ?? true,
				promptContent,
				selection,
				quickAction.customPromptRole,
			);
			const result = await this.callAIWithMessages(providerSettings, messages);
			return { success: true, content: result };
		} catch (error) {
			DebugLogger.error('[QuickActionExecutionService] 执行操作失败', error);
			return {
				success: false,
				content: '',
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	private async resolvePromptContent(quickAction: QuickAction): Promise<string> {
		if (quickAction.promptSource === 'template' && quickAction.templateFile) {
			return await this.loadTemplateFile(quickAction.templateFile);
		}
		return quickAction.prompt;
	}

	private async loadTemplateFile(filePath: string): Promise<string> {
		try {
			return await this.obsidianApi.readVaultFile(filePath);
		} catch (error) {
			DebugLogger.warn(
				`[QuickActionExecutionService] 读取模板文件失败: ${filePath}`,
				error,
			);
			throw new Error(`${localInstance.quick_action_template_read_failed_prefix}: ${filePath}`);
		}
	}

	private async loadTemplate(templateName: string): Promise<string> {
		const templateFolder = this.getPromptTemplateFolder();
		const possiblePaths = [
			`${templateFolder}/${templateName}`,
			`${templateFolder}/${templateName}.md`,
			templateName,
			`${templateName}.md`,
		];

		for (const path of possiblePaths) {
			try {
				return await this.obsidianApi.readVaultFile(path);
			} catch (error) {
				DebugLogger.warn(
					`[QuickActionExecutionService] 读取模板文件失败: ${path}`,
					error,
				);
			}
		}

		DebugLogger.warn(`[QuickActionExecutionService] 未找到模板文件: ${templateName}`);
		return `[${localInstance.quick_action_template_missing_prefix}: ${templateName}]`;
	}

	private resolveProviderSettings(
		aiRuntimeSettings: AiRuntimeSettings,
		modelTag?: string,
	): ProviderSettings | null {
		const providers = aiRuntimeSettings.providers;
		if (providers.length === 0) {
			return null;
		}
		if (modelTag) {
			const provider = providers.find((item) => item.tag === modelTag);
			if (provider) {
				return provider;
			}
		}
		return providers[0];
	}

	private getVendor(vendorName: string): Vendor | undefined {
		return availableVendors.find((vendor) => vendor.name === vendorName);
	}

	private async buildMessages(
		useDefaultSystemPrompt: boolean,
		promptContent: string,
		selection: string,
		customPromptRole?: 'system' | 'user',
	): Promise<Message[]> {
		const messages: Message[] = [];

		if (useDefaultSystemPrompt) {
			const globalSystemPrompt = (
				await this.obsidianApi.buildGlobalSystemPrompt('selection_toolbar')
			).trim();
			if (globalSystemPrompt.length > 0) {
				messages.push({ role: 'system', content: globalSystemPrompt });
			}
			messages.push({
				role: 'user',
				content: await this.resolvePrompt(promptContent, selection),
			});
			return messages;
		}

		const promptRole = customPromptRole ?? 'system';
		if (promptRole === 'system') {
			let processedPrompt = await this.resolvePromptTemplateOnly(promptContent);
			processedPrompt = processedPrompt.replace(/\{\{\}\}/g, '<用户消息内容>');
			processedPrompt = processedPrompt.replace(/\{\{@[^}]*\}\}/g, '<用户消息内容>');
			messages.push({ role: 'system', content: processedPrompt });
			messages.push({ role: 'user', content: selection });
			return messages;
		}

		messages.push({
			role: 'user',
			content: await this.resolvePrompt(promptContent, selection),
		});
		return messages;
	}

	private async callAIWithMessages(
		providerSettings: ProviderSettings,
		messages: Message[],
	): Promise<string> {
		const vendor = this.getVendor(providerSettings.vendor);
		if (!vendor) {
			throw new Error(
				`${localInstance.quick_action_provider_missing_prefix}: ${providerSettings.vendor}`,
			);
		}

		this.currentAbortController = new AbortController();
		const controller = this.currentAbortController;
		const providerOptions = buildProviderOptionsWithReasoningDisabled(
			providerSettings.options,
			providerSettings.vendor,
		);
		const sendRequest = vendor.sendRequestFunc(providerOptions);
		DebugLogger.logLlmMessages('QuickActionExecutionService.callAIWithMessages', messages, {
			level: 'debug',
		});

		const resolveEmbed = async () => new ArrayBuffer(0);
		try {
			let result = '';
			for await (const chunk of sendRequest(messages, controller, resolveEmbed)) {
				if (controller.signal.aborted) {
					break;
				}
				result += chunk;
			}
			DebugLogger.logLlmResponsePreview(
				'QuickActionExecutionService.callAIWithMessages',
				result,
				{ level: 'debug', previewChars: 100 },
			);
			return result;
		} finally {
			this.currentAbortController = null;
		}
	}
}
