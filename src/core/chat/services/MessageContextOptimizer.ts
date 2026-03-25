import { countTokens } from 'gpt-tokenizer';
import type { Message as ProviderMessage } from 'src/types/provider';
import type {
	ChatContextCompactionRange,
	ChatContextCompactionState,
	ChatMessage,
	MessageManagementSettings,
} from '../types/chat';
import { isPinnedChatMessage } from '../types/chat';
import { estimateProviderMessagesTokens as estimateProviderMessagesTokensFromPayload } from 'src/core/chat/utils/token';
import {
	buildHistorySummary,
	type SummaryBuildResult,
	fitHistorySummaryToBudget,
	normalizeGeneratedHistorySummary,
} from './messageContextSummary';

const CONTEXT_COMPACTION_VERSION = 3;
const MAX_SECTION_ITEMS = 6;
const MAX_SUMMARY_LINE_CHARS = 220;

export interface SummaryGenerationRequest {
	kind: 'history';
	baseSummary: string;
	previousSummary?: string;
	deltaSummary?: string;
	incremental: boolean;
	targetTokens: number;
}

export type MessageContextSummaryGenerator = (
	request: SummaryGenerationRequest
) => Promise<string | null>;

export interface MessageContextOptimizationResult {
	messages: ChatMessage[];
	contextCompaction: ChatContextCompactionState | null;
	historyTokenEstimate: number;
	usedSummary: boolean;
	droppedReasoningCount: number;
}

export class MessageContextOptimizer {
	async optimize(
		messages: ChatMessage[],
		settings: MessageManagementSettings,
		existingCompaction?: ChatContextCompactionState | null,
		options?: {
			targetHistoryBudgetTokens?: number;
			summaryGenerator?: MessageContextSummaryGenerator;
		}
	): Promise<MessageContextOptimizationResult> {
		const stickyTailStart = this.findStickyTailStart(messages);
		const coreMessages = messages.slice(0, stickyTailStart);
		const stickyTail = messages.slice(stickyTailStart);
		const historyBudgetTokens = this.normalizePositiveInteger(
			options?.targetHistoryBudgetTokens,
			Number.MAX_SAFE_INTEGER
		);
		const recentTurns = this.normalizePositiveInteger(settings.recentTurns, 1);

		if (coreMessages.length === 0) {
			return {
				messages,
				contextCompaction: null,
				historyTokenEstimate: 0,
				usedSummary: false,
				droppedReasoningCount: 0,
			};
		}

		const totalHistoryTokens = this.estimateChatTokens(coreMessages);
		if (totalHistoryTokens <= historyBudgetTokens) {
			return {
				messages,
				contextCompaction: existingCompaction
					? {
						...existingCompaction,
						historyTokenEstimate: totalHistoryTokens,
						totalTokenEstimate: existingCompaction.totalTokenEstimate,
					}
					: null,
				historyTokenEstimate: totalHistoryTokens,
				usedSummary: false,
				droppedReasoningCount: 0,
			};
		}

		const recentStart = this.findRecentTurnStart(coreMessages, recentTurns);
		const recentMessages = coreMessages.slice(recentStart);
		const olderMessages = coreMessages.slice(0, recentStart);
		const pinnedOlderMessages = olderMessages.filter((message) =>
			isPinnedChatMessage(message)
		);
		const compactedHistory = olderMessages.filter(
			(message) => !isPinnedChatMessage(message)
		);
		const protectedMessages = [...pinnedOlderMessages, ...recentMessages];
		const protectedHistoryTokens = this.estimateChatTokens(protectedMessages);

		if (compactedHistory.length === 0 || protectedHistoryTokens >= historyBudgetTokens) {
			const preservedMessages = [...protectedMessages, ...stickyTail];
			return {
				messages: preservedMessages,
				contextCompaction: {
					version: CONTEXT_COMPACTION_VERSION,
					coveredRange: {
						endMessageId: null,
						messageCount: 0,
						signature: '0',
					},
					summary: '',
					historyTokenEstimate: this.estimateChatTokens(protectedMessages),
					contextSummary: existingCompaction?.contextSummary,
					contextSourceSignature: existingCompaction?.contextSourceSignature,
					contextTokenEstimate: existingCompaction?.contextTokenEstimate,
					totalTokenEstimate: existingCompaction?.totalTokenEstimate,
					updatedAt: Date.now(),
					droppedReasoningCount: 0,
					overflowedProtectedLayers: true,
				},
				historyTokenEstimate: this.estimateChatTokens(protectedMessages),
				usedSummary: false,
				droppedReasoningCount: 0,
			};
		}

		return this.buildCompactedResult(
			compactedHistory,
			pinnedOlderMessages,
			recentMessages,
			stickyTail,
			historyBudgetTokens,
			existingCompaction,
			options?.summaryGenerator
		);
	}

	estimateChatTokens(messages: ChatMessage[]): number {
		if (messages.length === 0) {
			return 0;
		}

		try {
			return Number(
				countTokens(
					messages.map((message) => ({
						role: message.role === 'tool' ? 'assistant' : message.role,
						content: message.content,
					})) as Array<{ role: string; content: string }>
				)
			);
		} catch {
			const totalChars = messages.reduce(
				(sum, message) => sum + String(message.content ?? '').length,
				0
			);
			return Math.ceil(totalChars / 4);
		}
	}

