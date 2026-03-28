import { CONTEXT_COMPACTION_VERSION } from './service-context-compaction-range'
import type {
	ChatContextCompactionState,
	ChatMessage,
	ChatSession,
	SelectedFile,
	SelectedFolder,
} from './types'

const isEphemeralContextMessage = (message: ChatMessage): boolean =>
	Boolean(message.metadata?.isEphemeralContext)

export const buildResolvedSelectionContext = (session: ChatSession): {
	selectedFiles: SelectedFile[]
	selectedFolders: SelectedFolder[]
} => {
	const fileMap = new Map<string, SelectedFile>()
	const folderMap = new Map<string, SelectedFolder>()

	for (const file of session.selectedFiles ?? []) {
		fileMap.set(file.path, file)
	}
	for (const folder of session.selectedFolders ?? []) {
		folderMap.set(folder.path, folder)
	}

	return {
		selectedFiles: Array.from(fileMap.values()),
		selectedFolders: Array.from(folderMap.values()),
	}
}

export const getLatestContextSourceMessage = (
	messages: ChatMessage[],
): ChatMessage | null => {
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		const message = messages[index]
		if (message.role !== 'user') {
			continue
		}
		if (message.metadata?.hiddenFromModel || isEphemeralContextMessage(message)) {
			continue
		}
		return message
	}
	return null
}

export const getStringMetadata = (
	message: ChatMessage | null | undefined,
	key: string,
): string | null => {
	const value = message?.metadata?.[key]
	return typeof value === 'string' ? value : null
}

export const hasBuildableContextPayload = (
	contextNotes: string[],
	selectedFiles: SelectedFile[],
	selectedFolders: SelectedFolder[],
	selectedText: string | null,
): boolean =>
	selectedFiles.length > 0
	|| selectedFolders.length > 0
	|| contextNotes.some((note) => (note ?? '').trim().length > 0)
	|| Boolean(selectedText?.trim())

export const mergeCompactionState = (
	base: ChatContextCompactionState | null,
	contextSummary: string,
	contextSourceSignature: string,
	contextTokenEstimate: number,
	totalTokenEstimate: number,
): ChatContextCompactionState => ({
	version: base?.version ?? CONTEXT_COMPACTION_VERSION,
	coveredRange: base?.coveredRange ?? {
		endMessageId: null,
		messageCount: 0,
		signature: '0',
	},
	summary: base?.summary ?? '',
	historyTokenEstimate: base?.historyTokenEstimate ?? 0,
	contextSummary,
	contextSourceSignature,
	contextTokenEstimate,
	totalTokenEstimate,
	updatedAt: Date.now(),
	droppedReasoningCount: base?.droppedReasoningCount ?? 0,
	overflowedProtectedLayers: base?.overflowedProtectedLayers ?? false,
})