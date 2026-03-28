import type { AiRuntimeSettings } from 'src/settings/ai-runtime';
import type { PreparedChatRequest } from './ChatServiceCore';
import type { ChatMessageOperationDeps } from './chatMessageOperations';
import type { ChatMessageMutationDeps } from './chatMessageMutations';

export interface ChatMessageOperationFacade {
	prepareChatRequest(
		content?: string,
		options?: { skipImageSupportValidation?: boolean },
	): Promise<PreparedChatRequest | null>;
	sendMessage(content?: string): Promise<void>;
}

export interface ChatMessageMutationFacade {
	editMessage(messageId: string, content: string): Promise<void>;
	editAndRegenerate(messageId: string, content: string): Promise<void>;
	deleteMessage(messageId: string): Promise<void>;
	togglePinnedMessage(messageId: string): Promise<void>;
	insertMessageToEditor(messageId: string): void;
	regenerateFromMessage(messageId: string): Promise<void>;
	refreshProviderSettings(aiRuntimeSettings: AiRuntimeSettings): void;
}

export interface ChatMessageOperationFacadeOperations {
	prepareChatRequest(
		deps: ChatMessageOperationDeps,
		content?: string,
		options?: { skipImageSupportValidation?: boolean },
	): Promise<PreparedChatRequest | null>;
	sendMessage(
		deps: ChatMessageOperationDeps,
		content?: string,
	): Promise<void>;
}

export interface ChatMessageMutationFacadeOperations {
	editMessage(
		deps: ChatMessageMutationDeps,
		messageId: string,
		content: string,
	): Promise<void>;
	editAndRegenerate(
		deps: ChatMessageMutationDeps,
		messageId: string,
		content: string,
	): Promise<void>;
	deleteMessage(
		deps: ChatMessageMutationDeps,
		messageId: string,
	): Promise<void>;
	togglePinnedMessage(
		deps: ChatMessageMutationDeps,
		messageId: string,
	): Promise<void>;
	insertMessageToEditor(
		deps: ChatMessageMutationDeps,
		messageId: string,
	): void;
	regenerateFromMessage(
		deps: ChatMessageMutationDeps,
		messageId: string,
	): Promise<void>;
	refreshProviderSettings(
		deps: ChatMessageMutationDeps,
		aiRuntimeSettings: AiRuntimeSettings,
	): void;
}

type ChatMessageOperationDepsAccessor = () => ChatMessageOperationDeps;
type ChatMessageMutationDepsAccessor = () => ChatMessageMutationDeps;

export const createChatMessageOperationFacade = (
	getDeps: ChatMessageOperationDepsAccessor,
	operations: ChatMessageOperationFacadeOperations,
): ChatMessageOperationFacade => ({
	prepareChatRequest: async (content, options) =>
		await operations.prepareChatRequest(getDeps(), content, options),
	sendMessage: async (content) => await operations.sendMessage(getDeps(), content),
});

export const createChatMessageMutationFacade = (
	getDeps: ChatMessageMutationDepsAccessor,
	operations: ChatMessageMutationFacadeOperations,
): ChatMessageMutationFacade => ({
	editMessage: async (messageId, content) =>
		await operations.editMessage(getDeps(), messageId, content),
	editAndRegenerate: async (messageId, content) =>
		await operations.editAndRegenerate(getDeps(), messageId, content),
	deleteMessage: async (messageId) =>
		await operations.deleteMessage(getDeps(), messageId),
	togglePinnedMessage: async (messageId) =>
		await operations.togglePinnedMessage(getDeps(), messageId),
	insertMessageToEditor: (messageId) =>
		operations.insertMessageToEditor(getDeps(), messageId),
	regenerateFromMessage: async (messageId) =>
		await operations.regenerateFromMessage(getDeps(), messageId),
	refreshProviderSettings: (aiRuntimeSettings) =>
		operations.refreshProviderSettings(getDeps(), aiRuntimeSettings),
});