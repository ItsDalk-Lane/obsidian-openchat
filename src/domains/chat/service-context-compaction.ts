import { countTokens } from 'gpt-tokenizer'
import type { Message as ProviderMessage } from 'src/types/provider'
import { fitHistorySummaryToBudget, normalizeGeneratedHistorySummary } from './service-history-summary-budget'
import { buildHistorySummary, type SummaryBuildResult } from './service-history-summary'
import {
	buildCoveredRange,
	canReuseCompaction,
	findRecentTurnStart,
	findStickyTailStart,
	getIncrementalDeltaSummary,
	normalizePositiveInteger,
	CONTEXT_COMPACTION_VERSION,
} from './service-context-compaction-range'
import { isPinnedChatMessage } from './service'
import type {
	ChatContextCompactionState,
	ChatMessage,
	MessageManagementSettings,
} from './types'

export interface SummaryGenerationRequest {
	kind: 'history'
	baseSummary: string
	previousSummary?: string
	deltaSummary?: string
	incremental: boolean
	targetTokens: number
}

export type MessageContextSummaryGenerator = (
	request: SummaryGenerationRequest,
) => Promise<string | null>

export interface MessageContextOptimizationResult {
	messages: ChatMessage[]
	contextCompaction: ChatContextCompactionState | null
	historyTokenEstimate: number
	usedSummary: boolean
	droppedReasoningCount: number
}

