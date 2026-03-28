import { buildHistorySummary, type SummaryBuildResult } from './service-history-summary'
import type {
	ChatContextCompactionRange,
	ChatContextCompactionState,
	ChatMessage,
} from './types'

export const CONTEXT_COMPACTION_VERSION = 3

export const buildStableMessageKey = (message: ChatMessage): string => {
	const toolSignature = (message.toolCalls ?? [])
		.map((toolCall) => `${toolCall.name}:${toolCall.result ?? ''}`)
		.join('|')
	return [message.role, message.timestamp, message.content, toolSignature].join('::')
}

export const buildContextCompactionSignature = (messages: ChatMessage[]): string => {
	let hash = 5381
	for (const message of messages) {
		const value = buildStableMessageKey(message)
		for (let index = 0; index < value.length; index += 1) {
			hash = ((hash << 5) + hash) ^ value.charCodeAt(index)
		}
	}
	return String(hash >>> 0)
}

export const buildCoveredRange = (
	messages: ChatMessage[],
): ChatContextCompactionRange => ({
	endMessageId: messages[messages.length - 1]
		? buildStableMessageKey(messages[messages.length - 1])
		: null,
	messageCount: messages.length,
	signature: buildContextCompactionSignature(messages),
})

export const canReuseCompaction = (
	compaction: ChatContextCompactionState | null | undefined,
	coveredRange: ChatContextCompactionRange,
): compaction is ChatContextCompactionState =>
	Boolean(
		compaction
		&& compaction.version === CONTEXT_COMPACTION_VERSION
		&& compaction.coveredRange.endMessageId === coveredRange.endMessageId
		&& compaction.coveredRange.messageCount === coveredRange.messageCount
		&& compaction.coveredRange.signature === coveredRange.signature
		&& typeof compaction.summary === 'string'
		&& compaction.summary.trim().length > 0,
	)

export const getIncrementalDeltaSummary = (
	messages: ChatMessage[],
	existingCompaction?: ChatContextCompactionState | null,
): SummaryBuildResult | null => {
	if (!existingCompaction) {
		return null
	}

	const previousCount = existingCompaction.coveredRange.messageCount
	if (previousCount <= 0 || previousCount >= messages.length) {
		return null
	}

	const previousMessages = messages.slice(0, previousCount)
	const previousLastMessage = previousMessages[previousMessages.length - 1]
	if (
		!previousLastMessage
		|| buildStableMessageKey(previousLastMessage)
			!== existingCompaction.coveredRange.endMessageId
	) {
		return null
	}

	if (
		buildContextCompactionSignature(previousMessages)
		!== existingCompaction.coveredRange.signature
	) {
		return null
	}

	const deltaMessages = messages.slice(previousCount)
	return deltaMessages.length > 0
		? buildHistorySummary(deltaMessages, Number.MAX_SAFE_INTEGER)
		: null
}

export const findStickyTailStart = (messages: ChatMessage[]): number => {
	let index = messages.length
	while (index > 0 && messages[index - 1].metadata?.isEphemeralContext) {
		index -= 1
	}
	return index
}

export const findRecentTurnStart = (
	messages: ChatMessage[],
	recentTurns: number,
): number => {
	let remainingTurns = recentTurns
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		if (messages[index].role !== 'user') {
			continue
		}
		remainingTurns -= 1
		if (remainingTurns === 0) {
			return index
		}
	}
	return 0
}

export const normalizePositiveInteger = (
	value: number | null | undefined,
	fallback: number,
): number => {
	if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
		return Math.floor(value)
	}
	return fallback
}