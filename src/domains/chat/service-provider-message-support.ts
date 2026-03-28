import { DEFAULT_MESSAGE_MANAGEMENT_SETTINGS, normalizeMessageManagementSettings } from './config'
import type {
	ChatContextCompactionState,
	ChatRequestTokenState,
	ChatSettings,
	MessageManagementSettings,
} from './types'

export interface ChatFileContentOptions {
	maxFileSize: number
	maxContentLength: number
	includeExtensions: string[]
	excludeExtensions: string[]
	excludePatterns: RegExp[]
}

export const getChatMessageManagementSettings = (
	settings: ChatSettings,
	pluginChatSettings: ChatSettings,
): MessageManagementSettings =>
	normalizeMessageManagementSettings({
		...DEFAULT_MESSAGE_MANAGEMENT_SETTINGS,
		...(settings.messageManagement ?? {}),
		...(pluginChatSettings.messageManagement ?? {}),
	})

export const getChatDefaultFileContentOptions = (): ChatFileContentOptions => ({
	maxFileSize: 1024 * 1024,
	maxContentLength: 10000,
	includeExtensions: [],
	excludeExtensions: ['exe', 'dll', 'bin', 'zip', 'rar', 'tar', 'gz'],
	excludePatterns: [/node_modules/, /\.git/, /\.DS_Store/, /Thumbs\.db/],
})

export const serializeContextCompaction = (
	compaction: ChatContextCompactionState | null | undefined,
): string => JSON.stringify(compaction ?? null)

export const serializeRequestTokenState = (
	state: ChatRequestTokenState | null | undefined,
): string => JSON.stringify(state ?? null)

export const hasContextCompactionChanged = (
	current: ChatContextCompactionState | null | undefined,
	next: ChatContextCompactionState | null | undefined,
): boolean => serializeContextCompaction(current) !== serializeContextCompaction(next)

export const hasRequestTokenStateChanged = (
	current: ChatRequestTokenState | null | undefined,
	next: ChatRequestTokenState | null | undefined,
): boolean => serializeRequestTokenState(current) !== serializeRequestTokenState(next)

export const buildRequestTokenState = (params: {
	totalTokenEstimate: number
	messageTokenEstimate: number
	toolTokenEstimate: number
	userTurnTokenEstimate?: number
}): ChatRequestTokenState => ({
	totalTokenEstimate: params.totalTokenEstimate,
	messageTokenEstimate: params.messageTokenEstimate,
	toolTokenEstimate: params.toolTokenEstimate,
	userTurnTokenEstimate: params.userTurnTokenEstimate,
	updatedAt: Date.now(),
})

export const normalizeContextCompactionState = (
	compaction: ChatContextCompactionState | null,
	hasRawContextMessage: boolean,
): ChatContextCompactionState | null => {
	let nextCompaction = compaction
	if (!hasRawContextMessage && nextCompaction) {
		nextCompaction = {
			...nextCompaction,
			contextSummary: undefined,
			contextSourceSignature: undefined,
			contextTokenEstimate: undefined,
		}
	}

	if (
		nextCompaction
		&& nextCompaction.coveredRange.messageCount === 0
		&& !nextCompaction.summary.trim()
		&& !nextCompaction.contextSummary
		&& !nextCompaction.overflowedProtectedLayers
	) {
		return null
	}

	return nextCompaction
}