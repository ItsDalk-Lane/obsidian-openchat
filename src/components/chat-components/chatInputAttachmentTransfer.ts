import type {
	ChatAttachmentFileInput,
} from 'src/domains/chat/service-attachment-selection';
import type { VaultEntry } from 'src/providers/providers.types';
import { localInstance } from 'src/i18n/locals';
import {
	getChatHistoryFilesPath,
	normalizeVaultPath,
} from 'src/utils/aiPathSupport';
import { DebugLogger } from 'src/utils/DebugLogger';
import { MANAGED_IMPORTED_ATTACHMENT_SOURCE } from 'src/core/chat/services/chat-managed-attachments';
import type { ChatInputAttachmentSource } from './chatInputAttachmentSources';

export interface ChatInputAttachmentBatchResult {
	files: ChatAttachmentFileInput[];
	images: string[];
	unsupportedEntries: string[];
	failedEntries: string[];
}

export interface ChatInputAttachmentHost {
	getAiDataFolder(): string;
	getVaultBasePath(): string | null;
	ensureVaultFolder(folderPath: string): Promise<string>;
	getVaultEntry(path: string): VaultEntry | null;
	normalizePath(path: string): string;
	writeVaultFile(path: string, content: string): Promise<void>;
}

const normalizeComparableFsPath = (value: string): string => value
	.replace(/\\/gu, '/')
	.replace(/\/+/gu, '/')
	.replace(/\/$/u, '');

const getFileExtension = (fileName: string): string => {
	const normalized = fileName.trim().toLowerCase();
	const dotIndex = normalized.lastIndexOf('.');
	return dotIndex > 0 ? normalized.slice(dotIndex + 1) : '';
};

const getUnsupportedEntryLabel = (fileName: string): string => {
	const extension = getFileExtension(fileName);
	return extension ? `.${extension}` : fileName;
};

const stripControlCharacters = (value: string): string => {
	return Array.from(value).map((character) => {
		const code = character.charCodeAt(0);
		return code < 32 ? '-' : character;
	}).join('');
};

