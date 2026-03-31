import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChatService } from 'src/core/chat/services/chat-service';
import type { SlashCommandItem } from 'src/core/chat/types/slashCommand';
import type { ChatState } from 'src/domains/chat/types';
import { localInstance } from 'src/i18n/locals';
import { ChatInputFooter } from './ChatInputFooter';
import { ChatInputOverlays } from './ChatInputOverlays';
import {
	ChatInputFileTags,
	ChatInputImagePreview,
	ChatInputInfoTags,
	ChatInputSelectedModelsHint,
} from './ChatInputSubComponents';
import {
	replaceTriggerText,
	type ChatInputAnchorPosition,
	type ChatInputSelectorItem,
	type ChatInputTriggerSource,
} from './chatInputSelectorUtils';
import {
	useChatInputMention,
	type MentionSelectorPayload,
} from './useChatInputMention';
import { useChatInputActions } from './useChatInputActions';
import { useChatInputAttachmentTransfer } from './useChatInputAttachmentTransfer';
import { useChatInputImageUpload } from './useChatInputImageUpload';
import { useChatInputKeyboard } from './useChatInputKeyboard';
import { useChatInputSlashCommand } from './useChatInputSlashCommand';
import { useChatInputTriggerMenu } from './useChatInputTriggerMenu';

interface ChatInputProps {
	service: ChatService;
	state: ChatState;
}

