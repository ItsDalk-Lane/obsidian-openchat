import type {
	ChatSession,
	ChatState,
	McpToolMode,
	SelectedFile,
	SelectedFolder,
} from '../types/chat';
import type { ParallelResponseGroup } from '../types/multiModel';

export type ChatStateSubscriber = (state: ChatState) => void;

const cloneState = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export class ChatStateStore {
	private readonly subscribers = new Set<ChatStateSubscriber>();

	constructor(private state: ChatState) {}

	getMutableState(): ChatState {
		return this.state;
	}

	getState(): ChatState {
		return cloneState(this.state);
	}

	snapshot(): ChatState {
		return this.getState();
	}

	subscribe(callback: ChatStateSubscriber): () => void {
		this.subscribers.add(callback);
		callback(this.getState());
		return () => {
			this.subscribers.delete(callback);
		};
	}

	emit(): void {
		const snapshot = this.getState();
		for (const subscriber of this.subscribers) {
			subscriber(snapshot);
		}
	}

	dispose(): void {
		this.subscribers.clear();
	}

	mutate(mutator: (state: ChatState) => void, emit = false): void {
		mutator(this.state);
		if (emit) {
			this.emit();
		}
	}

	/**
	 * 批量写入状态并自动 emit 一次
	 * 用于替代散落在各处的 `this.state.xxx = ...` + `this.emitState()` 组合
	 */
	batchUpdate(updater: (state: ChatState) => void): void {
		updater(this.state);
		this.emit();
	}

	setActiveSession(session: ChatSession | null, emit = false): void {
		this.state.activeSession = session;
		if (emit) {
			this.emit();
		}
	}

	setGenerating(isGenerating: boolean, emit = false): void {
		this.state.isGenerating = isGenerating;
		if (emit) {
			this.emit();
		}
	}

	setError(error: string | undefined, emit = false): void {
		this.state.error = error;
		if (emit) {
			this.emit();
		}
	}

	setSelectedFiles(files: SelectedFile[], emit = false): void {
		this.state.selectedFiles = files;
		if (emit) {
			this.emit();
		}
	}

	setSelectedFolders(folders: SelectedFolder[], emit = false): void {
		this.state.selectedFolders = folders;
		if (emit) {
			this.emit();
		}
	}

	setMcpToolMode(mode: McpToolMode, emit = false): void {
		this.state.mcpToolMode = mode;
		if (emit) {
			this.emit();
		}
	}

	setParallelResponses(group: ParallelResponseGroup | undefined, emit = false): void {
		this.state.parallelResponses = group;
		if (emit) {
			this.emit();
		}
	}

	setShouldSaveHistory(shouldSaveHistory: boolean, emit = false): void {
		this.state.shouldSaveHistory = shouldSaveHistory;
		if (emit) {
			this.emit();
		}
	}
}