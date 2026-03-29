import type { SystemPromptPort, VaultReadPort } from 'src/providers/providers.types';
import { localInstance } from 'src/i18n/locals';
import { DebugLogger } from 'src/utils/DebugLogger';
import {
	err,
	ok,
	QuickActionCompatibilityError,
} from './service-result';
import type {
	QuickAction,
	QuickActionExecutionError,
	QuickActionExecutionResult,
	QuickActionMessage,
	QuickActionProviderAdapter,
	QuickActionProviderConfig,
	QuickActionResult,
	QuickActionRuntimeSettings,
	QuickActionSendRequest,
} from './types';

export type { QuickActionExecutionResult } from './types';

/** QuickActionExecutionService 所需的最小宿主能力 */
export type QuickActionExecutionHostPort = VaultReadPort & SystemPromptPort;

function getQuickActionType(quickAction: QuickAction): 'normal' | 'group' {
	if (quickAction.actionType) {
		return quickAction.actionType;
	}
	if (quickAction.isActionGroup) {
		return 'group';
	}
	return 'normal';
}

interface PreparedQuickActionExecution {
	readonly messages: QuickActionMessage[];
	readonly sendRequest: QuickActionSendRequest;
}

const createGroupNotExecutableError = (
	quickActionId: string,
): QuickActionExecutionError => ({
	source: 'execution',
	kind: 'group-not-executable',
	quickActionId,
	message: localInstance.quick_action_group_not_executable,
});

const createMissingModelConfigError = (
	requestedModelTag?: string,
): QuickActionExecutionError => ({
	source: 'execution',
	kind: 'missing-model-config',
	requestedModelTag,
	message: localInstance.quick_action_no_model_config,
});

const createProviderMissingError = (
	vendor: string,
): QuickActionExecutionError => ({
	source: 'execution',
	kind: 'provider-missing',
	vendor,
	message: `${localInstance.quick_action_provider_missing_prefix}: ${vendor}`,
});

const createTemplateReadFailedError = (
	path: string,
): QuickActionExecutionError => ({
	source: 'execution',
	kind: 'template-read-failed',
	path,
	message: `${localInstance.quick_action_template_read_failed_prefix}: ${path}`,
});

export class QuickActionExecutionService {
	private currentAbortController: AbortController | null = null;

	constructor(
		private readonly obsidianApi: QuickActionExecutionHostPort,
		private readonly providerAdapter: QuickActionProviderAdapter,
		private readonly getAiRuntimeSettings: () => QuickActionRuntimeSettings,
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
		try {
			const streamResult = await this.executeQuickActionStreamResult(
				quickAction,
				selection,
				modelTag,
			);
			if (!streamResult.ok) {
				throw new QuickActionCompatibilityError(streamResult.error);
			}
			yield* streamResult.value;
		} catch (error) {
			if (error instanceof Error && error.name === 'AbortError') {
				DebugLogger.debug('[QuickActionExecutionService] 操作执行已取消');
				return;
			}
			DebugLogger.error('[QuickActionExecutionService] 流式执行操作失败', error);
			throw error;
		}
	}

	async executeQuickActionStreamResult(
		quickAction: QuickAction,
		selection: string,
		modelTag?: string,
	): Promise<
		QuickActionResult<AsyncGenerator<string, void, unknown>, QuickActionExecutionError>
	> {
		const planResult = await this.prepareExecutionPlan(
			quickAction,
			selection,
			modelTag,
		);
		if (!planResult.ok) {
			return planResult;
		}
		return ok(this.streamPreparedExecution(planResult.value));
	}

