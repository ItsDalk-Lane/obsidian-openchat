import type { ChatServiceDeps } from './chat-service-types';
import {
	createChatServiceInternals,
	type ChatServiceInternals,
} from './chat-service-internals';
import { createChatServiceProviderApi } from './chat-service-provider-api';
import { createChatServiceStateApi } from './chat-service-state-api';
import { createChatServiceHistoryApi } from './chat-service-history-api';

type ChatServiceApi =
	& ReturnType<typeof createChatServiceProviderApi>
	& ReturnType<typeof createChatServiceStateApi>
	& ReturnType<typeof createChatServiceHistoryApi>;

export type ChatService = ChatServiceApi & {
	readonly internals: ChatServiceInternals;
};

type ChatServiceConstructor = new (deps: ChatServiceDeps) => ChatService;

class ChatServiceValue {
	readonly internals: ChatServiceInternals;

	constructor(deps: ChatServiceDeps) {
		this.internals = createChatServiceInternals(this as ChatService, deps);
		Object.assign(
			this as ChatService,
			createChatServiceProviderApi(this.internals),
			createChatServiceStateApi(this.internals),
			createChatServiceHistoryApi(this.internals),
		);
	}
}

export const ChatService = ChatServiceValue as unknown as ChatServiceConstructor;
