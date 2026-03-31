/**
 * @module chat/service-attachment-selection
 * @description 提供 chat 域附件选择的 node-safe 协作者。
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

const normalizeSelectedFile = (file: Pick<SelectedFile, 'id' | 'name' | 'path' | 'extension'>): SelectedFile => ({
	id: file.id,
	name: file.name,
	path: file.path,
	extension: file.extension,
	type: 'file',
});

const normalizeSelectedFolder = (folder: Pick<SelectedFolder, 'id' | 'name' | 'path'>): SelectedFolder => ({
	id: folder.id,
	name: folder.name,
	path: folder.path,
	type: 'folder',
});

const cloneSelectedFiles = (files: readonly SelectedFile[]): SelectedFile[] =>
	files.map((file) => normalizeSelectedFile(file));

const cloneSelectedFolders = (folders: readonly SelectedFolder[]): SelectedFolder[] =>
	folders.map((folder) => normalizeSelectedFolder(folder));

const createSelectedFile = (
	file: ChatAttachmentFileInput,
): SelectedFile => {
	return {
		id: file.path,
		name: file.name,
		path: file.path,
		extension: file.extension || '',
		type: 'file',
	};
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
	constructor(private readonly stateStore: ChatStateStore) {}

	getSelectionSnapshot(): AttachmentSelectionSnapshot {
		const state = this.stateStore.getMutableState();
		return {
			selectedFiles: cloneSelectedFiles(state.selectedFiles),
			selectedFolders: cloneSelectedFolders(state.selectedFolders),
		};
	}

	updateSelectionSnapshot(
		snapshot: AttachmentSelectionSnapshot,
		emit = true,
	): void {
		this.stateStore.mutate((state) => {
			state.selectedFiles = cloneSelectedFiles(snapshot.selectedFiles);
			state.selectedFolders = cloneSelectedFolders(snapshot.selectedFolders);
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
		session.selectedFiles = cloneSelectedFiles(state.selectedFiles);
		session.selectedFolders = cloneSelectedFolders(state.selectedFolders);
	}

	updateSelectionFromSession(session: ChatSession | null, emit = false): void {
		this.stateStore.mutate((state) => {
			state.selectedFiles = session?.selectedFiles
				? cloneSelectedFiles(session.selectedFiles)
				: [];
			state.selectedFolders = session?.selectedFolders
				? cloneSelectedFolders(session.selectedFolders)
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

	updateSelectionWithoutFile(fileId: string): void {
		const state = this.stateStore.getMutableState();
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
		this.stateStore.updateSelectedFiles(cloneSelectedFiles(files), true);
	}

	updateSelectedFolders(folders: SelectedFolder[]): void {
		this.stateStore.updateSelectedFolders(cloneSelectedFolders(folders), true);
	}
}