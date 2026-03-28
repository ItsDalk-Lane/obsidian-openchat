import type { TFile } from 'obsidian';
import type OpenChatPlugin from 'src/main';
import type { ChatService } from 'src/core/chat/services/chat-service';
import type { ChatOpenMode } from 'src/types/chat';

export interface ChatViewCoordinatorCommandDeps {
	plugin: OpenChatPlugin;
	service: ChatService;
	activateChatView(mode: ChatOpenMode): Promise<void>;
	openChatInPersistentModal(activeFile?: TFile | null): void;
}

export const registerChatViewCommands = (
	deps: ChatViewCoordinatorCommandDeps,
): void => {
	deps.plugin.addCommand({
		id: 'form-chat-open-default',
		name: '打开 AI Chat',
		callback: () => {
			const openMode = deps.plugin.settings.chat.openMode;
			deps.service.setNextTriggerSource('command_palette');
			void deps.activateChatView(openMode);
		},
	});
	deps.plugin.addCommand({
		id: 'form-chat-open-sidebar',
		name: '在侧边栏打开 AI Chat',
		callback: () => {
			deps.service.setNextTriggerSource('command_palette');
			void deps.activateChatView('sidebar');
		},
	});
	deps.plugin.addCommand({
		id: 'form-chat-open-left-sidebar',
		name: '在左侧边栏打开 AI Chat',
		callback: () => {
			deps.service.setNextTriggerSource('command_palette');
			void deps.activateChatView('left-sidebar');
		},
	});
	deps.plugin.addCommand({
		id: 'form-chat-open-tab',
		name: '在新标签中打开 AI Chat',
		callback: () => {
			deps.service.setNextTriggerSource('command_palette');
			void deps.activateChatView('tab');
		},
	});
	deps.plugin.addCommand({
		id: 'form-chat-open-window',
		name: '在新窗口打开 AI Chat',
		callback: () => {
			deps.service.setNextTriggerSource('command_palette');
			void deps.activateChatView('window');
		},
	});
	deps.plugin.addCommand({
		id: 'form-chat-open-persistent-modal',
		name: '在持久化模态框中打开 AI Chat',
		callback: () => {
			deps.service.setNextTriggerSource('command_palette');
			deps.openChatInPersistentModal();
		},
	});
	deps.plugin.addCommand({
		id: 'form-chat-new-conversation',
		name: 'AI Chat 新建聊天',
		callback: () => deps.service.createNewSession(),
	});
	deps.plugin.addCommand({
		id: 'form-chat-save-conversation',
		name: 'AI Chat 保存当前聊天',
		callback: () => deps.service.saveActiveSession(),
	});
	deps.plugin.addCommand({
		id: 'form-chat-open-history',
		name: 'AI Chat 打开历史记录面板',
		callback: () => {
			const openMode = deps.plugin.settings.chat.openMode;
			void deps.activateChatView(openMode);
		},
	});
};

export const syncChatRibbonIcon = (
	plugin: OpenChatPlugin,
	service: ChatService,
	existingRibbonEl: HTMLElement | null,
	show: boolean,
	activateChatView: (mode: ChatOpenMode) => Promise<void>,
): HTMLElement | null => {
	if (existingRibbonEl) {
		existingRibbonEl.remove();
	}
	if (!show) {
		return null;
	}
	const ribbonEl = plugin.addRibbonIcon('message-circle', 'AI Chat', () => {
		const openMode = plugin.settings.chat.openMode;
		service.setNextTriggerSource('chat_input');
		void activateChatView(openMode);
	});
	ribbonEl?.addClass('chat-ribbon-icon');
	return ribbonEl;
};