const sanitizeVaultPathSegment = (value: string): string => {
	const sanitized = stripControlCharacters(value)
		.replace(/[<>:"/\\|?*]/gu, '-')
		.replace(/\s+/gu, ' ')
		.trim();
	return sanitized.length > 0 ? sanitized : 'attachment';
};

const hashText = (value: string): string => {
	let hash = 5381;
	for (const character of value) {
		hash = ((hash << 5) + hash) ^ character.charCodeAt(0);
	}
	return (hash >>> 0).toString(36);
};

export const resolveVaultPathFromAbsolutePath = (
	absolutePath: string,
	vaultBasePath: string | null,
): string | null => {
	if (!vaultBasePath) {
		return null;
	}
	const normalizedAbsolute = normalizeComparableFsPath(absolutePath);
	const normalizedBase = normalizeComparableFsPath(vaultBasePath);
	const comparableAbsolute = /^[a-zA-Z]:\//u.test(normalizedAbsolute)
		? normalizedAbsolute.toLowerCase()
		: normalizedAbsolute;
	const comparableBase = /^[a-zA-Z]:\//u.test(normalizedBase)
		? normalizedBase.toLowerCase()
		: normalizedBase;
	if (!comparableAbsolute.startsWith(`${comparableBase}/`)) {
		return null;
	}
	return normalizeVaultPath(normalizedAbsolute.slice(normalizedBase.length + 1));
};

const buildImportedDocumentPath = (
	importsRootPath: string,
	fileName: string,
	sourceIdentity: string,
): string => {
	const hashedName = `${hashText(sourceIdentity)}-${sanitizeVaultPathSegment(fileName)}`;
	return normalizeVaultPath(`${importsRootPath}/${hashedName}`);
};

export const resolveChatInputAttachmentBatch = async (params: {
	host: ChatInputAttachmentHost;
	sources: readonly ChatInputAttachmentSource[];
	existingSelectedFilePaths: ReadonlySet<string>;
}): Promise<ChatInputAttachmentBatchResult> => {
	const result: ChatInputAttachmentBatchResult = {
		files: [],
		images: [],
		unsupportedEntries: [],
		failedEntries: [],
	};
	const selectedFilePaths = new Set(params.existingSelectedFilePaths);
	const queuedImages = new Set<string>();
	const importsRootPath = params.host.normalizePath(
		getChatHistoryFilesPath(params.host.getAiDataFolder()),
	);
	let importsFolderEnsured = false;
	for (const [index, source] of params.sources.entries()) {
		if (source.kind === 'unsupported') {
			result.unsupportedEntries.push(getUnsupportedEntryLabel(source.name));
			continue;
		}
		if (source.kind === 'image') {
			try {
				const dataUrl = await source.readDataUrl();
				if (!queuedImages.has(dataUrl)) {
					queuedImages.add(dataUrl);
					result.images.push(dataUrl);
				}
			} catch (error) {
				DebugLogger.error('[ChatInput] 处理图片附件失败', { fileName: source.name, error });
				result.failedEntries.push(source.name);
			}
			continue;
		}

		const extension = getFileExtension(source.name);
		const mappedVaultPath = source.absolutePath
			? resolveVaultPathFromAbsolutePath(source.absolutePath, params.host.getVaultBasePath())
			: null;
		const existingVaultEntry = mappedVaultPath ? params.host.getVaultEntry(mappedVaultPath) : null;
		const resolvedPath = existingVaultEntry?.kind === 'file'
			? mappedVaultPath
			: buildImportedDocumentPath(
				importsRootPath,
				source.name,
				source.absolutePath ?? `${Date.now()}-${index}-${source.name}`,
			);
		if (!resolvedPath || selectedFilePaths.has(resolvedPath)) {
			continue;
		}
		const isManagedImport = !mappedVaultPath || existingVaultEntry?.kind !== 'file';
		try {
			if (isManagedImport) {
				if (!importsFolderEnsured) {
					await params.host.ensureVaultFolder(importsRootPath);
					importsFolderEnsured = true;
				}
				const content = await source.readText();
				await params.host.writeVaultFile(resolvedPath, content);
			}
			result.files.push({
				path: resolvedPath,
				name: source.name,
				extension,
				attachmentSource: isManagedImport ? MANAGED_IMPORTED_ATTACHMENT_SOURCE : undefined,
			});
			selectedFilePaths.add(resolvedPath);
		} catch (error) {
			DebugLogger.error('[ChatInput] 处理文本附件失败', { fileName: source.name, error });
			result.failedEntries.push(source.name);
		}
	}
	return result;
};

const buildAddedAttachmentSummary = (addedFiles: number, addedImages: number): string | null => {
	if (addedFiles > 0 && addedImages > 0) {
		return localInstance.chat_input_attachment_added_mixed
			.replace('{files}', String(addedFiles))
			.replace('{images}', String(addedImages));
	}
	if (addedFiles > 0) {
		return localInstance.chat_input_attachment_added_files.replace('{count}', String(addedFiles));
	}
	if (addedImages > 0) {
		return localInstance.chat_input_attachment_added_images.replace('{count}', String(addedImages));
	}
	return null;
};

export const buildChatInputAttachmentNoticeMessage = (params: {
	addedFiles: number;
	addedImages: number;
	unsupportedEntries: readonly string[];
	failedEntries: readonly string[];
}): string | null => {
	if (params.unsupportedEntries.length === 0 && params.failedEntries.length === 0) {
		return null;
	}
	const parts: string[] = [];
	const addedSummary = buildAddedAttachmentSummary(params.addedFiles, params.addedImages);
	if (addedSummary) {
		parts.push(addedSummary);
	}
	if (params.unsupportedEntries.length === 1) {
		parts.push(
			localInstance.chat_input_attachment_unsupported_type
				.replace('{extension}', params.unsupportedEntries[0] ?? ''),
		);
	} else if (params.unsupportedEntries.length > 1) {
		parts.push(
			localInstance.chat_input_attachment_unsupported_types
				.replace('{count}', String(params.unsupportedEntries.length))
				.replace('{extensions}', Array.from(new Set(params.unsupportedEntries)).join(', ')),
		);
	}
	if (params.failedEntries.length > 0) {
		parts.push(
			localInstance.chat_input_attachment_failed_count
				.replace('{count}', String(params.failedEntries.length)),
		);
	}
	return parts.join('; ');
};