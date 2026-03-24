import { TFile, TFolder } from 'obsidian';
import type { ChatSession, SelectedFile, SelectedFolder } from '../types/chat';
import { ChatStateStore } from './ChatStateStore';

export interface AttachmentSelectionSnapshot {
	selectedFiles: SelectedFile[];
	selectedFolders: SelectedFolder[];
}

const cloneSelection = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export class ChatAttachmentSelectionService {
	private currentActiveFilePath: string | null = null;
	private manuallyRemovedInCurrentSession: string | null = null;

	constructor(
		private readonly stateStore: ChatStateStore,
		private readonly isAutoAddActiveFileEnabled: () => boolean,
	) {}

	getSelectionSnapshot(): AttachmentSelectionSnapshot {
		const state = this.stateStore.getMutableState();
		return {
			selectedFiles: cloneSelection(state.selectedFiles),
			selectedFolders: cloneSelection(state.selectedFolders),
		};
	}

	restoreSelection(snapshot: AttachmentSelectionSnapshot, emit = true): void {
		this.stateStore.mutate((state) => {
			state.selectedFiles = cloneSelection(snapshot.selectedFiles);
			state.selectedFolders = cloneSelection(snapshot.selectedFolders);
		}, emit);
	}

	clearSelection(emit = true): void {
		this.stateStore.mutate((state) => {
			state.selectedFiles = [];
			state.selectedFolders = [];
		}, emit);
	}

	syncSelectionToSession(session: ChatSession): void {
		const state = this.stateStore.getMutableState();
		session.selectedFiles = [...state.selectedFiles];
		session.selectedFolders = [...state.selectedFolders];
	}

	applySessionSelection(session: ChatSession | null, emit = false): void {
		this.stateStore.mutate((state) => {
			state.selectedFiles = session?.selectedFiles ?? [];
			state.selectedFolders = session?.selectedFolders ?? [];
		}, emit);
	}

	addSelectedFile(file: TFile): void {
		const selectedFile: SelectedFile = {
			id: file.path,
			name: file.name,
			path: file.path,
			extension: file.extension || '',
			type: 'file',
		};

		const state = this.stateStore.getMutableState();
		const exists = state.selectedFiles.some((item) => item.id === selectedFile.id);
		if (!exists) {
			this.stateStore.setSelectedFiles([...state.selectedFiles, selectedFile], true);
		} else {
			this.stateStore.emit();
		}
	}

	addSelectedFolder(folder: TFolder): void {
		const selectedFolder: SelectedFolder = {
			id: folder.path,
			name: folder.name,
			path: folder.path,
			type: 'folder',
		};

		const state = this.stateStore.getMutableState();
		const exists = state.selectedFolders.some((item) => item.id === selectedFolder.id);
		if (!exists) {
			this.stateStore.setSelectedFolders([...state.selectedFolders, selectedFolder], true);
		} else {
			this.stateStore.emit();
		}
	}

	removeSelectedFile(fileId: string, isManualRemoval = true): void {
		const state = this.stateStore.getMutableState();
		if (isManualRemoval) {
			const removedFile = state.selectedFiles.find((file) => file.id === fileId);
			if (removedFile?.isAutoAdded) {
				this.manuallyRemovedInCurrentSession = fileId;
			}
		}

		this.stateStore.setSelectedFiles(
			state.selectedFiles.filter((file) => file.id !== fileId),
			true,
		);
	}

	removeSelectedFolder(folderId: string): void {
		const state = this.stateStore.getMutableState();
		this.stateStore.setSelectedFolders(
			state.selectedFolders.filter((folder) => folder.id !== folderId),
			true,
		);
	}

	setSelectedFiles(files: SelectedFile[]): void {
		this.stateStore.setSelectedFiles(files, true);
	}

	setSelectedFolders(folders: SelectedFolder[]): void {
		this.stateStore.setSelectedFolders(folders, true);
	}

	addActiveFile(file: TFile | null): void {
		if (!file || !this.isAutoAddActiveFileEnabled() || file.extension !== 'md') {
			return;
		}

		if (this.currentActiveFilePath !== file.path) {
			if (this.manuallyRemovedInCurrentSession !== file.path) {
				this.manuallyRemovedInCurrentSession = null;
			}
			this.currentActiveFilePath = file.path;
		}

		if (this.manuallyRemovedInCurrentSession === file.path) {
			return;
		}

		const state = this.stateStore.getMutableState();
		const exists = state.selectedFiles.some((item) => item.id === file.path);
		if (exists) {
			return;
		}

		const selectedFile: SelectedFile = {
			id: file.path,
			name: file.name,
			path: file.path,
			extension: file.extension || '',
			type: 'file',
			isAutoAdded: true,
		};

		const nextFiles = state.selectedFiles
			.filter((item) => !item.isAutoAdded)
			.concat(selectedFile);
		this.stateStore.setSelectedFiles(nextFiles, true);
	}

	removeAutoAddedFile(filePath: string): void {
		const state = this.stateStore.getMutableState();
		const exists = state.selectedFiles.some((file) => file.id === filePath && file.isAutoAdded);
		if (!exists) {
			return;
		}
		this.stateStore.setSelectedFiles(
			state.selectedFiles.filter((file) => file.id !== filePath),
			true,
		);
	}

	removeAllAutoAddedFiles(): void {
		const state = this.stateStore.getMutableState();
		this.stateStore.setSelectedFiles(
			state.selectedFiles.filter((file) => !file.isAutoAdded),
			true,
		);
	}

	getAutoAddedFiles(): SelectedFile[] {
		return this.stateStore.getMutableState().selectedFiles.filter((file) => file.isAutoAdded);
	}

	onNoActiveFile(): void {
		this.currentActiveFilePath = null;
		this.manuallyRemovedInCurrentSession = null;
	}

	onChatViewReopened(currentFile: TFile | null): void {
		if (!currentFile) {
			return;
		}
		if (this.manuallyRemovedInCurrentSession === currentFile.path) {
			this.manuallyRemovedInCurrentSession = null;
		}
		this.currentActiveFilePath = currentFile.path;
	}
}