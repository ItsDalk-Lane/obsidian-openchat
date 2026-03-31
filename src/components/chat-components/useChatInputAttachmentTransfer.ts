import {
	useCallback,
	useMemo,
	useRef,
	useState,
	type ClipboardEvent as ReactClipboardEvent,
	type DragEvent as ReactDragEvent,
} from 'react';
import type { SelectedFile } from 'src/core/chat/types/chat';
import type { ChatService } from 'src/core/chat/services/chat-service';
import { localInstance } from 'src/i18n/locals';
import { DebugLogger } from 'src/utils/DebugLogger';
import {
	buildChatInputAttachmentNoticeMessage,
	resolveChatInputAttachmentBatch,
	type ChatInputAttachmentHost,
} from './chatInputAttachmentTransfer';
import {
	collectChatInputAttachmentSourcesFromClipboard,
	collectChatInputAttachmentSourcesFromDataTransfer,
	hasClipboardAttachmentPayload,
	hasFileTransferPayload,
} from './chatInputAttachmentSources';

interface UseChatInputAttachmentTransferOptions {
	service: ChatService;
	onComplete?: () => void;
}

interface UseChatInputAttachmentTransferReturn {
	isDragOver: boolean;
	handleDragEnter: (event: ReactDragEvent<HTMLTextAreaElement>) => void;
	handleDragOver: (event: ReactDragEvent<HTMLTextAreaElement>) => void;
	handleDragLeave: (event: ReactDragEvent<HTMLTextAreaElement>) => void;
	handleDrop: (event: ReactDragEvent<HTMLTextAreaElement>) => Promise<void>;
	handlePaste: (event: ReactClipboardEvent<HTMLTextAreaElement>) => Promise<void>;
}

const toSelectedFile = (
	file: SelectedFile | {
		path: string;
		name: string;
		extension: string;
		attachmentSource?: SelectedFile['attachmentSource'];
	},
): SelectedFile => ({
	id: file.path,
	name: file.name,
	path: file.path,
	extension: file.extension,
	type: 'file',
	attachmentSource: file.attachmentSource,
});

const getErrorMessage = (error: unknown): string => {
	if (error instanceof Error && error.message.trim().length > 0) {
		return error.message;
	}
	return localInstance.unknown_error;
};

