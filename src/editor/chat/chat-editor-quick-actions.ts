import type { ChatService } from 'src/core/chat/services/chat-service';
import type { ChatConsumerHost } from 'src/core/chat/services/chat-service-types';
import { availableVendors } from 'src/domains/settings/config-ai-runtime-vendors';
import { QuickActionDataService } from 'src/domains/quick-actions/service-data';
import { QuickActionExecutionService } from 'src/domains/quick-actions/service-execution';
import type { QuickActionProviderAdapter } from 'src/domains/quick-actions/types';
import { buildProviderOptionsWithReasoningDisabled } from 'src/LLMProviders/utils';
import type { BaseOptions } from 'src/LLMProviders/provider-shared';
import { getPromptTemplatePath } from 'src/utils/AIPathManager';

/**
 * 适配器：将 legacy vendor/options 逻辑封装为 QuickActionProviderAdapter。
 */
const createQuickActionProviderAdapter = (): QuickActionProviderAdapter => ({
	createSendRequest(vendorName, options) {
		const vendor = availableVendors.find((v) => v.name === vendorName);
		if (!vendor) {
			return null;
		}
		const providerOptions = buildProviderOptionsWithReasoningDisabled(
			options as BaseOptions,
			vendorName,
		);
		return vendor.sendRequestFunc(providerOptions);
	},
});

export const createChatEditorQuickActionExecutionService = (
	host: ChatConsumerHost,
	service: ChatService,
): QuickActionExecutionService =>
	new QuickActionExecutionService(
		service.getObsidianApiProvider(),
		createQuickActionProviderAdapter(),
		() => ({
			defaultModel: host.getChatSettings().defaultModel,
			providers: host.getAiRuntimeSettings().providers,
			quickActionsSystemPrompt: host.getAiRuntimeSettings().quickActionsSystemPrompt,
		}),
		() => getPromptTemplatePath(host.getAiDataFolder()),
	);

export const createChatEditorQuickActionDataService = (
	host: ChatConsumerHost,
	service: ChatService,
): QuickActionDataService =>
	new QuickActionDataService(
		service.getObsidianApiProvider(),
		{
			getAiDataFolder: () => host.getAiDataFolder(),
			syncRuntimeQuickActions: (quickActions) => {
				host.setChatSettings({
					...host.getChatSettings(),
					quickActions,
				});
			},
		},
	);
