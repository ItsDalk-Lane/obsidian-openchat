import { FILE_EXTENSION_LANGUAGE_MAP } from 'src/core/chat/services/file-content-language-map';
import { DebugLogger } from 'src/utils/DebugLogger';

const IMAGE_EXTENSIONS = new Set([
	'png',
	'jpg',
	'jpeg',
	'gif',
	'webp',
	'bmp',
	'svg',
]);

const TEXT_DOCUMENT_EXTENSIONS = new Set([
	...Object.keys(FILE_EXTENSION_LANGUAGE_MAP),
	'cjs',
	'cts',
	'env',
	'mjs',
	'mts',
	'svelte',
	'vue',
	'astro',
	'lock',
]);

const SPECIAL_TEXT_FILE_NAMES = new Set([
	'.editorconfig',
	'.gitattributes',
	'.gitignore',
	'.npmrc',
	'.nvmrc',
	'dockerfile',
	'license',
	'makefile',
]);

const DEFAULT_IMPORTED_DOCUMENT_NAME = 'pasted-file.txt';
const DEFAULT_IMPORTED_IMAGE_NAME = 'pasted-image.png';

interface ElectronFile extends File {
	path?: string;
}

interface FileSystemEntryBase {
	readonly isDirectory: boolean;
	readonly isFile: boolean;
	readonly name: string;
	readonly fullPath: string;
}

interface FileSystemFileEntryLike extends FileSystemEntryBase {
	readonly isDirectory: false;
	readonly isFile: true;
	file(
		successCallback: (file: File) => void,
		errorCallback?: (error: DOMException) => void,
	): void;
}

interface FileSystemDirectoryReaderLike {
	readEntries(
		successCallback: (entries: FileSystemEntryLike[]) => void,
		errorCallback?: (error: DOMException) => void,
	): void;
}

interface FileSystemDirectoryEntryLike extends FileSystemEntryBase {
	readonly isDirectory: true;
	readonly isFile: false;
	createReader(): FileSystemDirectoryReaderLike;
}

type FileSystemEntryLike = FileSystemFileEntryLike | FileSystemDirectoryEntryLike;

interface DataTransferItemWithEntry extends DataTransferItem {
	webkitGetAsEntry?: () => FileSystemEntryLike | null;
}

export type ChatInputAttachmentKind = 'document' | 'image' | 'unsupported';

export type ChatInputAttachmentSource =
	| {
		kind: 'document';
		name: string;
		mimeType?: string;
		absolutePath?: string;
		readText: () => Promise<string>;
	}
	| {
		kind: 'image';
		name: string;
		mimeType?: string;
		absolutePath?: string;
		readDataUrl: () => Promise<string>;
	}
	| {
		kind: 'unsupported';
		name: string;
		mimeType?: string;
		absolutePath?: string;
	};

const normalizeBaseName = (value: string): string => value.trim().toLowerCase();

const getFileExtension = (fileName: string): string => {
	const normalized = normalizeBaseName(fileName);
	const dotIndex = normalized.lastIndexOf('.');
	return dotIndex > 0 ? normalized.slice(dotIndex + 1) : '';
};

const guessImageMimeType = (fileName: string): string => {
	switch (getFileExtension(fileName)) {
		case 'bmp':
			return 'image/bmp';
		case 'gif':
			return 'image/gif';
		case 'jpg':
		case 'jpeg':
			return 'image/jpeg';
		case 'svg':
			return 'image/svg+xml';
		case 'webp':
			return 'image/webp';
		default:
			return 'image/png';
	}
};

const toArrayBuffer = (value: Uint8Array): ArrayBuffer => {
	return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
};

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
	let binary = '';
	const bytes = new Uint8Array(buffer);
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return window.btoa(binary);
};

const arrayBufferToDataUrl = (buffer: ArrayBuffer, mimeType: string): string => {
	return `data:${mimeType};base64,${arrayBufferToBase64(buffer)}`;
};

export const fileToBase64 = async (file: File): Promise<string> => {
	return await new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result as string);
		reader.onerror = () => reject(reader.error);
		reader.readAsDataURL(file);
	});
};

