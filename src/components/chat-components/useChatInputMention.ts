import { useCallback, useEffect, useMemo, useState } from 'react';
import type { TFile } from 'obsidian';
import type { ChatService } from 'src/core/chat/services/chat-service';
import { useObsidianApp } from 'src/contexts/obsidianAppContext';
import { localInstance } from 'src/i18n/locals';
import type {
	ChatAttachmentFileInput,
	ChatAttachmentFolderInput,
} from 'src/domains/chat/service-attachment-selection';
import { DebugLogger } from 'src/utils/DebugLogger';
import type { ChatInputSelectorItem } from './chatInputSelectorUtils';
import {
	collectVaultEntries,
	getFileSecondaryText,
	getFolderSecondaryText,
	type FileMenuFileItem,
	type FileMenuFolderItem,
} from './fileMenuUtils';
import {
	listPromptTemplateEntries,
	type PromptTemplateEntry,
} from './promptTemplateUtils';

export type MentionActionType =
	| 'open-template-menu'
	| 'open-file-menu'
	| 'upload-image';

export interface MentionActionPayload {
	type: MentionActionType;
}

export interface PromptTemplateMentionPayload {
	type: 'prompt-template';
	path: string;
}

export interface FileMentionPayload extends ChatAttachmentFileInput {
	type: 'file';
}

export interface FolderMentionPayload extends ChatAttachmentFolderInput {
	type: 'folder';
}

export type MentionSelectorPayload =
	| MentionActionPayload
	| PromptTemplateMentionPayload
	| FileMentionPayload
	| FolderMentionPayload;

export interface MentionSelectionResult {
	action: 'handled' | MentionActionType;
}

export interface UseChatInputMentionReturn {
	mentionItems: ChatInputSelectorItem<MentionSelectorPayload>[];
	promptTemplateEntries: PromptTemplateEntry[];
	selectMentionItem: (
		item: ChatInputSelectorItem<MentionSelectorPayload>,
	) => Promise<MentionSelectionResult>;
}

const createMentionItem = (
	activeFile: TFile,
): ChatInputSelectorItem<FileMentionPayload> => ({
	id: `active:${activeFile.path}`,
	name: localInstance.chat_mention_active,
	description: activeFile.name,
	kind: 'active-file',
	typeLabel: localInstance.chat_input_selector_type_active,
	keywords: [activeFile.path, activeFile.basename, activeFile.name],
	showWhenSearching: false,
	sortPriority: 3,
	payload: {
		type: 'file',
		path: activeFile.path,
		name: activeFile.name,
		extension: activeFile.extension,
	},
});

const createMentionActionItems = (): ChatInputSelectorItem<MentionActionPayload>[] => [
	{
		id: 'mention-action-template',
		name: localInstance.chat_mention_action_template_name,
		description: localInstance.chat_mention_action_template_desc,
		kind: 'action-template',
		typeLabel: localInstance.chat_input_selector_type_template,
		showWhenSearching: false,
		sortPriority: 0,
		payload: { type: 'open-template-menu' },
	},
	{
		id: 'mention-action-upload-file',
		name: localInstance.chat_mention_action_upload_file_name,
		description: localInstance.chat_mention_action_upload_file_desc,
		kind: 'action-upload-file',
		typeLabel: localInstance.chat_input_selector_type_file,
		showWhenSearching: false,
		sortPriority: 1,
		payload: { type: 'open-file-menu' },
	},
	{
		id: 'mention-action-upload-image',
		name: localInstance.chat_mention_action_upload_image_name,
		description: localInstance.chat_mention_action_upload_image_desc,
		kind: 'action-upload-image',
		typeLabel: localInstance.chat_input_selector_type_image,
		showWhenSearching: false,
		sortPriority: 2,
		payload: { type: 'upload-image' },
	},
];

const createPromptTemplateMentionItems = (
	entries: ReadonlyArray<PromptTemplateEntry>,
): ChatInputSelectorItem<PromptTemplateMentionPayload>[] => entries.map((entry) => ({
	id: `prompt-template:${entry.path}`,
	name: entry.label,
	description: entry.preview,
	kind: 'prompt-template',
	typeLabel: localInstance.chat_input_selector_type_template,
	keywords: [entry.path, entry.label, entry.preview],
	showWhenEmpty: false,
	sortPriority: 0,
	payload: {
		type: 'prompt-template',
		path: entry.path,
	},
}));

const createFolderMentionItems = (
	folders: ReadonlyArray<FileMenuFolderItem>,
): ChatInputSelectorItem<FolderMentionPayload>[] => folders.map((folder) => ({
	id: `vault-folder:${folder.path}`,
	name: folder.name,
	description: getFolderSecondaryText(folder),
	kind: 'vault-folder',
	typeLabel: localInstance.chat_input_selector_type_folder,
	keywords: [folder.path, folder.name, folder.parentPath],
	showWhenEmpty: false,
	sortPriority: 1,
	payload: {
		type: 'folder',
		path: folder.path,
		name: folder.name,
	},
}));

