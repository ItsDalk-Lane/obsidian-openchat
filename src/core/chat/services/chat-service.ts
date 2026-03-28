import type { ChatServiceDeps } from './chat-service-types';
import {
	createChatServiceInternals,
	type ChatServiceInternals,
} from './chat-service-internals';
import { createChatServiceProviderApi } from './chat-service-provider-api';
import { createChatServiceStateApi } from './chat-service-state-api';
import { createChatServiceHistoryApi } from './chat-service-history-api';

export interface ChatService
	extends ReturnType<typeof createChatServiceProviderApi>,
		ReturnType<typeof createChatServiceStateApi>,
		ReturnType<typeof createChatServiceHistoryApi> {}

export class ChatService {
	readonly internals: ChatServiceInternals;

	constructor(deps: ChatServiceDeps) {
		this.internals = createChatServiceInternals(this, deps);
		Object.assign(
			this,
			createChatServiceProviderApi(this.internals),
			createChatServiceStateApi(this.internals),
			createChatServiceHistoryApi(this.internals),
		);
	}
}
