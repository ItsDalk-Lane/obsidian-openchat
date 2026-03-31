import type {
	ChatSession,
	ChatState,
	SelectedFile,
	SelectedFolder,
} from './types'

export type ChatStateSubscriber = (state: ChatState) => void

const cloneState = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

export class ChatStateStore {
	private readonly subscribers = new Set<ChatStateSubscriber>()

	constructor(private state: ChatState) {}

	getMutableState(): ChatState {
		return this.state
	}

	getState(): ChatState {
		return cloneState(this.state)
	}

	snapshot(): ChatState {
		return this.getState()
	}

	subscribe(callback: ChatStateSubscriber): () => void {
		this.subscribers.add(callback)
		callback(this.getState())
		return () => {
			this.subscribers.delete(callback)
		}
	}

	emit(): void {
		const snapshot = this.getState()
		for (const subscriber of this.subscribers) {
			subscriber(snapshot)
		}
	}

	dispose(): void {
		this.subscribers.clear()
	}

	mutate(mutator: (state: ChatState) => void, emit = false): void {
		mutator(this.state)
		if (emit) {
			this.emit()
		}
	}

	updateBatch(updater: (state: ChatState) => void): void {
		updater(this.state)
		this.emit()
	}

	updateActiveSession(session: ChatSession | null, emit = false): void {
		this.state.activeSession = session
		if (emit) {
			this.emit()
		}
	}

	updateGenerating(isGenerating: boolean, emit = false): void {
		this.state.isGenerating = isGenerating
		if (emit) {
			this.emit()
		}
	}

	updateError(error: string | undefined, emit = false): void {
		this.state.error = error
		if (emit) {
			this.emit()
		}
	}

	updateSelectedFiles(files: SelectedFile[], emit = false): void {
		this.state.selectedFiles = files
		if (emit) {
			this.emit()
		}
	}

	updateSelectedFolders(folders: SelectedFolder[], emit = false): void {
		this.state.selectedFolders = folders
		if (emit) {
			this.emit()
		}
	}

	updateParallelResponses(group: ChatState['parallelResponses'], emit = false): void {
		this.state.parallelResponses = group
		if (emit) {
			this.emit()
		}
	}

	updateShouldSaveHistory(shouldSaveHistory: boolean, emit = false): void {
		this.state.shouldSaveHistory = shouldSaveHistory
		if (emit) {
			this.emit()
		}
	}
}
