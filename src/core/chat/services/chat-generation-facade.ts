import type { GenerateAssistantOptions } from './chat-service-types';
import type { ChatGenerationDeps } from './chat-generation';
import type { ChatMessage, ChatSession } from '../types/chat';

export interface ChatGenerationFacade {
	generateAssistantResponse(session: ChatSession): Promise<void>;
	generateAssistantResponseForModel(
		session: ChatSession,
		modelTag: string,
		options?: GenerateAssistantOptions,
	): Promise<ChatMessage>;
}

export interface ChatGenerationFacadeOperations {
	generateAssistantResponse(
		deps: ChatGenerationDeps,
		session: ChatSession,
	): Promise<void>;
	generateAssistantResponseForModel(
		deps: ChatGenerationDeps,
		session: ChatSession,
		modelTag: string,
		options?: GenerateAssistantOptions,
	): Promise<ChatMessage>;
}

type ChatGenerationDepsAccessor = () => ChatGenerationDeps;

export const createChatGenerationFacade = (
	getDeps: ChatGenerationDepsAccessor,
	operations: ChatGenerationFacadeOperations,
): ChatGenerationFacade => ({
	generateAssistantResponse: async (session) =>
		await operations.generateAssistantResponse(getDeps(), session),
	generateAssistantResponseForModel: async (session, modelTag, options) =>
		await operations.generateAssistantResponseForModel(
			getDeps(),
			session,
			modelTag,
			options,
		),
});