export function useChatInputAttachmentTransfer({
	service,
	onComplete,
}: UseChatInputAttachmentTransferOptions): UseChatInputAttachmentTransferReturn {
	const [isDragOver, setIsDragOver] = useState(false);
	const dragDepthRef = useRef(0);
	const attachmentHost = useMemo<ChatInputAttachmentHost>(() => {
		const obsidianApi = service.getObsidianApiProvider();
		return {
			getAiDataFolder: () => service.getAiDataFolder(),
			getVaultBasePath: () => service.getVaultBasePath(),
			ensureVaultFolder: async (folderPath) => await obsidianApi.ensureVaultFolder(folderPath),
			getVaultEntry: (path) => obsidianApi.getVaultEntry(path),
			normalizePath: (path) => obsidianApi.normalizePath(path),
			writeVaultFile: async (path, content) => await obsidianApi.writeVaultFile(path, content),
		};
	}, [service]);

	const notifyTransferResult = useCallback((params: {
		addedFiles: number;
		addedImages: number;
		unsupportedEntries: readonly string[];
		failedEntries: readonly string[];
	}) => {
		const message = buildChatInputAttachmentNoticeMessage(params);
		if (message) {
			service.getObsidianApiProvider().notify(message, 6000);
		}
	}, [service]);

	const commitAttachmentBatch = useCallback((params: {
		files: ReadonlyArray<{
			path: string;
			name: string;
			extension: string;
			attachmentSource?: SelectedFile['attachmentSource'];
		}>;
		images: readonly string[];
	}) => {
		const latestState = service.getState();
		let committedFiles = 0;
		if (params.files.length > 0) {
			const existingFilePaths = new Set(latestState.selectedFiles.map((file) => file.path));
			const nextFiles = [...latestState.selectedFiles];
			for (const file of params.files) {
				if (existingFilePaths.has(file.path)) {
					continue;
				}
				nextFiles.push(toSelectedFile(file));
				existingFilePaths.add(file.path);
				committedFiles += 1;
			}
			if (committedFiles > 0) {
				service.setSelectedFiles(nextFiles);
			}
		}

		const existingImages = new Set(latestState.selectedImages);
		let committedImages = 0;
		for (const image of params.images) {
			if (!existingImages.has(image)) {
				existingImages.add(image);
				committedImages += 1;
			}
		}
		if (params.images.length > 0) {
			service.addSelectedImages([...params.images]);
		}
		return { committedFiles, committedImages };
	}, [service]);

	const processAttachmentTransfer = useCallback(async (sources: ReadonlyArray<{
		name: string;
		mimeType?: string;
		absolutePath?: string;
		readDataUrl?: () => Promise<string>;
		readText?: () => Promise<string>;
	}>) => {
		if (sources.length === 0) {
			onComplete?.();
			return;
		}
		try {
			const batch = await resolveChatInputAttachmentBatch({
				host: attachmentHost,
				sources,
				existingSelectedFilePaths: new Set(service.getState().selectedFiles.map((file) => file.path)),
			});
			const { committedFiles, committedImages } = commitAttachmentBatch({
				files: batch.files,
				images: batch.images,
			});
			notifyTransferResult({
				addedFiles: committedFiles,
				addedImages: committedImages,
				unsupportedEntries: batch.unsupportedEntries,
				failedEntries: batch.failedEntries,
			});
		} catch (error) {
			DebugLogger.error('[ChatInput] 处理拖拽或粘贴附件失败', error);
			service.getObsidianApiProvider().notify(
				localInstance.chat_input_attachment_process_failed_prefix.replace(
					'{message}',
					getErrorMessage(error),
				),
				6000,
			);
		} finally {
			onComplete?.();
		}
	}, [attachmentHost, commitAttachmentBatch, notifyTransferResult, onComplete, service]);

	const handleDragEnter = useCallback((event: ReactDragEvent<HTMLTextAreaElement>) => {
		if (!hasFileTransferPayload(event.dataTransfer)) {
			return;
		}
		event.preventDefault();
		dragDepthRef.current += 1;
		setIsDragOver(true);
	}, []);

	const handleDragOver = useCallback((event: ReactDragEvent<HTMLTextAreaElement>) => {
		if (!hasFileTransferPayload(event.dataTransfer)) {
			return;
		}
		event.preventDefault();
		event.dataTransfer.dropEffect = 'copy';
		if (!isDragOver) {
			setIsDragOver(true);
		}
	}, [isDragOver]);

	const handleDragLeave = useCallback((event: ReactDragEvent<HTMLTextAreaElement>) => {
		if (!hasFileTransferPayload(event.dataTransfer)) {
			return;
		}
		event.preventDefault();
		dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
		if (dragDepthRef.current === 0) {
			setIsDragOver(false);
		}
	}, []);

	const handleDrop = useCallback(async (event: ReactDragEvent<HTMLTextAreaElement>) => {
		const { dataTransfer } = event;
		if (!hasFileTransferPayload(dataTransfer)) {
			return;
		}
		event.preventDefault();
		dragDepthRef.current = 0;
		setIsDragOver(false);
		const sources = await collectChatInputAttachmentSourcesFromDataTransfer(dataTransfer);
		await processAttachmentTransfer(sources);
	}, [processAttachmentTransfer]);

	const handlePaste = useCallback(async (event: ReactClipboardEvent<HTMLTextAreaElement>) => {
		const { clipboardData } = event;
		if (!hasClipboardAttachmentPayload(clipboardData)) {
			return;
		}
		event.preventDefault();
		const sources = await collectChatInputAttachmentSourcesFromClipboard(clipboardData);
		await processAttachmentTransfer(sources);
	}, [processAttachmentTransfer]);

	return {
		isDragOver,
		handleDragEnter,
		handleDragOver,
		handleDragLeave,
		handleDrop,
		handlePaste,
	};
}