const resolveAttachmentSourceName = (fileName: string, mimeType?: string): string => {
	const trimmedName = fileName.trim();
	if (trimmedName.length > 0) {
		return trimmedName;
	}
	if (mimeType?.startsWith('image/')) {
		return DEFAULT_IMPORTED_IMAGE_NAME;
	}
	return DEFAULT_IMPORTED_DOCUMENT_NAME;
};

export const getChatInputAttachmentKind = (
	fileName: string,
	mimeType?: string,
): ChatInputAttachmentKind => {
	const normalizedName = normalizeBaseName(fileName);
	const extension = getFileExtension(fileName);
	if (mimeType?.startsWith('image/') || IMAGE_EXTENSIONS.has(extension)) {
		return 'image';
	}
	if (
		mimeType?.startsWith('text/')
		|| TEXT_DOCUMENT_EXTENSIONS.has(extension)
		|| SPECIAL_TEXT_FILE_NAMES.has(normalizedName)
	) {
		return 'document';
	}
	return 'unsupported';
};

const createAbsolutePathAttachmentSource = (absolutePath: string): ChatInputAttachmentSource => {
	const name = resolveAttachmentSourceName(absolutePath.replace(/.*[\\/]/u, ''));
	const kind = getChatInputAttachmentKind(name);
	if (kind === 'image') {
		return {
			kind,
			name,
			absolutePath,
			mimeType: guessImageMimeType(name),
			readDataUrl: async () => {
				const fs = await import('node:fs/promises');
				const buffer = await fs.readFile(absolutePath);
				return arrayBufferToDataUrl(toArrayBuffer(buffer), guessImageMimeType(name));
			},
		};
	}
	if (kind === 'document') {
		return {
			kind,
			name,
			absolutePath,
			mimeType: 'text/plain',
			readText: async () => {
				const fs = await import('node:fs/promises');
				return await fs.readFile(absolutePath, 'utf8');
			},
		};
	}
	return { kind, name, absolutePath };
};

const createBrowserFileAttachmentSource = (file: File): ChatInputAttachmentSource => {
	const typedFile = file as ElectronFile;
	const name = resolveAttachmentSourceName(file.name, file.type);
	const kind = getChatInputAttachmentKind(name, file.type);
	if (kind === 'image') {
		return {
			kind,
			name,
			mimeType: file.type,
			absolutePath: typedFile.path,
			readDataUrl: async () => await fileToBase64(file),
		};
	}
	if (kind === 'document') {
		return {
			kind,
			name,
			mimeType: file.type,
			absolutePath: typedFile.path,
			readText: async () => await file.text(),
		};
	}
	return {
		kind,
		name,
		mimeType: file.type,
		absolutePath: typedFile.path,
	};
};

const looksLikeAbsolutePathText = (value: string): boolean => {
	const trimmed = value.trim();
	if (!trimmed) {
		return false;
	}
	return trimmed.startsWith('file://')
		|| /^[a-zA-Z]:[\\/]/u.test(trimmed)
		|| trimmed.startsWith('/');
};

export const extractAbsolutePathsFromClipboardText = (value: string): string[] => {
	return value
		.split(/\r?\n/gu)
		.map((entry) => entry.trim())
		.filter(Boolean)
		.map((entry) => entry.replace(/^"+|"+$/gu, ''))
		.map((entry) => {
			if (entry.startsWith('file://')) {
				const decoded = decodeURIComponent(entry.replace(/^file:\/+/u, ''));
				return decoded.replace(/^\/([a-zA-Z]:[\\/])/u, '$1');
			}
			return entry;
		})
		.filter((entry) => looksLikeAbsolutePathText(entry));
};

const collectClipboardPathAttachmentSources = async (
	text: string,
): Promise<ChatInputAttachmentSource[]> => {
	const candidatePaths = extractAbsolutePathsFromClipboardText(text);
	if (candidatePaths.length === 0) {
		return [];
	}
	const fs = await import('node:fs/promises');
	const sources: ChatInputAttachmentSource[] = [];
	for (const candidatePath of candidatePaths) {
		try {
			const stats = await fs.stat(candidatePath);
			if (!stats.isFile()) {
				continue;
			}
			sources.push(createAbsolutePathAttachmentSource(candidatePath));
		} catch (error) {
			DebugLogger.warn('[ChatInput] 跳过无法读取的剪贴板路径', { candidatePath, error });
		}
	}
	return sources;
};

