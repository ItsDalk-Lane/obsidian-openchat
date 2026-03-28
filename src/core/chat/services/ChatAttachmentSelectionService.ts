import type { TFile, TFolder } from 'obsidian';
import {
	ChatAttachmentSelectionService as DomainChatAttachmentSelectionService,
	type AttachmentSelectionSnapshot,
} from 'src/domains/chat/service-attachment-selection';
import type { ChatSession, SelectedFile, SelectedFolder } from '../types/chat';
import { ChatStateStore } from './ChatStateStore';

export type { AttachmentSelectionSnapshot };

export class ChatAttachmentSelectionService extends DomainChatAttachmentSelectionService {
	constructor(
		stateStore: ChatStateStore,
		isAutoAddActiveFileEnabled: () => boolean,
	) {
		super(stateStore, isAutoAddActiveFileEnabled);
	}

	restoreSelection(snapshot: AttachmentSelectionSnapshot, emit = true): void {
		this.updateSelectionSnapshot(snapshot, emit);
	}

	clearSelection(emit = true): void {
		this.updateSelectionToEmpty(emit);
	}

	applySessionSelection(session: ChatSession | null, emit = false): void {
		this.updateSelectionFromSession(session, emit);
	}

	addSelectedFile(file: TFile): void {
		this.updateSelectionWithFile(file);
	}

	addSelectedFolder(folder: TFolder): void {
		this.updateSelectionWithFolder(folder);
	}

	removeSelectedFile(fileId: string, isManualRemoval = true): void {
		this.updateSelectionWithoutFile(fileId, isManualRemoval);
	}

	removeSelectedFolder(folderId: string): void {
		this.updateSelectionWithoutFolder(folderId);
	}

	setSelectedFiles(files: SelectedFile[]): void {
		this.updateSelectedFiles(files);
	}

	setSelectedFolders(folders: SelectedFolder[]): void {
		this.updateSelectedFolders(folders);
	}

	addActiveFile(file: TFile | null): void {
		this.syncActiveFileSelection(file);
	}

	removeAutoAddedFile(filePath: string): void {
		this.updateSelectionWithoutAutoAddedFile(filePath);
	}

	removeAllAutoAddedFiles(): void {
		this.updateSelectionWithoutAutoAddedFiles();
	}
}