	private async executeNormalQuickAction(
		quickAction: QuickAction,
		selection: string,
		modelTag?: string,
	): Promise<QuickActionExecutionResult> {
		try {
			const planResult = await this.prepareExecutionPlan(
				quickAction,
				selection,
				modelTag,
			);
			if (!planResult.ok) {
				return this.buildFailedExecutionResult(planResult.error);
			}

			const result = await this.callAIWithMessages(
				planResult.value.sendRequest,
				planResult.value.messages,
			);
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

	private async prepareExecutionPlan(
		quickAction: QuickAction,
		selection: string,
		modelTag?: string,
	): Promise<QuickActionResult<PreparedQuickActionExecution, QuickActionExecutionError>> {
		if (getQuickActionType(quickAction) === 'group') {
			return err(createGroupNotExecutableError(quickAction.id));
		}

		const promptContentResult = await this.resolvePromptContentResult(quickAction);
		if (!promptContentResult.ok) {
			return promptContentResult;
		}

		const providerSettingsResult = this.resolveProviderSettingsResult(
			this.getAiRuntimeSettings(),
			modelTag || quickAction.modelTag,
		);
		if (!providerSettingsResult.ok) {
			return providerSettingsResult;
		}

		const messages = await this.buildMessages(
			quickAction.useDefaultSystemPrompt ?? true,
			promptContentResult.value,
			selection,
			quickAction.customPromptRole,
		);
		const sendRequest = this.providerAdapter.createSendRequest(
			providerSettingsResult.value.vendor,
			providerSettingsResult.value.options,
		);
		if (!sendRequest) {
			return err(createProviderMissingError(providerSettingsResult.value.vendor));
		}

		return ok({ messages, sendRequest });
	}

	private buildFailedExecutionResult(
		error: QuickActionExecutionError,
	): QuickActionExecutionResult {
		return {
			success: false,
			content: '',
			error: error.message,
		};
	}

	private async resolvePromptContentResult(
		quickAction: QuickAction,
	): Promise<QuickActionResult<string, QuickActionExecutionError>> {
		if (quickAction.promptSource === 'template' && quickAction.templateFile) {
			return await this.loadTemplateFileResult(quickAction.templateFile);
		}
		return ok(quickAction.prompt);
	}

	private async loadTemplateFileResult(
		filePath: string,
	): Promise<QuickActionResult<string, QuickActionExecutionError>> {
		try {
			return ok(await this.obsidianApi.readVaultFile(filePath));
		} catch (error) {
			DebugLogger.warn(
				`[QuickActionExecutionService] 读取模板文件失败: ${filePath}`,
				error,
			);
			return err(createTemplateReadFailedError(filePath));
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

	private resolveProviderSettingsResult(
		aiRuntimeSettings: QuickActionRuntimeSettings,
		modelTag?: string,
	): QuickActionResult<QuickActionProviderConfig, QuickActionExecutionError> {
		const providers = aiRuntimeSettings.providers;
		if (providers.length === 0) {
			return err(createMissingModelConfigError(modelTag));
		}
		if (modelTag) {
			const provider = providers.find((item) => item.tag === modelTag);
			if (provider) {
				return ok(provider);
			}
		}
		return ok(providers[0]);
	}

	private async *streamPreparedExecution(
		plan: PreparedQuickActionExecution,
	): AsyncGenerator<string, void, unknown> {
		this.currentAbortController = new AbortController();
		const controller = this.currentAbortController;
		DebugLogger.logLlmMessages(
			'QuickActionExecutionService.executeQuickActionStream',
			plan.messages,
			{ level: 'debug' },
		);

		const resolveEmbed = async () => new ArrayBuffer(0);
		let preview = '';
		try {
			for await (
				const chunk of plan.sendRequest(plan.messages, controller, resolveEmbed)
			) {
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
	}

	private async buildMessages(
		useDefaultSystemPrompt: boolean,
		promptContent: string,
		selection: string,
		customPromptRole?: 'system' | 'user',
	): Promise<QuickActionMessage[]> {
		const messages: QuickActionMessage[] = [];

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
		sendRequest: QuickActionSendRequest,
		messages: QuickActionMessage[],
	): Promise<string> {
		this.currentAbortController = new AbortController();
		const controller = this.currentAbortController;
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
