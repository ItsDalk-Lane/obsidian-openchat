import { useEffect, useState } from 'react';
import type { App } from 'obsidian';
import type { ChatService } from 'src/core/chat/services/chat-service';
import type { ChatState } from 'src/domains/chat/types';
import { ChatPlanPanel } from './ChatPlanPanel';
import { ChatMessages } from './ChatMessages';
import { ChatControls } from './ChatControls';
import { ChatInput } from './ChatInput';

export interface ChatPersistentModalAppProps {
	service: ChatService;
	app: App;
}

/**
 * Chat 持久化模态框 React 应用组件
 * UI结构与ChatView保持一致
 */
export const ChatPersistentModalApp = ({ service, app }: ChatPersistentModalAppProps) => {
	const [state, setState] = useState<ChatState>(service.getState());
	const MODAL_VIEWPORT_PADDING = 8;

	const keepModalInViewport = () => {
		const modalEl = document.querySelector<HTMLElement>('.chat-persistent-modal');
		if (!modalEl) {
			return;
		}

		const computedStyle = window.getComputedStyle(modalEl);
		const hasFixedPosition = computedStyle.position === 'fixed';
		if (!hasFixedPosition) {
			return;
		}

		const currentTop = Number.parseFloat(modalEl.style.top || computedStyle.top || '0');
		if (!Number.isFinite(currentTop)) {
			return;
		}

		const rect = modalEl.getBoundingClientRect();
		let adjustedTop = currentTop;

		if (rect.bottom > window.innerHeight - MODAL_VIEWPORT_PADDING) {
			adjustedTop -= rect.bottom - (window.innerHeight - MODAL_VIEWPORT_PADDING);
		}
		if (rect.top < MODAL_VIEWPORT_PADDING) {
			adjustedTop += MODAL_VIEWPORT_PADDING - rect.top;
		}

		if (adjustedTop !== currentTop) {
			modalEl.style.top = `${Math.max(MODAL_VIEWPORT_PADDING, adjustedTop)}px`;
		}
	};

	useEffect(() => {
		const unsubscribe = service.subscribe((next: ChatState) => {
			setState(next);
		});
		return () => unsubscribe();
	}, [service]);

	const session = state.activeSession;

	// 判断是否有消息
	const hasMessages = session && session.messages.length > 0;

	// 动态控制模态框高度
	useEffect(() => {
		const modalEl = document.querySelector('.chat-persistent-modal');
		if (modalEl) {
			if (!hasMessages) {
				modalEl.classList.add('auto-height');
			} else {
				modalEl.classList.remove('auto-height');
			}
			window.requestAnimationFrame(() => {
				keepModalInViewport();
			});
		}
	}, [hasMessages]);

	return (
		<div className="chat-persistent-modal-app tw-flex tw-h-full tw-flex-col tw-overflow-hidden tw-gap-2">
			<div className={`chat-persistent-modal-body tw-flex tw-flex-col tw-overflow-hidden tw-gap-2 ${hasMessages ? 'tw-flex-1' : ''}`}>
				{session ? (
					<>
						{hasMessages && <ChatMessages service={service} state={state} />}
						<ChatPlanPanel
							sessionId={session.id}
							plan={session.livePlan}
							isGenerating={state.isGenerating}
						/>
						<ChatControls
							service={service}
							state={state}
							app={app}
						/>
						<ChatInput service={service} state={state} app={app} />
					</>
				) : (
					<div className="tw-flex tw-h-full tw-items-center tw-justify-center tw-text-muted">
						暂无聊天会话,点击"New Chat"开始新的对话。
					</div>
				)}
			</div>
		</div>
	);
};
