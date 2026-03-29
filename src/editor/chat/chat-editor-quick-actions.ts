import type { ChatService } from 'src/core/chat/services/chat-service';
import type { ChatConsumerHost } from 'src/core/chat/services/chat-service-types';
import { QuickActionDataService } from 'src/domains/quick-actions/service-data';
import { QuickActionExecutionService } from 'src/domains/quick-actions/service-execution';
import { getPromptTemplatePath } from 'src/utils/AIPathManager';

export const createChatEditorQuickActionExecutionService = (
	host: ChatConsumerHost,
	service: ChatService,
): QuickActionExecutionService =>
	new QuickActionExecutionService(
		service.getObsidianApiProvider(),
		() => host.getAiRuntimeSettings(),
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