const createFileMentionItems = (
	files: ReadonlyArray<FileMenuFileItem>,
): ChatInputSelectorItem<FileMentionPayload>[] => files.map((file) => ({
	id: `vault-file:${file.path}`,
	name: file.basename,
	description: getFileSecondaryText(file),
	kind: 'vault-file',
	typeLabel: localInstance.chat_input_selector_type_file,
	keywords: [file.path, file.name, file.basename, file.parentPath, file.extension],
	showWhenEmpty: false,
	sortPriority: 2,
	payload: {
		type: 'file',
		path: file.path,
		name: file.name,
		extension: file.extension,
	},
}));

export function useChatInputMention(
	service: ChatService,
): UseChatInputMentionReturn {
	const app = useObsidianApp();
	const obsidianApi = service.getObsidianApiProvider();
	const [activeFile, setActiveFile] = useState<TFile | null>(
		() => app.workspace.getActiveFile(),
	);
	const [promptTemplateEntries, setPromptTemplateEntries] = useState<PromptTemplateEntry[]>([]);
	const [vaultFiles, setVaultFiles] = useState<FileMenuFileItem[]>([]);
	const [vaultFolders, setVaultFolders] = useState<FileMenuFolderItem[]>([]);

	useEffect(() => {
		const refreshActiveFile = () => {
			setActiveFile(app.workspace.getActiveFile());
		};

		refreshActiveFile();
		const activeLeafRef = app.workspace.on('active-leaf-change', refreshActiveFile);
		const fileOpenRef = app.workspace.on('file-open', refreshActiveFile);

		return () => {
			app.workspace.offref(activeLeafRef);
			app.workspace.offref(fileOpenRef);
		};
	}, [app]);

	useEffect(() => {
		let isDisposed = false;
		let refreshTimer: number | null = null;

		const refreshMentionData = async () => {
			try {
				const [templates, vaultIndex] = await Promise.all([
					listPromptTemplateEntries(obsidianApi, service.getAiDataFolder()),
					Promise.resolve(collectVaultEntries(obsidianApi)),
				]);
				if (isDisposed) {
					return;
				}

				setPromptTemplateEntries(templates);
				setVaultFiles(vaultIndex.files);
				setVaultFolders(vaultIndex.folders);
			} catch (error) {
				DebugLogger.error('[ChatInput] 加载 mention 数据失败', error);
				if (isDisposed) {
					return;
				}

				setPromptTemplateEntries([]);
				setVaultFiles([]);
				setVaultFolders([]);
			}
		};

		void refreshMentionData();
		const unsubscribe = obsidianApi.onVaultChange(() => {
			if (refreshTimer !== null) {
				window.clearTimeout(refreshTimer);
			}
			refreshTimer = window.setTimeout(() => {
				void refreshMentionData();
			}, 150);
		});

		return () => {
			isDisposed = true;
			if (refreshTimer !== null) {
				window.clearTimeout(refreshTimer);
			}
			unsubscribe();
		};
	}, [obsidianApi, service]);

	const mentionItems = useMemo(
		() => {
			const activeFileItems = activeFile ? [createMentionItem(activeFile)] : [];
			return [
				...createMentionActionItems(),
				...activeFileItems,
				...createPromptTemplateMentionItems(promptTemplateEntries),
				...createFolderMentionItems(vaultFolders),
				...createFileMentionItems(vaultFiles),
			];
		},
		[activeFile, promptTemplateEntries, vaultFiles, vaultFolders],
	);

	const selectMentionItem = useCallback(
		async (
			item: ChatInputSelectorItem<MentionSelectorPayload>,
		): Promise<MentionSelectionResult> => {
			switch (item.kind) {
				case 'action-template':
					return { action: 'open-template-menu' };
				case 'action-upload-file':
					return { action: 'open-file-menu' };
				case 'action-upload-image':
					return { action: 'upload-image' };
				case 'prompt-template':
					await service.selectPromptTemplate(
						(item.payload as PromptTemplateMentionPayload).path,
					);
					return { action: 'handled' };
				case 'vault-folder':
					service.addSelectedFolder(item.payload as ChatAttachmentFolderInput);
					return { action: 'handled' };
				case 'active-file':
				case 'vault-file':
					service.addSelectedFile(item.payload as ChatAttachmentFileInput);
					return { action: 'handled' };
				default:
					return { action: 'handled' };
			}
		},
		[service],
	);

	return {
		mentionItems,
		promptTemplateEntries,
		selectMentionItem,
	};
}