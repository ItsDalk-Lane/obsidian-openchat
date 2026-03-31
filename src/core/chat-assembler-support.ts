import type { ChatTriggerSource } from 'src/core/chat/services/chat-service-types';
import type { ChatOpenMode } from 'src/domains/chat/types';

export interface ChatActivationServicePort {
	setNextTriggerSource(source: ChatTriggerSource): void;
}

export interface ChatActivationCoordinatorPort {
	activateChatView(mode: ChatOpenMode): Promise<void>;
}

export interface ChatActivationFeatureManagerPort {
	getService(): ChatActivationServicePort;
	activateChatView(mode: ChatOpenMode): Promise<void>;
}

export interface ChatActivationDeps {
	chatFeatureManager: ChatActivationFeatureManagerPort | null;
	earlyChatService: ChatActivationServicePort | null;
	earlyChatViewCoordinator: ChatActivationCoordinatorPort | null;
}

export const activateChatViewFromAssembler = async (
	deps: ChatActivationDeps,
	mode: ChatOpenMode,
	triggerSource: ChatTriggerSource = 'chat_input',
): Promise<void> => {
	const service = deps.chatFeatureManager?.getService() ?? deps.earlyChatService;
	service?.setNextTriggerSource(triggerSource);

	if (deps.chatFeatureManager) {
		await deps.chatFeatureManager.activateChatView(mode);
		return;
	}

	await deps.earlyChatViewCoordinator?.activateChatView(mode);
};