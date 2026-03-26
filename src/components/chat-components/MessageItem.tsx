import { Check, Copy, PenSquare, RotateCw, TextCursorInput, Trash2, X, Highlighter, StopCircle, Pin } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useObsidianApp } from 'src/contexts/obsidianAppContext';
import type { ChatMessage, ChatMessageMetadata } from 'src/types/chat';
import type { ChatService } from 'src/core/chat/services/ChatService';
import { getModelDisplayNameByTag } from 'src/core/chat/services/chatProviderHelpers';
import { MessageService } from 'src/core/chat/services/MessageService';
import { parseContentBlocks, ContentBlock } from 'src/core/chat/utils/markdown';
import { getEditableUserMessageContent } from 'src/core/chat/utils/userMessageEditing';
import { Notice } from 'obsidian';
import { ModelTag } from './ModelTag';
import { availableVendors } from 'src/settings/ai-runtime';
import { countMessageTokens, formatTokenCount } from 'src/core/chat/utils/token';
import { localInstance } from 'src/i18n/locals';
import { isPinnedChatMessage } from 'src/types/chat';
import { SkillCallBlock } from './SkillCallBlock';
import { SubAgentMessageFold } from './SubAgentMessageFold';
import { DebugLogger } from 'src/utils/DebugLogger';
import { MessageImageGallery, MessageImagePreview } from './MessageItemMedia';
import { ReasoningBlockComponent, McpToolBlockComponent, TextBlockComponent } from './messageItemBlocks';

interface MessageItemProps {
	message: ChatMessage;
	service?: ChatService;
	isGenerating?: boolean;
	/** 在标签页模式下隐藏模型名称（因为标签栏已显示） */
	hideModelTag?: boolean;
	compact?: boolean;
}

