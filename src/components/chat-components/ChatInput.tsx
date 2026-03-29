import { CornerDownLeft, StopCircle, Palette, RotateCw } from 'lucide-react';
import { FormEvent, useEffect, useState, useRef, Fragment, useMemo } from 'react';
import { ChatService } from 'src/core/chat/services/chat-service';
import type { ChatState } from 'src/domains/chat/types';
import { ModelSelector } from './ModelSelector';
import { TemplateSelector } from './TemplateSelector';
import { ContextUsageIndicator } from './ContextUsageIndicator';
import { SlashCommandMenu } from './SlashCommandMenu';
import { localInstance } from 'src/i18n/locals';
import { useChatInputSlashCommand } from './useChatInputSlashCommand';
import { ChatInputInfoTags, ChatInputImagePreview, ChatInputFileTags, ChatInputSelectedModelsHint } from './ChatInputSubComponents';

interface ChatInputProps {
	service: ChatService;
	state: ChatState;
}

export const ChatInput = ({ service, state }: ChatInputProps) => {
	const [value, setValue] = useState(state.inputValue);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const [maxHeight, setMaxHeight] = useState(80);

	const [isImageGenerationIntent, setIsImageGenerationIntent] = useState(false);
	const isMultiModel = state.multiModelMode !== 'single';

	// 斜杠命令状态（来自 hook）
	const {
		slashCommandVisible, setSlashCommandVisible,
		slashCommandItems, slashCommandFilter,
		slashCommandSelectedIndex, setSlashCommandSelectedIndex,
		slashCommandPosition, filteredSlashCommandItems,
		executeSlashCommand, closeSlashCommandMenu,
	} = useChatInputSlashCommand(service, value, state.isGenerating, textareaRef);

	useEffect(() => {
		setIsImageGenerationIntent(service.detectImageGenerationIntent(value));
	}, [service, value]);

	useEffect(() => {
		const calculateMaxHeight = () => {
			const viewportHeight = window.innerHeight;
			setMaxHeight(Math.floor(viewportHeight / 4));
		};
		calculateMaxHeight();
		window.addEventListener('resize', calculateMaxHeight);
		return () => window.removeEventListener('resize', calculateMaxHeight);
	}, []);

	useEffect(() => {
		const textarea = textareaRef.current;
		if (textarea) {
			textarea.style.height = 'auto';
			const newHeight = Math.min(textarea.scrollHeight, maxHeight);
			textarea.style.height = `${newHeight}px`;
		}
	}, [value, maxHeight]);

	useEffect(() => {
		setValue(state.inputValue);
	}, [state.inputValue]);

	useEffect(() => {
		const handleShortcut = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				// 关闭斜杠命令菜单
				if (slashCommandVisible) {
					setSlashCommandVisible(false);
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
	}, [isMultiModel, service, slashCommandVisible]);


	const handleSubmit = async (event?: FormEvent) => {
		event?.preventDefault();
		await service.sendMessage(value);
	};

	const handleRemoveImage = (image: string) => service.removeSelectedImage(image);
	const handleRemoveFile = (fileId: string) => service.removeSelectedFile(fileId);
	const handleRemoveFolder = (folderId: string) => service.removeSelectedFolder(folderId);
	const handleClearSelectedText = () => service.clearSelectedText();

	const handleTemplateSelect = async (templatePath: string) => {
		await service.selectPromptTemplate(templatePath);
		textareaRef.current?.focus();
	};
	const handleTemplateSelectorClose = () => service.setTemplateSelectorVisibility(false);
	const handleClearTemplate = () => service.clearSelectedPromptTemplate();

	const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (event.nativeEvent.isComposing) return;

		// 处理斜杠命令菜单的键盘导航
		if (slashCommandVisible) {
			switch (event.key) {
				case 'ArrowDown':
					event.preventDefault();
					setSlashCommandSelectedIndex((prev) =>
						prev < filteredSlashCommandItems.length - 1 ? prev + 1 : 0
					);
					return;

				case 'ArrowUp':
					event.preventDefault();
					setSlashCommandSelectedIndex((prev) =>
						prev > 0 ? prev - 1 : filteredSlashCommandItems.length - 1
					);
					return;

				case 'Enter':
				case 'Tab':
					if (filteredSlashCommandItems.length > 0) {
						event.preventDefault();
						const selectedItem = filteredSlashCommandItems[slashCommandSelectedIndex];
						if (selectedItem) {
							void executeSlashCommand(selectedItem);
						}
					}
					return;

				case 'Escape':
					event.preventDefault();
					closeSlashCommandMenu();
					return;
			}
		}

		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			handleSubmit();
		}
	};

	// 多模型生成进度统计
	const multiModelProgress = useMemo(() => {
		if (!state.parallelResponses || !isMultiModel) return null;
		const total = state.parallelResponses.responses.length;
		const completed = state.parallelResponses.responses.filter((r) => r.isComplete).length;
		const errors = state.parallelResponses.responses.filter((r) => r.isError).length;
		const generating = total - completed - errors;
		return { total, completed, errors, generating };
	}, [state.parallelResponses, isMultiModel]);

	const providers = service.getProviders();

	// 模型选择器区域
	const renderModelSelector = () => (
		<ModelSelector
			providers={providers}
			value={state.selectedModelId ?? ''}
			onChange={(modelId) => service.setModel(modelId)}
			selectedModels={state.selectedModels}
			onModelToggle={(tag) => {
				if (state.selectedModels.includes(tag)) {
					service.removeSelectedModel(tag);
				} else {
					service.addSelectedModel(tag);
				}
			}}
			multiModelMode={state.multiModelMode}
			onModeChange={(mode) => service.setMultiModelMode(mode)}
		/>
	);



	return (
		<Fragment>
			<form className="chat-input tw-flex tw-w-full tw-flex-col tw-gap-2 tw-p-2" style={{
				border: '1px solid var(--background-modifier-border)',
				borderRadius: 'var(--radius-m)'
			}} onSubmit={handleSubmit}>
				<ChatInputInfoTags
					selectedPromptTemplate={state.selectedPromptTemplate}
					selectedText={state.selectedText}
					onClearTemplate={handleClearTemplate}
					onClearSelectedText={handleClearSelectedText}
				/>

				{/* 多模型已选模型提示 */}
				{!state.isGenerating && isMultiModel && (
					<ChatInputSelectedModelsHint
						multiModelMode={state.multiModelMode}
						selectedModels={state.selectedModels}
						providers={providers}
						onRemoveModel={(tag) => service.removeSelectedModel(tag)}
					/>
				)}

				{!state.isGenerating ? (
					<>
						<textarea
							ref={textareaRef}
							className="tw-w-full tw-resize-none tw-p-3 tw-text-sm"
							style={{
								border: 'none', outline: 'none', background: 'transparent',
								resize: 'none', minHeight: '80px', maxHeight: `${maxHeight}px`,
								borderRadius: '0', boxShadow: 'none', marginBottom: '0', overflowY: 'auto'
							}}
							value={value}
							onChange={(event) => { setValue(event.target.value); service.setInputValue(event.target.value); }}
							onKeyDown={handleKeyDown}
							placeholder={localInstance.input_description_here}
						/>
						<ChatInputImagePreview images={state.selectedImages} onRemoveImage={handleRemoveImage} />
						<ChatInputFileTags selectedFiles={state.selectedFiles} selectedFolders={state.selectedFolders} onRemoveFile={handleRemoveFile} onRemoveFolder={handleRemoveFolder} />
						<div className="tw-flex tw-items-center tw-justify-between tw-mt-0">
							<div className="tw-flex tw-items-center tw-gap-2" style={{ flex: 1, minWidth: 0 }}>
								{renderModelSelector()}
								{/* 上下文使用指示器 */}
								<ContextUsageIndicator
									providers={providers}
									selectedModelId={state.selectedModelId ?? null}
									session={state.activeSession}
									isGenerating={state.isGenerating}
									size="sm"
								/>
							</div>
							<div className="tw-flex tw-items-center tw-gap-2">
								<span
									onClick={(e) => { e.preventDefault(); handleSubmit(); }}
									className="tw-cursor-pointer tw-text-muted hover:tw-text-accent tw-flex tw-items-center"
										aria-label={state.activeSession?.messages.some((msg) => msg.role !== 'system') ? localInstance.chat_send_button_label : localInstance.chat_save_button_label}
										title={state.activeSession?.messages.some((msg) => msg.role !== 'system') ? localInstance.chat_send_button_label : localInstance.chat_save_button_label}
								>
									<CornerDownLeft className="tw-size-4" />
								</span>
							</div>
						</div>
					</>
				) : (
					<>
						<textarea
							ref={textareaRef}
							className="tw-w-full tw-resize-none tw-p-3 tw-text-sm"
							style={{
								border: 'none', outline: 'none', background: 'transparent',
								resize: 'none', minHeight: '80px', maxHeight: `${maxHeight}px`,
								borderRadius: '0', boxShadow: 'none', marginBottom: '0', overflowY: 'auto'
							}}
							value={value}
							onChange={(event) => { setValue(event.target.value); service.setInputValue(event.target.value); }}
							onKeyDown={handleKeyDown}
							placeholder={localInstance.input_description_here}
							disabled={state.isGenerating}
						/>
						<ChatInputImagePreview images={state.selectedImages} onRemoveImage={handleRemoveImage} />
						<ChatInputFileTags selectedFiles={state.selectedFiles} selectedFolders={state.selectedFolders} onRemoveFile={handleRemoveFile} onRemoveFolder={handleRemoveFolder} />
						<div className="tw-flex tw-items-center tw-justify-between tw-mt-0">
							<div className="tw-flex tw-items-center tw-gap-2" style={{ flex: 1, minWidth: 0 }}>
								{renderModelSelector()}
								{/* 上下文使用指示器 */}
								<ContextUsageIndicator
									providers={providers}
									selectedModelId={state.selectedModelId ?? null}
									session={state.activeSession}
									isGenerating={state.isGenerating}
									size="sm"
								/>
							</div>
							<div className="tw-flex tw-items-center tw-gap-2">
								{/* 停止控制 */}
								{isMultiModel && multiModelProgress ? (
									<div className="multi-model-stop-bar tw-flex tw-items-center tw-gap-2">
										{multiModelProgress.generating > 0 && (
											<span className="tw-text-xs tw-text-muted">
												{localInstance.generating_progress
													.replace('{completed}', String(multiModelProgress.completed + multiModelProgress.errors))
													.replace('{total}', String(multiModelProgress.total))}
											</span>
										)}
										<span
											onClick={() => service.stopAllGeneration()}
											className="tw-cursor-pointer tw-text-muted hover:tw-text-accent tw-flex tw-items-center"
											aria-label={localInstance.stop_all}
											title={localInstance.stop_all}
										>
											<StopCircle className="tw-size-4" />
										</span>
										{multiModelProgress.errors > 0 && (
											<span
												onClick={() => service.retryAllFailed()}
												className="tw-cursor-pointer tw-flex tw-items-center"
												style={{ color: 'var(--text-error, #dc2626)' }}
												aria-label={localInstance.retry_failed}
												title={localInstance.retry_failed}
											>
												<RotateCw style={{ width: 14, height: 14 }} />
												<span className="tw-ml-1 tw-text-xs">{localInstance.retry_failed}({multiModelProgress.errors})</span>
											</span>
										)}
									</div>
								) : (
									<span
										onClick={() => service.stopGeneration()}
										className="tw-cursor-pointer tw-text-muted hover:tw-text-accent tw-flex tw-items-center"
										aria-label={localInstance.chat_stop_button_label}
										title={localInstance.chat_stop_button_label}
									>
										<StopCircle className="tw-size-4" />
									</span>
								)}

								{isImageGenerationIntent && (
									<div className="tw-flex tw-items-center tw-gap-1 tw-ml-2 tw-px-2 tw-py-1 tw-bg-purple-100 tw-text-purple-700 tw-rounded tw-text-xs">
										<Palette className="tw-size-3" />
										<span>{localInstance.image_generation_mode}</span>
									</div>
								)}
							</div>
						</div>
					</>
				)}
			</form>

			{/* 模板选择器 */}
			<TemplateSelector
				visible={state.showTemplateSelector}
				service={service}
				onSelect={handleTemplateSelect}
				onClose={handleTemplateSelectorClose}
				inputValue={value}
			/>

			{/* 斜杠命令自动补全菜单 */}
			<SlashCommandMenu
				items={slashCommandItems}
				filterText={slashCommandFilter}
				visible={slashCommandVisible}
				selectedIndex={slashCommandSelectedIndex}
				menuPosition={slashCommandPosition}
				onSelect={executeSlashCommand}
				onClose={closeSlashCommandMenu}
			/>

		</Fragment>
	);
};