	estimateProviderMessagesTokens(messages: Array<Pick<ProviderMessage, 'role' | 'content' | 'embeds'>>): number {
		return estimateProviderMessagesTokensFromPayload(messages);
	}

	private async buildCompactedResult(
		compactedHistory: ChatMessage[],
		pinnedMessages: ChatMessage[],
		recentMessages: ChatMessage[],
		stickyTail: ChatMessage[],
		historyBudgetTokens: number,
		existingCompaction?: ChatContextCompactionState | null,
		summaryGenerator?: MessageContextSummaryGenerator
	): Promise<MessageContextOptimizationResult> {
		const coveredRange = this.buildCoveredRange(compactedHistory);
		const protectedHistoryTokens = this.estimateChatTokens([
			...pinnedMessages,
			...recentMessages,
		]);
		const summaryBudgetTokens = Math.max(0, historyBudgetTokens - protectedHistoryTokens);
		const summaryBuild = await this.resolveSummary(
			compactedHistory,
			coveredRange,
			summaryBudgetTokens,
			existingCompaction,
			summaryGenerator
		);
		const summaryMessage =
			summaryBuild.summary.trim().length > 0
				? {
					id: `context-compaction:${coveredRange.endMessageId ?? 'history'}`,
					role: 'assistant' as const,
					content: summaryBuild.summary,
					timestamp:
						compactedHistory[compactedHistory.length - 1]?.timestamp ?? Date.now(),
					metadata: {
						isContextSummary: true,
						hidden: true,
						hiddenFromHistory: true,
					},
				}
				: null;
		const optimizedCoreMessages = [
			...pinnedMessages,
			...(summaryMessage ? [summaryMessage] : []),
			...recentMessages,
		];
		const historyTokenEstimate = this.estimateChatTokens(optimizedCoreMessages);

		return {
			messages: [...optimizedCoreMessages, ...stickyTail],
			contextCompaction: {
				version: CONTEXT_COMPACTION_VERSION,
				coveredRange,
				summary: summaryBuild.summary,
				historyTokenEstimate,
				contextSummary: existingCompaction?.contextSummary,
				contextSourceSignature: existingCompaction?.contextSourceSignature,
				contextTokenEstimate: existingCompaction?.contextTokenEstimate,
				totalTokenEstimate: existingCompaction?.totalTokenEstimate,
				updatedAt: Date.now(),
				droppedReasoningCount: summaryBuild.droppedReasoningCount,
				overflowedProtectedLayers: false,
			},
			historyTokenEstimate,
			usedSummary: Boolean(summaryMessage),
			droppedReasoningCount: summaryBuild.droppedReasoningCount,
		};
	}

	private async resolveSummary(
		messages: ChatMessage[],
		coveredRange: ChatContextCompactionRange,
		summaryBudgetTokens: number,
		existingCompaction?: ChatContextCompactionState | null,
		summaryGenerator?: MessageContextSummaryGenerator
	): Promise<SummaryBuildResult> {
		if (summaryBudgetTokens <= 0) {
			return {
				summary: '',
				droppedReasoningCount: 0,
			};
		}

		if (this.canReuseCompaction(existingCompaction, coveredRange)) {
			return {
				summary: this.fitSummaryToBudget(existingCompaction.summary, summaryBudgetTokens),
				droppedReasoningCount: existingCompaction.droppedReasoningCount ?? 0,
			};
		}

		const baseSummary = buildHistorySummary(messages, summaryBudgetTokens);
		if (!summaryGenerator) {
			return {
				summary: this.fitSummaryToBudget(baseSummary.summary, summaryBudgetTokens),
				droppedReasoningCount: baseSummary.droppedReasoningCount,
			};
		}

		try {
			const incrementalDelta = this.getIncrementalDeltaSummary(messages, existingCompaction);
			const previousSummary: string | undefined = existingCompaction
				? (existingCompaction as ChatContextCompactionState).summary
				: undefined;
			const generatedSummary = await summaryGenerator({
				kind: 'history',
				baseSummary: baseSummary.summary,
				previousSummary,
				deltaSummary: incrementalDelta?.summary,
				incremental: Boolean(incrementalDelta),
				targetTokens: summaryBudgetTokens,
			});
			return {
				summary: this.fitSummaryToBudget(
					normalizeGeneratedHistorySummary(generatedSummary, baseSummary.summary),
					summaryBudgetTokens
				),
				droppedReasoningCount: baseSummary.droppedReasoningCount,
			};
		} catch {
			return {
				summary: this.fitSummaryToBudget(baseSummary.summary, summaryBudgetTokens),
				droppedReasoningCount: baseSummary.droppedReasoningCount,
			};
		}
	}