export const ChatInput = ({ service, state }: ChatInputProps) => {
	const [value, setValue] = useState(state.inputValue);
	const [cursorIndex, setCursorIndex] = useState(state.inputValue.length);
	const [maxHeight, setMaxHeight] = useState(80);
	const [isImageGenerationIntent, setIsImageGenerationIntent] = useState(false);
	const [templateMenuVisible, setTemplateMenuVisible] = useState(false);
	const [fileMenuVisible, setFileMenuVisible] = useState(false);
	const [secondaryMenuAnchor, setSecondaryMenuAnchor] = useState<ChatInputAnchorPosition | null>(null);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const isMultiModel = state.multiModelMode !== 'single';

	const { slashCommandItems, executeSlashCommand } = useChatInputSlashCommand(service);
	const {
		mentionItems,
		promptTemplateEntries,
		selectMentionItem,
	} = useChatInputMention(service);
	const {
		imageInputRef,
		handleImageInputChange,
		openImagePicker,
	} = useChatInputImageUpload(service, () => {
		textareaRef.current?.focus();
	});
	const {
		isDragOver,
		handleDragEnter,
		handleDragOver,
		handleDragLeave,
		handleDrop,
		handlePaste,
	} = useChatInputAttachmentTransfer({
		service,
		onComplete: () => {
			textareaRef.current?.focus();
		},
	});
	const {
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
	} = useChatInputActions({
		service,
		state,
		value,
		isMultiModel,
		textareaRef,
	});

	const slashSelectorItems = useMemo<ChatInputSelectorItem<SlashCommandItem>[]>(
		() => slashCommandItems.map((item) => ({
			id: `${item.type}-${item.name}`,
			name: item.name,
			description: item.description,
			kind: item.type,
			typeLabel:
				item.type === 'skill'
					? localInstance.chat_input_selector_type_skill
					: localInstance.chat_input_selector_type_agent,
			keywords: [item.name, item.description],
			payload: item,
		})),
		[slashCommandItems],
	);

	const selectorSources = useMemo<ChatInputTriggerSource[]>(
		() => [
			{
				key: 'slash',
				trigger: '/',
				items: slashSelectorItems,
				emptyText: localInstance.slash_command_empty,
				noMatchText: localInstance.slash_command_no_match,
			},
			{
				key: 'mention',
				trigger: '@',
				items: mentionItems,
				emptyText: '',
				noMatchText: localInstance.chat_mention_no_match,
			},
		],
		[mentionItems, slashSelectorItems],
	);

	const {
		activeMatch,
		activeSourceKey,
		filterText,
		selectedIndex,
		setSelectedIndex,
		anchorPosition: triggerAnchorPosition,
		menuPosition,
		visible: selectorVisible,
		filteredItems,
		emptyStateText,
		closeMenu,
	} = useChatInputTriggerMenu(value, cursorIndex, state.isGenerating, textareaRef, selectorSources);

	useEffect(() => {
		setIsImageGenerationIntent(service.detectImageGenerationIntent(value));
	}, [service, value]);

	useEffect(() => {
		const calculateMaxHeight = () => {
			setMaxHeight(Math.floor(window.innerHeight / 4));
		};

		calculateMaxHeight();
		window.addEventListener('resize', calculateMaxHeight);
		return () => window.removeEventListener('resize', calculateMaxHeight);
	}, []);

	useEffect(() => {
		const textarea = textareaRef.current;
		if (!textarea) {
			return;
		}

		textarea.style.height = 'auto';
		const nextHeight = Math.min(textarea.scrollHeight, maxHeight);
		textarea.style.height = `${nextHeight}px`;
	}, [maxHeight, value]);

	useEffect(() => {
		setValue(state.inputValue);
	}, [state.inputValue]);

	useEffect(() => {
		const textarea = textareaRef.current;
		if (!textarea) {
			return;
		}

		setCursorIndex(textarea.selectionStart ?? 0);
	}, [value]);

	useEffect(() => {
		if (!selectorVisible) {
			return;
		}

		setTemplateMenuVisible(false);
		setFileMenuVisible(false);
	}, [selectorVisible]);

	useEffect(() => {
		const handleShortcut = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				if (templateMenuVisible) {
					setTemplateMenuVisible(false);
					window.requestAnimationFrame(() => textareaRef.current?.focus());
					return;
				}
				if (fileMenuVisible) {
					setFileMenuVisible(false);
					window.requestAnimationFrame(() => textareaRef.current?.focus());
					return;
				}
				if (selectorVisible) {
					closeMenu();
					return;
				}
			}

			if (!isMultiModel || (!event.ctrlKey && !event.metaKey)) {
				return;
			}

			if (event.key === '1') {
				event.preventDefault();
				service.setLayoutMode('horizontal');
			} else if (event.key === '2') {
				event.preventDefault();
				service.setLayoutMode('tabs');
			} else if (event.key === '3') {
				event.preventDefault();
				service.setLayoutMode('vertical');
			}
		};

		window.addEventListener('keydown', handleShortcut);
		return () => window.removeEventListener('keydown', handleShortcut);
	}, [closeMenu, fileMenuVisible, isMultiModel, selectorVisible, service, templateMenuVisible]);

	const applyInputValue = useCallback(
		(nextValue: string, selectionStart?: number) => {
			setValue(nextValue);
			service.setInputValue(nextValue);

			if (typeof selectionStart !== 'number') {
				return;
			}

			setCursorIndex(selectionStart);

			window.requestAnimationFrame(() => {
				const textarea = textareaRef.current;
				if (!textarea) {
					return;
				}

				textarea.focus();
				textarea.setSelectionRange(selectionStart, selectionStart);
			});
		},
		[service],
	);

	const replaceCurrentMentionToken = useCallback((shouldFocus = true) => {
		if (!activeMatch) {
			return;
		}

		const mentionCursorIndex =
			activeMatch.startIndex
			+ activeMatch.trigger.length
			+ activeMatch.filterText.length;
		const nextInput = replaceTriggerText(value, mentionCursorIndex, activeMatch);
		if (shouldFocus) {
			applyInputValue(nextInput.value, nextInput.selectionStart);
			return;
		}

		setValue(nextInput.value);
		setCursorIndex(nextInput.selectionStart);
		service.setInputValue(nextInput.value);
	}, [activeMatch, applyInputValue, service, value]);

	const resolveSecondaryAnchor = useCallback((): ChatInputAnchorPosition => {
		return triggerAnchorPosition ?? {
			top: menuPosition.top,
			left: menuPosition.left,
			lineHeight: 20,
		};
	}, [menuPosition, triggerAnchorPosition]);

	const syncCursorIndex = useCallback(() => {
		const textarea = textareaRef.current;
		if (!textarea) {
			return;
		}

		setCursorIndex(textarea.selectionStart ?? 0);
	}, []);

	const handleSelectorSelect = useCallback(
		(item: ChatInputSelectorItem) => {
			if (activeSourceKey === 'slash') {
				closeMenu();
				void executeSlashCommand(item.payload as SlashCommandItem);
				return;
			}

			if (activeSourceKey !== 'mention' || !activeMatch) {
				return;
			}

			const mentionItem = item as ChatInputSelectorItem<MentionSelectorPayload>;
			const anchor = resolveSecondaryAnchor();
			closeMenu();
			void (async () => {
				const result = await selectMentionItem(mentionItem);
				switch (result.action) {
					case 'open-template-menu':
						replaceCurrentMentionToken(false);
						setFileMenuVisible(false);
						setSecondaryMenuAnchor(anchor);
						setTemplateMenuVisible(true);
						return;
					case 'open-file-menu':
						replaceCurrentMentionToken(false);
						setTemplateMenuVisible(false);
						setSecondaryMenuAnchor(anchor);
						setFileMenuVisible(true);
						return;
					case 'upload-image':
						replaceCurrentMentionToken(false);
						setTemplateMenuVisible(false);
						setFileMenuVisible(false);
						openImagePicker();
						return;
					default:
						replaceCurrentMentionToken();
						textareaRef.current?.focus();
				}
			})();
		},
		[
			activeMatch,
			activeSourceKey,
			closeMenu,
			executeSlashCommand,
			openImagePicker,
			replaceCurrentMentionToken,
			resolveSecondaryAnchor,
			selectMentionItem,
		],
	);
	const handleKeyDown = useChatInputKeyboard({
		selectorVisible,
		filteredItems,
		selectedIndex,
		setSelectedIndex,
		handleSelectorSelect,
		closeMenu,
		handleSubmit: async () => {
			await handleSubmit();
		},
	});

	return (
		<Fragment>
			<form
				className={`chat-input tw-flex tw-w-full tw-flex-col tw-gap-2 tw-p-2 ${isDragOver ? 'chat-input--drag-over' : ''}`}
				style={{
					border: '1px solid var(--background-modifier-border)',
					borderRadius: 'var(--radius-m)',
				}}
				onSubmit={handleSubmit}
			>
				<ChatInputInfoTags
					selectedPromptTemplate={state.selectedPromptTemplate}
					selectedText={state.selectedText}
					onClearTemplate={() => service.clearSelectedPromptTemplate()}
					onClearSelectedText={handleClearSelectedText}
				/>

				{!state.isGenerating && isMultiModel && (
					<ChatInputSelectedModelsHint
						multiModelMode={state.multiModelMode}
						selectedModels={state.selectedModels}
						providers={providers}
						onRemoveModel={(tag) => service.removeSelectedModel(tag)}
					/>
				)}

				<textarea
					ref={textareaRef}
					className="chat-input__textarea tw-w-full tw-resize-none tw-p-3 tw-text-sm"
					style={{
						border: 'none',
						outline: 'none',
						background: 'transparent',
						resize: 'none',
						minHeight: '80px',
						maxHeight: `${maxHeight}px`,
						borderRadius: '0',
						boxShadow: 'none',
						marginBottom: '0',
						overflowY: 'auto',
					}}
						value={value}
						onChange={(event) => {
							setCursorIndex(event.target.selectionStart ?? 0);
							applyInputValue(event.target.value);
						}}
						onClick={syncCursorIndex}
						onDragEnter={handleDragEnter}
						onDragOver={handleDragOver}
						onDragLeave={handleDragLeave}
						onDrop={(event) => {
							void handleDrop(event);
						}}
					onKeyDown={handleKeyDown}
						onKeyUp={syncCursorIndex}
						onPaste={(event) => {
							void handlePaste(event);
						}}
						onSelect={syncCursorIndex}
					placeholder={localInstance.input_description_here}
					disabled={state.isGenerating}
				/>
				<ChatInputImagePreview
					images={state.selectedImages}
					onRemoveImage={handleRemoveImage}
				/>
				<ChatInputFileTags
					selectedFiles={state.selectedFiles}
					selectedFolders={state.selectedFolders}
					onRemoveFile={handleRemoveFile}
					onRemoveFolder={handleRemoveFolder}
				/>
				<ChatInputFooter
					service={service}
					state={state}
					isMultiModel={isMultiModel}
					providers={providers}
					submitActionLabel={submitActionLabel}
					multiModelProgress={multiModelProgress}
					isImageGenerationIntent={isImageGenerationIntent}
					onSubmit={() => {
						void handleSubmit();
					}}
				/>
			</form>

			<ChatInputOverlays
				service={service}
				imageInputRef={imageInputRef}
				onImageInputChange={(event) => {
					void handleImageInputChange(event);
				}}
				templateMenuVisible={templateMenuVisible}
				fileMenuVisible={fileMenuVisible}
				secondaryMenuAnchor={secondaryMenuAnchor}
				promptTemplateEntries={promptTemplateEntries}
				onCloseTemplateMenu={() => {
					setTemplateMenuVisible(false);
					textareaRef.current?.focus();
				}}
				onTemplateApplied={() => {
					textareaRef.current?.focus();
				}}
				onCloseFileMenu={() => {
					setFileMenuVisible(false);
					textareaRef.current?.focus();
				}}
				onSelectFile={handleFileSelect}
				onSelectFolder={handleFolderSelect}
				selectorItems={filteredItems}
				filterText={filterText}
				selectorVisible={selectorVisible}
				selectedIndex={selectedIndex}
				menuPosition={menuPosition}
				emptyStateText={emptyStateText}
				onSelectSelectorItem={handleSelectorSelect}
				onCloseSelector={closeMenu}
			/>
		</Fragment>
	);
};