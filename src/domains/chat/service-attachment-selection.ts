/**
 * @module chat/service-attachment-selection
 * @description 提供 chat 域附件选择与自动添加活跃文件的 node-safe 协作者。
 *
 * @dependencies src/domains/chat/types, src/domains/chat/service-state-store
 * @side-effects 更新 chat state 与 session 附件选择快照
 * @invariants 不直接依赖 obsidian；所有输入都使用 plain metadata。
 */

import { ChatStateStore } from './service-state-store';
import type { ChatSession, SelectedFile, SelectedFolder } from './types';

export interface AttachmentSelectionSnapshot {
	selectedFiles: SelectedFile[];
	selectedFolders: SelectedFolder[];
}

export interface ChatAttachmentFileInput {
	path: string;
	name: string;
	extension: string;
}

export interface ChatAttachmentFolderInput {
	path: string;
	name: string;
}

const cloneSelection = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const createSelectedFile = (
	file: ChatAttachmentFileInput,
	isAutoAdded = false,
): SelectedFile => {
	const selectedFile: SelectedFile = {
		id: file.path,
		name: file.name,
		path: file.path,
		extension: file.extension || '',
		type: 'file',
	};
	if (isAutoAdded) {
		selectedFile.isAutoAdded = true;
	}
	return selectedFile;
};

const createSelectedFolder = (
	folder: ChatAttachmentFolderInput,
): SelectedFolder => ({
	id: folder.path,
	name: folder.name,
	path: folder.path,
	type: 'folder',
});

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

	updateSelectionSnapshot(
		snapshot: AttachmentSelectionSnapshot,
		emit = true,
	): void {
		this.stateStore.mutate((state) => {
			state.selectedFiles = cloneSelection(snapshot.selectedFiles);
			state.selectedFolders = cloneSelection(snapshot.selectedFolders);
		}, emit);
	}

	updateSelectionToEmpty(emit = true): void {
		this.stateStore.mutate((state) => {
			state.selectedFiles = [];
			state.selectedFolders = [];
		}, emit);
	}

	syncSelectionToSession(session: ChatSession): void {
		const state = this.stateStore.getMutableState();
		session.selectedFiles = cloneSelection(state.selectedFiles);
		session.selectedFolders = cloneSelection(state.selectedFolders);
	}

	updateSelectionFromSession(session: ChatSession | null, emit = false): void {
		this.stateStore.mutate((state) => {
			state.selectedFiles = session?.selectedFiles
				? cloneSelection(session.selectedFiles)
				: [];
			state.selectedFolders = session?.selectedFolders
				? cloneSelection(session.selectedFolders)
				: [];
		}, emit);
	}

	updateSelectionWithFile(file: ChatAttachmentFileInput): void {
		const selectedFile = createSelectedFile(file);
		const state = this.stateStore.getMutableState();
		const exists = state.selectedFiles.some((item) => item.id === selectedFile.id);
		if (!exists) {
			this.stateStore.updateSelectedFiles([...state.selectedFiles, selectedFile], true);
			return;
		}
		this.stateStore.emit();
	}

	updateSelectionWithFolder(folder: ChatAttachmentFolderInput): void {
		const selectedFolder = createSelectedFolder(folder);
		const state = this.stateStore.getMutableState();
		const exists = state.selectedFolders.some((item) => item.id === selectedFolder.id);
		if (!exists) {
			this.stateStore.updateSelectedFolders(
				[...state.selectedFolders, selectedFolder],
				true,
			);
			return;
		}
		this.stateStore.emit();
	}

	updateSelectionWithoutFile(fileId: string, isManualRemoval = true): void {
		const state = this.stateStore.getMutableState();
		if (isManualRemoval) {
			const removedFile = state.selectedFiles.find((file) => file.id === fileId);
			if (removedFile?.isAutoAdded) {
				this.manuallyRemovedInCurrentSession = fileId;
			}
		}

		this.stateStore.updateSelectedFiles(
			state.selectedFiles.filter((file) => file.id !== fileId),
			true,
		);
	}

	updateSelectionWithoutFolder(folderId: string): void {
		const state = this.stateStore.getMutableState();
		this.stateStore.updateSelectedFolders(
			state.selectedFolders.filter((folder) => folder.id !== folderId),
			true,
		);
	}

	updateSelectedFiles(files: SelectedFile[]): void {
		this.stateStore.updateSelectedFiles(files, true);
	}

	updateSelectedFolders(folders: SelectedFolder[]): void {
		this.stateStore.updateSelectedFolders(folders, true);
	}

	syncActiveFileSelection(file: ChatAttachmentFileInput | null): void {
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

		const nextFiles = state.selectedFiles
			.filter((item) => !item.isAutoAdded)
			.concat(createSelectedFile(file, true));
		this.stateStore.updateSelectedFiles(nextFiles, true);
	}

	updateSelectionWithoutAutoAddedFile(filePath: string): void {
		const state = this.stateStore.getMutableState();
		const exists = state.selectedFiles.some(
			(file) => file.id === filePath && file.isAutoAdded,
		);
		if (!exists) {
			return;
		}
		this.stateStore.updateSelectedFiles(
			state.selectedFiles.filter((file) => file.id !== filePath),
			true,
		);
	}

	updateSelectionWithoutAutoAddedFiles(): void {
		const state = this.stateStore.getMutableState();
		this.stateStore.updateSelectedFiles(
			state.selectedFiles.filter((file) => !file.isAutoAdded),
			true,
		);
	}

	getAutoAddedFiles(): SelectedFile[] {
		return this.stateStore.getMutableState().selectedFiles.filter(
			(file) => file.isAutoAdded,
		);
	}

	onNoActiveFile(): void {
		this.currentActiveFilePath = null;
		this.manuallyRemovedInCurrentSession = null;
	}

	onChatViewReopened(currentFile: ChatAttachmentFileInput | null): void {
		if (!currentFile) {
			return;
		}
		if (this.manuallyRemovedInCurrentSession === currentFile.path) {
			this.manuallyRemovedInCurrentSession = null;
		}
		this.currentActiveFilePath = currentFile.path;
	}
}