export const MessageItem = ({ message, service, isGenerating, hideModelTag, compact = false }: MessageItemProps) => {
	const app = useObsidianApp();
	const helper = useMemo(() => new MessageService(app), [app]);
	const [copied, setCopied] = useState(false);
	const [editing, setEditing] = useState(false);
	const editableContent = useMemo(() => getEditableUserMessageContent(message), [message]);
	const [draft, setDraft] = useState(editableContent);
	const [previewImage, setPreviewImage] = useState<string | null>(null);
	const [contentBlocks, setContentBlocks] = useState<ContentBlock[]>([]);
	const isTransient = message.metadata?.transient === true;
	const isPinned = isPinnedChatMessage(message);
	const metadata = (message.metadata ?? {}) as ChatMessageMetadata;
	const subAgentStateMap = metadata.subAgentStates ?? {};

	const timestamp = useMemo(() => helper.formatTimestamp(message.timestamp), [helper, message.timestamp]);

	// 计算消息 token 数量（仅在消息内容变化时重新计算）
	const tokenCount = useMemo(() => countMessageTokens(message), [message]);

	// 解析内容块
	useEffect(() => {
		const blocks = parseContentBlocks(message.content);
		setContentBlocks(blocks);
	}, [message.content]);

	const blockToolCallIds = useMemo(() => {
		return new Set(
			contentBlocks
				.filter((block) => block.type === 'mcpTool')
				.map((block) => message.toolCalls?.[block.toolIndex]?.id)
				.filter((toolCallId): toolCallId is string => typeof toolCallId === 'string' && toolCallId.length > 0)
		);
	}, [contentBlocks, message.toolCalls]);

	const pendingSubAgents = useMemo(() => {
		const runningEntries = Object.entries(subAgentStateMap).filter(([toolCallId, state]) => {
			return state.status === 'running' && !blockToolCallIds.has(toolCallId);
		});
		const toolCallOrder = new Map(
			(message.toolCalls ?? []).map((toolCall, index) => [toolCall.id, index])
		);
		return runningEntries.sort(([leftToolCallId], [rightToolCallId]) => {
			const leftOrder = toolCallOrder.get(leftToolCallId) ?? Number.MAX_SAFE_INTEGER;
			const rightOrder = toolCallOrder.get(rightToolCallId) ?? Number.MAX_SAFE_INTEGER;
			return leftOrder - rightOrder;
		});
	}, [blockToolCallIds, message.toolCalls, subAgentStateMap]);

	useEffect(() => {
		if (!editing) {
			setDraft(editableContent);
		}
	}, [editableContent, editing]);

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(message.content);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch (error) {
			DebugLogger.error('[MessageItem] 复制失败', error);
			new Notice(localInstance.copy_failed);
		}
	};

	const handleDelete = () => {
		service?.deleteMessage(message.id);
	};

	const handleSaveEdit = async () => {
		// 立即退出编辑模式
		setEditing(false);

		if (service) {
			await service.editAndRegenerate(message.id, draft);
		}
	};

	const handleCancelEdit = () => {
		setDraft(editableContent);
		setEditing(false);
	};

	const handleInsert = () => service?.insertMessageToEditor(message.id);

	const handleRegenerate = () => service?.regenerateFromMessage(message.id);

	const handleImageClick = (imageSrc: string) => {
		setPreviewImage(imageSrc);
	};

	const closeImagePreview = () => {
		setPreviewImage(null);
	};

	const roleClass =
		message.role === 'user'
			? 'chat-message--user'
			: message.role === 'assistant'
				? 'chat-message--assistant'
				: 'chat-message--system';

	return (
		<>
			<div
				className={`${compact ? '' : 'group '}tw-mx-2 tw-my-1 tw-rounded-md tw-p-2 ${roleClass} ${message.isError ? 'chat-message--error' : ''}`}
				data-chat-message-id={message.id}
			>
				{/* 显示图片 */}
				{message.images && message.images.length > 0 && (
					<MessageImageGallery
						app={app}
						images={message.images}
						onPreview={handleImageClick}
					/>
				)}
				
				{/* 处理消息内容中的图片（Obsidian附件格式）*/}
				{!message.images || message.images.length === 0 && (
					// 这里可以添加对消息内容中图片的处理逻辑
					<div></div>
				)}

				{/* 显示选中文本标签 */}
				{message.metadata?.selectedText && typeof message.metadata.selectedText === 'string' && (
					<div className="message-selected-text tw-mb-2">
						<div className="tw-flex tw-items-center tw-gap-1 tw-px-2 tw-py-1 tw-bg-orange-100 tw-text-orange-700 tw-rounded tw-text-xs">
							<Highlighter className="tw-size-3 tw-flex-shrink-0" />
							<span className="tw-max-w-60 tw-truncate" title={message.metadata.selectedText}>
								{message.metadata.selectedText.length > 50
									? message.metadata.selectedText.substring(0, 50) + '...'
									: message.metadata.selectedText}
							</span>
						</div>
					</div>
				)}

			{/* 多模型标识 */}
			{message.role === 'assistant' && message.modelTag && !hideModelTag && (() => {
				const provider = service?.getProviders().find((p) => p.tag === message.modelTag);
				const vendorName = provider ? availableVendors.find((v) => v.name === provider.vendor)?.name : undefined;
				const displayName = getModelDisplayNameByTag(
					service?.getProviders() ?? [],
					message.modelTag,
					message.modelName
				);
				return (
					<div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
						<ModelTag
							modelTag={message.modelTag}
							modelName={displayName}
							vendor={vendorName}
							size="sm"
						/>
						{message.taskDescription && (
							<span style={{ fontSize: 'var(--font-ui-smaller)', color: 'var(--text-faint)' }}>
								{message.taskDescription}
							</span>
						)}
					</div>
				);
			})()}

			<div className="chat-message__content tw-break-words">
				{editing ? (
					<textarea
						value={draft}
						onChange={(event) => setDraft(event.target.value)}
						className="chat-message__editor"
						rows={4}
						/>
					) : (
						// 渲染所有内容块
						contentBlocks.map((block, index) => {
							if (block.type === 'reasoning') {
								return (
									<ReasoningBlockComponent
										key={`reasoning-${index}`}
										content={block.content}
										startMs={block.startMs}
										durationMs={block.durationMs}
										isGenerating={isGenerating ?? false}
									/>
								);
							}
							if (block.type === 'mcpTool') {
								const toolCall = message.toolCalls?.[block.toolIndex];
								const subAgentState = toolCall?.id ? subAgentStateMap[toolCall.id] : undefined;
								if (subAgentState) {
									return (
										<SubAgentMessageFold
											key={`subAgentTool-${index}`}
											name={subAgentState.name}
											status={subAgentState.status}
											internalMessages={subAgentState.internalMessages}
											defaultFolded={subAgentState.folded}
											renderMessage={(nestedMessage, nestedIndex) => (
												<MessageItem
													key={`${toolCall?.id ?? 'sub'}-${nestedMessage.id}-${nestedIndex}`}
													message={nestedMessage}
													hideModelTag={true}
													compact={true}
												/>
											)}
										/>
									);
								}
								const isSkillTool = block.toolName === 'Skill';
								const skillName =
									toolCall?.name === 'Skill' && typeof toolCall.arguments?.command === 'string'
										? toolCall.arguments.command
										: block.toolName;
								const skillPath =
									toolCall?.name === 'Skill' && typeof toolCall.arguments?.path === 'string'
										? toolCall.arguments.path
										: undefined;
								if (isSkillTool) {
									return (
										<SkillCallBlock
											key={`skillTool-${index}`}
											skillName={skillName}
											skillPath={skillPath}
											fallbackContent={block.content}
										/>
									);
								}
								return (
									<McpToolBlockComponent
										key={`mcpTool-${index}`}
										toolName={block.toolName}
										content={block.content}
									/>
								);
							}
							return (
								<TextBlockComponent
									key={`text-${index}`}
									content={block.content}
									app={app}
								/>
							);
						})
					)}
				{!editing && pendingSubAgents.map(([toolCallId, state]) => (
					<SubAgentMessageFold
						key={`subagent-pending-${toolCallId}`}
						name={state.name}
						status={state.status}
						internalMessages={state.internalMessages}
						defaultFolded={state.folded}
						renderMessage={(nestedMessage, nestedIndex) => (
							<MessageItem
								key={`${toolCallId}-${nestedMessage.id}-${nestedIndex}`}
								message={nestedMessage}
								hideModelTag={true}
								compact={true}
							/>
						)}
					/>
				))}
				</div>
				{/* 临时消息在落盘前不展示操作区，避免对不存在的消息执行操作 */}
				{!compact && !isTransient && (message.role !== 'assistant' || !isGenerating) && (
					<div className="chat-message__meta tw-flex tw-items-center tw-justify-between">
						<div className="tw-flex tw-items-center tw-gap-2">
							<span className="tw-text-xs tw-text-faint">{timestamp}</span>
							{isPinned && (
								<span className="tw-text-xs tw-text-accent" title={localInstance.chat_message_pinned}>
									{localInstance.chat_message_pinned}
								</span>
							)}
							<span className="tw-text-xs tw-text-faint" title={localInstance.chat_token_count_title.replace('{count}', String(tokenCount))}>
								{formatTokenCount(tokenCount)} tokens
							</span>
						</div>
						<div className="chat-message__actions tw-flex tw-items-center tw-gap-2 tw-opacity-100 hover:tw-opacity-100 tw-transition-opacity">
							{/* User message buttons */}
							{message.role === 'user' && (
								<>
									<span onClick={handleCopy} aria-label={localInstance.chat_copy_message} title={localInstance.chat_copy_message} className="tw-cursor-pointer tw-text-muted hover:tw-text-accent">
										{copied ? <Check className="tw-size-4" /> : <Copy className="tw-size-4" />}
									</span>
									{!editing && (
										<span onClick={() => {
											setDraft(editableContent);
											setEditing(true);
										}} aria-label={localInstance.chat_edit_message} title={localInstance.chat_edit_message} className="tw-cursor-pointer tw-text-muted hover:tw-text-accent">
											<PenSquare className="tw-size-4" />
										</span>
									)}
									{editing && (
										<>
											<span onClick={handleCancelEdit} aria-label={localInstance.chat_cancel_edit} title={localInstance.chat_cancel_edit} className="tw-cursor-pointer tw-text-muted hover:tw-text-accent">
												<X className="tw-size-4" />
											</span>
											<span onClick={handleSaveEdit} aria-label={localInstance.chat_save_edit} title={localInstance.chat_save_edit} className="tw-cursor-pointer tw-text-muted hover:tw-text-accent">
												<Check className="tw-size-4" />
											</span>
										</>
									)}
									<span
										onClick={() => service?.togglePinnedMessage(message.id)}
										aria-label={isPinned ? localInstance.chat_message_unpin : localInstance.chat_message_pin}
										className={`tw-cursor-pointer ${isPinned ? 'tw-text-accent' : 'tw-text-muted'} hover:tw-text-accent`}
										title={isPinned ? localInstance.chat_message_unpin : localInstance.chat_message_pin}
									>
										<Pin className="tw-size-4" />
									</span>
									<span onClick={handleDelete} aria-label={localInstance.chat_delete_message} title={localInstance.chat_delete_message} className="tw-cursor-pointer tw-text-muted hover:tw-text-accent">
										<Trash2 className="tw-size-4" />
									</span>
								</>
							)}
						{/* AI message buttons */}
						{message.role === 'assistant' && (
							<>
								{/* 停止按钮：仅在对比模式下流式生成时显示 */}
								{isGenerating && message.modelTag && (() => {
									const modelTag = message.modelTag;
									if (!modelTag) return null;
									return (
										<span
											onClick={() => service?.stopModelGeneration(modelTag)}
											aria-label={localInstance.stop_this_model}
											className="tw-cursor-pointer tw-text-muted hover:tw-text-destructive"
											title={localInstance.stop_this_model}
										>
											<StopCircle className="tw-size-4" />
										</span>
									);
								})()}
								<span onClick={handleInsert} aria-label={localInstance.chat_insert_to_editor} title={localInstance.chat_insert_to_editor} className="tw-cursor-pointer tw-text-muted hover:tw-text-accent">
									<TextCursorInput className="tw-size-4" />
								</span>
								<span onClick={handleCopy} aria-label={localInstance.chat_copy_message} title={localInstance.chat_copy_message} className="tw-cursor-pointer tw-text-muted hover:tw-text-accent">
									{copied ? <Check className="tw-size-4" /> : <Copy className="tw-size-4" />}
								</span>
								<span
									onClick={() => service?.togglePinnedMessage(message.id)}
									aria-label={isPinned ? localInstance.chat_message_unpin : localInstance.chat_message_pin}
									className={`tw-cursor-pointer ${isPinned ? 'tw-text-accent' : 'tw-text-muted'} hover:tw-text-accent`}
									title={isPinned ? localInstance.chat_message_unpin : localInstance.chat_message_pin}
								>
									<Pin className="tw-size-4" />
								</span>
								<span onClick={handleRegenerate} aria-label={localInstance.quick_action_result_regenerate} title={localInstance.quick_action_result_regenerate} className="tw-cursor-pointer tw-text-muted hover:tw-text-accent">
									<RotateCw className="tw-size-4" />
								</span>
								<span onClick={handleDelete} aria-label={localInstance.chat_delete_message} title={localInstance.chat_delete_message} className="tw-cursor-pointer tw-text-muted hover:tw-text-accent">
									<Trash2 className="tw-size-4" />
								</span>
							</>
						)}
						</div>
					</div>
				)}
			</div>
			
			{/* 图片预览模态框 */}
			{previewImage && (
				<MessageImagePreview imageSrc={previewImage} onClose={closeImagePreview} />
			)}
		</>
	);
};