const readFileEntry = async (entry: FileSystemFileEntryLike): Promise<File | null> => {
	return await new Promise((resolve) => {
		entry.file(
			(file) => resolve(file),
			() => resolve(null),
		);
	});
};

const readDirectoryEntries = async (
	reader: FileSystemDirectoryReaderLike,
): Promise<FileSystemEntryLike[]> => {
	const entries: FileSystemEntryLike[] = [];
	let hasMoreEntries = true;
	while (hasMoreEntries) {
		const batch = await new Promise<FileSystemEntryLike[]>((resolve) => {
			reader.readEntries(
				(nextEntries) => resolve(nextEntries),
				() => resolve([]),
			);
		});
		hasMoreEntries = batch.length > 0;
		if (hasMoreEntries) {
			entries.push(...batch);
		}
	}
	return entries;
};

const collectEntryAttachmentSources = async (
	entry: FileSystemEntryLike,
): Promise<ChatInputAttachmentSource[]> => {
	if (entry.isFile) {
		const file = await readFileEntry(entry);
		return file ? [createBrowserFileAttachmentSource(file)] : [];
	}
	const reader = entry.createReader();
	const directoryEntries = await readDirectoryEntries(reader);
	const nestedSources = await Promise.all(
		directoryEntries.map(async (childEntry) => await collectEntryAttachmentSources(childEntry)),
	);
	return nestedSources.flat();
};

export const collectChatInputAttachmentSourcesFromDataTransfer = async (
	dataTransfer: DataTransfer,
): Promise<ChatInputAttachmentSource[]> => {
	const sources: ChatInputAttachmentSource[] = [];
	const items = Array.from(dataTransfer.items ?? []);
	if (items.length > 0) {
		for (const item of items) {
			if (item.kind !== 'file') {
				continue;
			}
			const typedItem = item as DataTransferItemWithEntry;
			const entry = typedItem.webkitGetAsEntry?.() ?? null;
			if (entry) {
				sources.push(...await collectEntryAttachmentSources(entry));
				continue;
			}
			const file = item.getAsFile();
			if (file) {
				sources.push(createBrowserFileAttachmentSource(file));
			}
		}
		return sources;
	}
	return Array.from(dataTransfer.files ?? []).map((file) => createBrowserFileAttachmentSource(file));
};

export const hasFileTransferPayload = (dataTransfer: DataTransfer | null): boolean => {
	if (!dataTransfer) {
		return false;
	}
	if ((dataTransfer.files?.length ?? 0) > 0) {
		return true;
	}
	return Array.from(dataTransfer.items ?? []).some((item) => item.kind === 'file');
};

export const hasClipboardAttachmentPayload = (clipboardData: DataTransfer | null): boolean => {
	if (!clipboardData) {
		return false;
	}
	if (hasFileTransferPayload(clipboardData)) {
		return true;
	}
	const uriList = clipboardData.getData('text/uri-list');
	if (uriList.trim().length > 0 && extractAbsolutePathsFromClipboardText(uriList).length > 0) {
		return true;
	}
	const plainText = clipboardData.getData('text/plain');
	return plainText.trim().length > 0 && extractAbsolutePathsFromClipboardText(plainText).length > 0;
};

export const collectChatInputAttachmentSourcesFromClipboard = async (
	clipboardData: DataTransfer,
): Promise<ChatInputAttachmentSource[]> => {
	const fileSources = Array.from(clipboardData.files ?? []).map((file) => createBrowserFileAttachmentSource(file));
	if (fileSources.length > 0) {
		return fileSources;
	}
	const itemFiles = Array.from(clipboardData.items ?? [])
		.filter((item) => item.kind === 'file')
		.map((item) => item.getAsFile())
		.filter((file): file is File => file instanceof File)
		.map((file) => createBrowserFileAttachmentSource(file));
	if (itemFiles.length > 0) {
		return itemFiles;
	}
	const uriList = clipboardData.getData('text/uri-list');
	const uriSources = await collectClipboardPathAttachmentSources(uriList);
	if (uriSources.length > 0) {
		return uriSources;
	}
	const plainText = clipboardData.getData('text/plain');
	return await collectClipboardPathAttachmentSources(plainText);
};