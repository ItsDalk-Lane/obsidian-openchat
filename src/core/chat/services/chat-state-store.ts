import {
	ChatStateStore as DomainChatStateStore,
	type ChatStateSubscriber,
} from 'src/domains/chat/service-state-store'
import type {
	ChatSession,
	ChatState,
	McpToolMode,
	SelectedFile,
	SelectedFolder,
} from '../types/chat'

export type { ChatStateSubscriber }

export class ChatStateStore extends DomainChatStateStore {
	constructor(state: ChatState) {
		super(state)
	}

	batchUpdate(updater: (state: ChatState) => void): void {
		this.updateBatch(updater)
	}

	setActiveSession(session: ChatSession | null, emit = false): void {
		this.updateActiveSession(session, emit)
	}

	setGenerating(isGenerating: boolean, emit = false): void {
		this.updateGenerating(isGenerating, emit)
	}

	setError(error: string | undefined, emit = false): void {
		this.updateError(error, emit)
	}

	setSelectedFiles(files: SelectedFile[], emit = false): void {
		this.updateSelectedFiles(files, emit)
	}

	setSelectedFolders(folders: SelectedFolder[], emit = false): void {
		this.updateSelectedFolders(folders, emit)
	}

	setMcpToolMode(mode: McpToolMode, emit = false): void {
		this.updateMcpToolMode(mode, emit)
	}

	setParallelResponses(group: ChatState['parallelResponses'], emit = false): void {
		this.updateParallelResponses(group, emit)
	}

	setShouldSaveHistory(shouldSaveHistory: boolean, emit = false): void {
		this.updateShouldSaveHistory(shouldSaveHistory, emit)
	}
}