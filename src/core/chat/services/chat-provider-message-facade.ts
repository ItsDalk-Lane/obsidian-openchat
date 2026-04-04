import type { ResolvedContextBudget } from 'src/core/chat/utils/context-budget';
import type { Message as ProviderMessage } from 'src/types/provider';
import type { ToolDefinition } from 'src/types/tool';
import type { FileContentOptions } from './file-content-service';
import type { ChatProviderMessageDeps } from './chat-provider-messages';
import type {
	ChatMessage,
	ChatSession,
	ChatSettings,
	MessageManagementSettings,
} from '../types/chat';

export interface ChatProviderMessageBuildOptions {
	context?: string;
	taskDescription?: string;
	systemPrompt?: string;
	modelTag?: string;
	requestTools?: ToolDefinition[];
}

export interface ChatProviderMessageFacade {
	buildProviderMessages(session: ChatSession): Promise<ProviderMessage[]>;
	buildProviderMessagesWithOptions(
		session: ChatSession,
		options?: ChatProviderMessageBuildOptions,
	): Promise<ProviderMessage[]>;
	buildProviderMessagesForAgent(
		messages: ChatMessage[],
		session: ChatSession,
		systemPrompt?: string,
		modelTag?: string,
		requestTools?: ToolDefinition[],
	): Promise<ProviderMessage[]>;
	getMessageManagementSettings(): MessageManagementSettings;
	getDefaultFileContentOptions(): FileContentOptions;
	resolveContextBudget(modelTag?: string | null): ResolvedContextBudget;
}

export interface ChatProviderMessageFacadeOperations {
	buildProviderMessages(
		deps: ChatProviderMessageDeps,
		session: ChatSession,
	): Promise<ProviderMessage[]>;
	buildProviderMessagesWithOptions(
		deps: ChatProviderMessageDeps,
		session: ChatSession,
		options?: ChatProviderMessageBuildOptions,
	): Promise<ProviderMessage[]>;
	buildProviderMessagesForAgent(
		deps: ChatProviderMessageDeps,
		messages: ChatMessage[],
		session: ChatSession,
		systemPrompt?: string,
		modelTag?: string,
		requestTools?: ToolDefinition[],
	): Promise<ProviderMessage[]>;
	getMessageManagementSettings(
		settings: ChatSettings,
		pluginChatSettings: ChatSettings,
	): MessageManagementSettings;
	getDefaultFileContentOptions(): FileContentOptions;
	resolveContextBudget(
		deps: Pick<ChatProviderMessageDeps, 'resolveProviderByTag' | 'state'>,
		modelTag?: string | null,
	): ResolvedContextBudget;
}

type ChatProviderMessageDepsAccessor = () => ChatProviderMessageDeps;

export const createChatProviderMessageFacade = (
	getDeps: ChatProviderMessageDepsAccessor,
	operations: ChatProviderMessageFacadeOperations,
): ChatProviderMessageFacade => ({
	buildProviderMessages: async (session) =>
		await operations.buildProviderMessages(getDeps(), session),
	buildProviderMessagesWithOptions: async (session, options) =>
		await operations.buildProviderMessagesWithOptions(getDeps(), session, options),
	buildProviderMessagesForAgent: async (
		messages,
		session,
		systemPrompt,
		modelTag,
		requestTools = [],
	) =>
		await operations.buildProviderMessagesForAgent(
			getDeps(),
			messages,
			session,
			systemPrompt,
			modelTag,
			requestTools,
		),
	getMessageManagementSettings: () => {
		const deps = getDeps();
		return operations.getMessageManagementSettings(
			deps.settings,
			deps.pluginChatSettings,
		);
	},
	getDefaultFileContentOptions: () => operations.getDefaultFileContentOptions(),
	resolveContextBudget: (modelTag) =>
		operations.resolveContextBudget(getDeps(), modelTag),
});
