import type { TFile } from 'obsidian';
import type { ChatOpenMode } from './types';
import type {
	ChatViewCoordinatorServicePort,
	ChatViewCoordinatorHost,
} from './types-view-coordinator';

export interface ChatViewCoordinatorCommandDeps {
	host: ChatViewCoordinatorHost;
	service: ChatViewCoordinatorServicePort;
	activateChatView(mode: ChatOpenMode): Promise<void>;
	openChatInPersistentModal(activeFile?: TFile | null): void;
}

export const registerChatViewCommands = (
	deps: ChatViewCoordinatorCommandDeps,
): void => {
	deps.host.addCommand({
		id: 'form-chat-open-default',
		name: '打开 AI Chat',
		callback: () => {
			const openMode = deps.host.getChatSettings().openMode;
			deps.service.setNextTriggerSource('command_palette');
			void deps.activateChatView(openMode);
		},
	});
	deps.host.addCommand({
		id: 'form-chat-open-sidebar',
		name: '在侧边栏打开 AI Chat',
		callback: () => {
			deps.service.setNextTriggerSource('command_palette');
			void deps.activateChatView('sidebar');
		},
	});
	deps.host.addCommand({
		id: 'form-chat-open-left-sidebar',
		name: '在左侧边栏打开 AI Chat',
		callback: () => {
			deps.service.setNextTriggerSource('command_palette');
			void deps.activateChatView('left-sidebar');
		},
	});
	deps.host.addCommand({
		id: 'form-chat-open-tab',
		name: '在新标签中打开 AI Chat',
		callback: () => {
			deps.service.setNextTriggerSource('command_palette');
			void deps.activateChatView('tab');
		},
	});
	deps.host.addCommand({
		id: 'form-chat-open-window',
		name: '在新窗口打开 AI Chat',
		callback: () => {
			deps.service.setNextTriggerSource('command_palette');
			void deps.activateChatView('window');
		},
	});
	deps.host.addCommand({
		id: 'form-chat-open-persistent-modal',
		name: '在持久化模态框中打开 AI Chat',
		callback: () => {
			deps.service.setNextTriggerSource('command_palette');
			deps.openChatInPersistentModal();
		},
	});
	deps.host.addCommand({
		id: 'form-chat-new-conversation',
		name: 'AI Chat 新建聊天',
		callback: () => deps.service.createNewSession(),
	});
	deps.host.addCommand({
		id: 'form-chat-save-conversation',
		name: 'AI Chat 保存当前聊天',
		callback: () => deps.service.saveActiveSession(),
	});
	deps.host.addCommand({
		id: 'form-chat-open-history',
		name: 'AI Chat 打开历史记录面板',
		callback: () => {
			const openMode = deps.host.getChatSettings().openMode;
			void deps.activateChatView(openMode);
		},
	});
};
