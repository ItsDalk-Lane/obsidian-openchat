import { useCallback, useRef, type ChangeEvent } from 'react';
import type { ChatService } from 'src/core/chat/services/chat-service';
import { DebugLogger } from 'src/utils/DebugLogger';
import { fileToBase64 } from './chatInputAttachmentSources';

interface UseChatInputImageUploadReturn {
	imageInputRef: React.RefObject<HTMLInputElement>;
	openImagePicker: () => void;
	handleImageInputChange: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
}

export function useChatInputImageUpload(
	service: ChatService,
	onComplete?: () => void,
): UseChatInputImageUploadReturn {
	const imageInputRef = useRef<HTMLInputElement>(null);

	const openImagePicker = useCallback(() => {
		imageInputRef.current?.click();
	}, []);

	const handleImageInputChange = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
		const files = Array.from(event.target.files ?? []);
		if (files.length === 0) {
			event.target.value = '';
			onComplete?.();
			return;
		}

		const converted = await Promise.all(files.map(async (file) => {
			try {
				return await fileToBase64(file);
			} catch (error) {
				DebugLogger.error('[ChatInput] Failed to convert image to base64', error);
				return null;
			}
		}));

		const validImages = converted.filter(
			(item): item is string => typeof item === 'string' && item.length > 0,
		);
		if (validImages.length > 0) {
			service.addSelectedImages(validImages);
		}

		event.target.value = '';
		onComplete?.();
	}, [onComplete, service]);

	return {
		imageInputRef,
		openImagePicker,
		handleImageInputChange,
	};
}