	private getIncrementalDeltaSummary(
		messages: ChatMessage[],
		existingCompaction?: ChatContextCompactionState | null
	): SummaryBuildResult | null {
		if (!existingCompaction) {
			return null;
		}

		const previousCount = existingCompaction.coveredRange.messageCount;
		if (previousCount <= 0 || previousCount >= messages.length) {
			return null;
		}

		const previousMessages = messages.slice(0, previousCount);
		const previousLastMessage = previousMessages[previousMessages.length - 1];
		if (
			!previousLastMessage
			|| this.buildStableMessageKey(previousLastMessage)
				!== existingCompaction.coveredRange.endMessageId
		) {
			return null;
		}

		if (this.buildSignature(previousMessages) !== existingCompaction.coveredRange.signature) {
			return null;
		}

		const deltaMessages = messages.slice(previousCount);
		return deltaMessages.length > 0
			? buildHistorySummary(deltaMessages, Number.MAX_SAFE_INTEGER)
			: null;
	}

	private canReuseCompaction(
		compaction: ChatContextCompactionState | null | undefined,
		coveredRange: ChatContextCompactionRange
	): compaction is ChatContextCompactionState {
		return Boolean(
			compaction
			&& compaction.version === CONTEXT_COMPACTION_VERSION
			&& compaction.coveredRange.endMessageId === coveredRange.endMessageId
			&& compaction.coveredRange.messageCount === coveredRange.messageCount
			&& compaction.coveredRange.signature === coveredRange.signature
			&& typeof compaction.summary === 'string'
			&& compaction.summary.trim().length > 0
		);
	}

	private buildCoveredRange(messages: ChatMessage[]): ChatContextCompactionRange {
		return {
			endMessageId: messages[messages.length - 1]
				? this.buildStableMessageKey(messages[messages.length - 1])
				: null,
			messageCount: messages.length,
			signature: this.buildSignature(messages),
		};
	}

	private buildStableMessageKey(message: ChatMessage): string {
		const toolSignature = (message.toolCalls ?? [])
			.map((toolCall) => `${toolCall.name}:${toolCall.result ?? ''}`)
			.join('|');
		return [
			message.role,
			message.timestamp,
			message.content,
			toolSignature,
		].join('::');
	}

	private buildSignature(messages: ChatMessage[]): string {
		let hash = 5381;
		for (const message of messages) {
			const value = this.buildStableMessageKey(message);
			for (let index = 0; index < value.length; index += 1) {
				hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
			}
		}
		return String(hash >>> 0);
	}

	private extractToolTarget(args: Record<string, unknown>): string | null {
		const candidate = args.filePath ?? args.path ?? args.file ?? args.target ?? args.url ?? args.uri;
		return typeof candidate === 'string' && candidate.trim().length > 0
			? candidate.trim()
			: null;
	}

	private normalizeText(content: string): string {
		return String(content ?? '')
			.replace(/<!-- FF_AGENT_EVENTS_START -->[\s\S]*?<!-- FF_AGENT_EVENTS_END -->/g, ' ')
			.replace(/\{\{FF_MCP_TOOL_START\}\}[\s\S]*?\{\{FF_MCP_TOOL_END\}\}/g, ' ')
			.replace(/\s+/g, ' ')
			.trim();
	}

	private compactLine(content: string, maxChars = MAX_SUMMARY_LINE_CHARS): string {
		const normalized = this.normalizeText(content);
		if (!normalized) {
			return '';
		}
		if (normalized.length <= maxChars) {
			return normalized;
		}
		return `${normalized.slice(0, Math.max(0, maxChars - 1)).trim()}…`;
	}

	private looksLikeDecision(content: string): boolean {
		return /决定|采用|改为|使用|保留|切换|改成|方案|策略|计划|rewrite|reuse|keep|switch/i.test(
			content
		);
	}

	private toBulletLines(items: string[], limit = MAX_SECTION_ITEMS): string[] {
		if (items.length === 0) {
			return ['- None'];
		}
		return items.slice(0, limit).map((item) => `- ${item}`);
	}

	private pushUnique(collection: string[], value: string): void {
		if (!value || collection.includes(value) || collection.length >= MAX_SECTION_ITEMS) {
			return;
		}
		collection.push(value);
	}

	private findStickyTailStart(messages: ChatMessage[]): number {
		let index = messages.length;
		while (index > 0 && messages[index - 1].metadata?.isEphemeralContext) {
			index -= 1;
		}
		return index;
	}

	private findRecentTurnStart(messages: ChatMessage[], recentTurns: number): number {
		let remainingTurns = recentTurns;
		for (let index = messages.length - 1; index >= 0; index -= 1) {
			if (messages[index].role !== 'user') {
				continue;
			}
			remainingTurns -= 1;
			if (remainingTurns === 0) {
				return index;
			}
		}
		return 0;
	}

	private normalizePositiveInteger(value: number | null | undefined, fallback: number): number {
		if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
			return Math.floor(value);
		}
		return fallback;
	}

	private fitSummaryToBudget(summary: string, targetBudgetTokens: number): string {
		return fitHistorySummaryToBudget(
			summary,
			targetBudgetTokens,
			(value) => this.estimateProviderMessagesTokens([{ role: 'assistant', content: value }])
		);
	}
}
