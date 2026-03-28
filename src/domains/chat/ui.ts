/**
 * @module chat/ui
 * @description 提供 chat 域首批迁入的 UI 纯辅助逻辑。
 *
 * @dependencies src/domains/chat/types, src/domains/chat/config
 * @side-effects 无
 * @invariants 仅处理视图参数归一化，不直接创建 Obsidian 视图或模态框。
 */

import { DEFAULT_CHAT_SETTINGS } from './config';
import type { ChatSettings } from './types';

export interface ChatModalDimensions {
	width: number;
	height: number;
}

export function resolveChatModalDimensions(
	settings?: Pick<ChatSettings, 'chatModalWidth' | 'chatModalHeight'> | null,
): ChatModalDimensions {
	return {
		width: settings?.chatModalWidth ?? DEFAULT_CHAT_SETTINGS.chatModalWidth,
		height: settings?.chatModalHeight ?? DEFAULT_CHAT_SETTINGS.chatModalHeight,
	};
}