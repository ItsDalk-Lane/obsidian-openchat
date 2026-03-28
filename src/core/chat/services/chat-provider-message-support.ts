import {
	buildRequestTokenState,
	hasRequestTokenStateChanged,
} from 'src/domains/chat/service-provider-message-support';
import {
	estimateProviderMessagesTokens,
} from 'src/core/chat/utils/token';
import type { Message as ProviderMessage } from 'src/types/provider';
import type { ChatMessage, ChatSession } from '../types/chat';
import type { FileContentOptions } from './file-content-service';
import type { ChatProviderMessageDeps } from './chat-provider-messages';
import { buildLivePlanUserContext } from './chat-plan-prompts';

export const buildRequestMessagesWithEphemeralContext = (
	deps: Pick<ChatProviderMessageDeps, 'messageService'>,
	session: ChatSession,
	visibleMessages: ChatMessage[],
	options?: {
		context?: string;
		taskDescription?: string;
	},
): ChatMessage[] => {
	const requestMessages = [...visibleMessages];
	if (options?.context || options?.taskDescription) {
		const contextParts: string[] = [];
		if (options.taskDescription) {
			contextParts.push(`当前任务：${options.taskDescription}`);
		}
		if (options.context) {
			contextParts.push(`前一步输出：\n${options.context}`);
		}
		requestMessages.push(
			deps.messageService.createMessage('user', contextParts.join('\n\n'), {
				metadata: {
					hidden: true,
					hiddenFromHistory: true,
					hiddenFromModel: false,
					isEphemeralContext: true,
				},
			}),
		);
	}
	const livePlanContext = buildLivePlanUserContext(session.livePlan);
	if (livePlanContext) {
		requestMessages.push(
			deps.messageService.createMessage('user', livePlanContext, {
				metadata: {
					hidden: true,
					hiddenFromHistory: true,
					hiddenFromModel: false,
					isEphemeralContext: true,
				},
			}),
		);
	}
	return requestMessages;
};

export const updateRequestTokenState = async (
	deps: ChatProviderMessageDeps,
	session: ChatSession,
	params: {
		requestEstimate: {
			totalTokens: number;
			messageTokens: number;
			toolTokens: number;
		};
		contextMessage: ProviderMessage | null;
		contextSourceMessage: ChatMessage | null;
		sourcePath: string;
		fileContentOptions: FileContentOptions;
	},
): Promise<void> => {
	let userTurnTokenEstimate: number | undefined;
	if (params.contextSourceMessage) {
		const taskMessages = await deps.messageService.toProviderMessages(
			[params.contextSourceMessage],
			{
				contextNotes: [],
				selectedFiles: [],
				selectedFolders: [],
				fileContentOptions: params.fileContentOptions,
				sourcePath: params.sourcePath,
				prebuiltContextMessage: null,
			},
		);
		const userTurnMessages = [
			...(params.contextMessage ? [params.contextMessage] : []),
			...taskMessages.filter((message) => message.role === 'user'),
		];
		userTurnTokenEstimate = estimateProviderMessagesTokens(userTurnMessages);
		params.contextSourceMessage.metadata = {
			...(params.contextSourceMessage.metadata ?? {}),
			userTurnTokenEstimate,
		};
	}
	const nextState = buildRequestTokenState({
		totalTokenEstimate: params.requestEstimate.totalTokens,
		messageTokenEstimate: params.requestEstimate.messageTokens,
		toolTokenEstimate: params.requestEstimate.toolTokens,
		userTurnTokenEstimate,
	});
	if (hasRequestTokenStateChanged(session.requestTokenState, nextState)) {
		session.requestTokenState = nextState;
		void deps.persistSessionContextCompactionFrontmatter(session);
	}
};