export class MessageContextOptimizer {
	async optimize(
		messages: ChatMessage[],
		settings: MessageManagementSettings,
		existingCompaction?: ChatContextCompactionState | null,
		options?: {
			targetHistoryBudgetTokens?: number
			summaryGenerator?: MessageContextSummaryGenerator
		},
	): Promise<MessageContextOptimizationResult> {
		const stickyTailStart = findStickyTailStart(messages)
		const coreMessages = messages.slice(0, stickyTailStart)
		const stickyTail = messages.slice(stickyTailStart)
		const historyBudgetTokens = normalizePositiveInteger(
			options?.targetHistoryBudgetTokens,
			Number.MAX_SAFE_INTEGER,
		)
		const recentTurns = normalizePositiveInteger(settings.recentTurns, 1)

		if (coreMessages.length === 0) {
			return {
				messages,
				contextCompaction: null,
				historyTokenEstimate: 0,
				usedSummary: false,
				droppedReasoningCount: 0,
			}
		}

		const totalHistoryTokens = this.estimateChatTokens(coreMessages)
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
			}
		}

		const recentStart = findRecentTurnStart(coreMessages, recentTurns)
		const recentMessages = coreMessages.slice(recentStart)
		const olderMessages = coreMessages.slice(0, recentStart)
		const pinnedOlderMessages = olderMessages.filter((message) =>
			isPinnedChatMessage(message),
		)
		const compactedHistory = olderMessages.filter(
			(message) => !isPinnedChatMessage(message),
		)
		const protectedMessages = [...pinnedOlderMessages, ...recentMessages]
		const protectedHistoryTokens = this.estimateChatTokens(protectedMessages)

		if (compactedHistory.length === 0 || protectedHistoryTokens >= historyBudgetTokens) {
			return {
				messages: [...protectedMessages, ...stickyTail],
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
			}
		}

		return this.buildCompactedResult(
			compactedHistory,
			pinnedOlderMessages,
			recentMessages,
			stickyTail,
			historyBudgetTokens,
			existingCompaction,
			options?.summaryGenerator,
		)
	}

	estimateChatTokens(messages: ChatMessage[]): number {
		if (messages.length === 0) {
			return 0
		}

		try {
			return Number(
				countTokens(
					messages.map((message) => ({
						role: message.role === 'tool' ? 'assistant' : message.role,
						content: message.content,
					})) as Array<{ role: string; content: string }>,
				),
			)
		} catch {
			const totalChars = messages.reduce(
				(sum, message) => sum + String(message.content ?? '').length,
				0,
			)
			return Math.ceil(totalChars / 4)
		}
	}

	estimateProviderMessagesTokens(
		messages: Array<Pick<ProviderMessage, 'role' | 'content' | 'embeds'>>,
	): number {
		return messages.reduce((sum, message) => {
			const content = String(message.content ?? '')
			const embeds = (message.embeds?.length ?? 0) * 256
			try {
				return sum + Number(countTokens([{ role: message.role, content }] as Array<{
					role: ProviderMessage['role']
					content: string
				}>)) + embeds
			} catch {
				return sum + Math.ceil(content.length / 4) + embeds
			}
		}, 0)
	}

	private async buildCompactedResult(
		compactedHistory: ChatMessage[],
		pinnedMessages: ChatMessage[],
		recentMessages: ChatMessage[],
		stickyTail: ChatMessage[],
		historyBudgetTokens: number,
		existingCompaction?: ChatContextCompactionState | null,
		summaryGenerator?: MessageContextSummaryGenerator,
	): Promise<MessageContextOptimizationResult> {
		const coveredRange = buildCoveredRange(compactedHistory)
		const protectedHistoryTokens = this.estimateChatTokens([
			...pinnedMessages,
			...recentMessages,
		])
		const summaryBudgetTokens = Math.max(0, historyBudgetTokens - protectedHistoryTokens)
		const summaryBuild = await this.resolveSummary(
			compactedHistory,
			coveredRange,
			summaryBudgetTokens,
			existingCompaction,
			summaryGenerator,
		)
		const summaryMessage = summaryBuild.summary.trim().length > 0
			? {
				id: `context-compaction:${coveredRange.endMessageId ?? 'history'}`,
				role: 'assistant' as const,
				content: summaryBuild.summary,
				timestamp: compactedHistory[compactedHistory.length - 1]?.timestamp ?? Date.now(),
				metadata: {
					isContextSummary: true,
					hidden: true,
					hiddenFromHistory: true,
				},
			}
			: null
		const optimizedCoreMessages = [
			...pinnedMessages,
			...(summaryMessage ? [summaryMessage] : []),
			...recentMessages,
		]
		const historyTokenEstimate = this.estimateChatTokens(optimizedCoreMessages)

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
		}
	}

	private async resolveSummary(
		messages: ChatMessage[],
		coveredRange: ReturnType<typeof buildCoveredRange>,
		summaryBudgetTokens: number,
		existingCompaction?: ChatContextCompactionState | null,
		summaryGenerator?: MessageContextSummaryGenerator,
	): Promise<SummaryBuildResult> {
		if (summaryBudgetTokens <= 0) {
			return { summary: '', droppedReasoningCount: 0 }
		}

		if (canReuseCompaction(existingCompaction, coveredRange)) {
			return {
				summary: this.fitSummaryToBudget(existingCompaction.summary, summaryBudgetTokens),
				droppedReasoningCount: existingCompaction.droppedReasoningCount ?? 0,
			}
		}

		const baseSummary = buildHistorySummary(messages, summaryBudgetTokens)
		if (!summaryGenerator) {
			return {
				summary: this.fitSummaryToBudget(baseSummary.summary, summaryBudgetTokens),
				droppedReasoningCount: baseSummary.droppedReasoningCount,
			}
		}

		try {
			const incrementalDelta = getIncrementalDeltaSummary(messages, existingCompaction)
			const generatedSummary = await summaryGenerator({
				kind: 'history',
				baseSummary: baseSummary.summary,
				previousSummary: existingCompaction?.summary,
				deltaSummary: incrementalDelta?.summary,
				incremental: Boolean(incrementalDelta),
				targetTokens: summaryBudgetTokens,
			})
			return {
				summary: this.fitSummaryToBudget(
					normalizeGeneratedHistorySummary(generatedSummary, baseSummary.summary),
					summaryBudgetTokens,
				),
				droppedReasoningCount: baseSummary.droppedReasoningCount,
			}
		} catch {
			return {
				summary: this.fitSummaryToBudget(baseSummary.summary, summaryBudgetTokens),
				droppedReasoningCount: baseSummary.droppedReasoningCount,
			}
		}
	}

	private fitSummaryToBudget(summary: string, targetBudgetTokens: number): string {
		return fitHistorySummaryToBudget(summary, targetBudgetTokens, (value) =>
			this.estimateProviderMessagesTokens([{ role: 'assistant', content: value }]),
		)
	}
}