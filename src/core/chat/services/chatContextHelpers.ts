import type {
	ChatMessage,
	ChatSession,
	MessageManagementSettings,
} from '../types/chat';
import type { ProviderSettings } from 'src/types/provider';
import { estimateProviderMessagesTokens } from 'src/core/chat/utils/token';
import { runSummaryModelRequest } from './chatSummaryModel';
import type { MessageContextSummaryGenerator } from './MessageContextOptimizer';
export {
	buildResolvedSelectionContext,
	getLatestContextSourceMessage,
	getStringMetadata,
	hasBuildableContextPayload,
	mergeCompactionState,
} from 'src/domains/chat/service-provider-message-context';

const isEphemeralContextMessage = (message: ChatMessage): boolean =>
	Boolean(message.metadata?.isEphemeralContext);

export const getLatestVisibleUserMessage = (
	session: ChatSession
): ChatMessage | null => {
	for (let index = session.messages.length - 1; index >= 0; index -= 1) {
		const message = session.messages[index];
		if (message.role !== 'user') {
			continue;
		}
		if (message.metadata?.hiddenFromModel || isEphemeralContextMessage(message)) {
			continue;
		}
		const content = message.content.trim();
		if (content) {
			return message;
		}
	}
	return null;
};

export const getLatestVisibleUserMessageContent = (session: ChatSession): string =>
	getLatestVisibleUserMessage(session)?.content.trim() ?? '';

export const getPreviousVisibleUserMessage = (
	session: ChatSession,
	excludeMessageId?: string
): ChatMessage | null => {
	let skippedCurrent = false;
	for (let index = session.messages.length - 1; index >= 0; index -= 1) {
		const message = session.messages[index];
		if (message.role !== 'user') {
			continue;
		}
		if (message.metadata?.hiddenFromModel || isEphemeralContextMessage(message)) {
			continue;
		}
		const content = message.content.trim();
		if (!content) {
			continue;
		}
		if (!skippedCurrent && (!excludeMessageId || message.id === excludeMessageId)) {
			skippedCurrent = true;
			continue;
		}
		return message;
	}
	return null;
};

export const estimateSystemPromptTokens = (systemPrompt?: string): number => {
	if (!systemPrompt?.trim()) {
		return 0;
	}
	return estimateProviderMessagesTokens([{ role: 'system', content: systemPrompt }]);
};

export const createHistorySummaryGenerator = (params: {
	modelTag: string | undefined;
	session: ChatSession;
	messageManagement: MessageManagementSettings;
	selectedModelId: string | null;
	getDefaultProviderTag: () => string | null;
	findProviderByTagExact: (tag?: string) => ProviderSettings | null;
}): MessageContextSummaryGenerator | undefined => {
	const summaryModelTag =
		params.messageManagement.summaryModelTag
		|| params.modelTag
		|| params.session.modelId
		|| params.selectedModelId
		|| params.getDefaultProviderTag();
	if (!summaryModelTag) {
		return undefined;
	}

	return async (request) => {
		const systemPrompt = [
			'You compress prior chat history for an AI coding assistant.',
			'Output the exact same five sections: [CONTEXT], [KEY DECISIONS], [CURRENT STATE], [IMPORTANT DETAILS], [OPEN ITEMS].',
			'Preserve exact file paths, exact field names, precise numbers, config keys, tool outcomes, pending work, and factual constraints.',
			'Never flip polarity for requirements or prohibitions. If the source says "do not send old reasoning_content", preserve that exact meaning.',
			'Do not invent details. Do not include chain-of-thought. Be concise but keep critical technical details verbatim when needed.',
		].join(' ');

		const userPrompt = request.incremental
			? [
				'Update the existing summary by merging in the newly truncated history span.',
				`Keep the result within roughly ${request.targetTokens} tokens.`,
				'Keep useful prior bullets, deduplicate repeated facts, preserve exact paths/tool names, exact numeric values, and keep requirement/prohibition wording exact.',
				'',
				'Existing summary:',
				request.previousSummary ?? '',
				'',
				'New span summary:',
				request.deltaSummary ?? '',
			].join('\n')
			: [
				'Rewrite the extracted history summary into a concise persistent context block.',
				`Keep the result within roughly ${request.targetTokens} tokens.`,
				'Preserve exact file paths, exact field names, user requests, decisions, tool outcomes, open threads, exact numbers, and any explicit do/do-not rules verbatim when possible.',
				'',
				'Source summary:',
				request.baseSummary,
			].join('\n');

		return await runSummaryModelRequest({
			modelTag: summaryModelTag,
			systemPrompt,
			userPrompt,
			maxTokens: Math.max(256, Math.min(900, request.targetTokens)),
			findProviderByTagExact: (tag) => params.findProviderByTagExact(tag),
		});
	};
};
