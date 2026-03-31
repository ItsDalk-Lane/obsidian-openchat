import { useCallback, useMemo, type FormEvent, type RefObject } from 'react';
import type { ChatService } from 'src/core/chat/services/chat-service';
import type { ChatState } from 'src/domains/chat/types';
import { localInstance } from 'src/i18n/locals';

interface UseChatInputActionsOptions {
	service: ChatService;
	state: ChatState;
	value: string;
	isMultiModel: boolean;
	textareaRef: RefObject<HTMLTextAreaElement>;
}

export function useChatInputActions({
	service,
	state,
	value,
	isMultiModel,
	textareaRef,
}: UseChatInputActionsOptions) {
	const handleSubmit = useCallback(async (event?: FormEvent) => {
		event?.preventDefault();
		await service.sendMessage(value);
	}, [service, value]);

	const handleRemoveImage = useCallback((image: string) => service.removeSelectedImage(image), [service]);
	const handleRemoveFile = useCallback((fileId: string) => {
		service.deleteManagedImportedSelectedFile(fileId);
		service.removeSelectedFile(fileId);
	}, [service]);
	const handleRemoveFolder = useCallback((folderId: string) => service.removeSelectedFolder(folderId), [service]);
	const handleClearSelectedText = useCallback(() => service.clearSelectedText(), [service]);
	const handleFileSelect = useCallback((file: { path: string; name: string; extension: string }) => {
		service.addSelectedFile(file);
		textareaRef.current?.focus();
	}, [service, textareaRef]);
	const handleFolderSelect = useCallback((folder: { path: string; name: string }) => {
		service.addSelectedFolder(folder);
		textareaRef.current?.focus();
	}, [service, textareaRef]);

	const multiModelProgress = useMemo(() => {
		if (!state.parallelResponses || !isMultiModel) {
			return null;
		}

		const total = state.parallelResponses.responses.length;
		const completed = state.parallelResponses.responses.filter((response) => response.isComplete).length;
		const errors = state.parallelResponses.responses.filter((response) => response.isError).length;
		const generating = total - completed - errors;

		return { total, completed, errors, generating };
	}, [isMultiModel, state.parallelResponses]);

	const providers = service.getProviders();
	const hasConversationMessages =
		state.activeSession?.messages.some((message) => message.role !== 'system') ?? false;
	const submitActionLabel = hasConversationMessages
		? localInstance.chat_send_button_label
		: localInstance.chat_save_button_label;

	return {
		providers,
		submitActionLabel,
		multiModelProgress,
		handleSubmit,
		handleRemoveImage,
		handleRemoveFile,
		handleRemoveFolder,
		handleClearSelectedText,
		handleFileSelect,
		handleFolderSelect,
	};
}