/**
 * @module chat/config
 * @description 提供 chat 域共享默认值与配置归一化逻辑。
 *
 * @dependencies src/domains/chat/types
 * @side-effects 无
 * @invariants 默认值与 legacy chat 设置语义保持完全一致。
 */

import type { ChatSettings, MessageManagementSettings } from './types';

export const VIEW_TYPE_CHAT_SIDEBAR = 'form-chat-sidebar';
export const VIEW_TYPE_CHAT_TAB = 'form-chat-tab';

export const DEFAULT_MESSAGE_MANAGEMENT_SETTINGS: MessageManagementSettings = {
	enabled: true,
	recentTurns: 1,
	summaryModelTag: undefined,
};

export function normalizeMessageManagementSettings(
	settings?: Partial<MessageManagementSettings> | null,
): MessageManagementSettings {
	return {
		enabled: settings?.enabled ?? DEFAULT_MESSAGE_MANAGEMENT_SETTINGS.enabled,
		recentTurns:
			typeof settings?.recentTurns === 'number' && settings.recentTurns > 0
				? Math.floor(settings.recentTurns)
				: DEFAULT_MESSAGE_MANAGEMENT_SETTINGS.recentTurns,
		summaryModelTag:
			typeof settings?.summaryModelTag === 'string'
				? settings.summaryModelTag.trim() || undefined
				: DEFAULT_MESSAGE_MANAGEMENT_SETTINGS.summaryModelTag,
	};
}

export const DEFAULT_CHAT_SETTINGS: ChatSettings = {
	defaultModel: '',
	autosaveChat: true,
	openMode: 'sidebar',
	enableSystemPrompt: true,
	autoAddActiveFile: true,
	showRibbonIcon: true,
	enableChatTrigger: true,
	chatTriggerSymbol: ['@'],
	chatModalWidth: 700,
	chatModalHeight: 500,
	enableQuickActions: true,
	maxQuickActionButtons: 4,
	quickActionsStreamOutput: true,
	quickActions: [],
	messageManagement: { ...DEFAULT_MESSAGE_MANAGEMENT_SETTINGS },
};
