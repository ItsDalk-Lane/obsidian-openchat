import type { ChatViewFactory } from 'src/domains/chat/types-view-coordinator';
import type { ChatConsumerHost } from 'src/core/chat/services/chat-service-types';
import type { ChatService } from 'src/core/chat/services/chat-service';
import {
	VIEW_TYPE_CHAT_SIDEBAR,
	VIEW_TYPE_CHAT_TAB,
} from 'src/domains/chat/config';
import { ChatView } from 'src/components/chat-components/ChatView';
import { ChatModal } from 'src/components/chat-components/ChatModal';
import { ChatPersistentModal } from 'src/components/chat-components/ChatPersistentModal';

/**
 * 纯工厂构建器：根据 host 与 service 返回 ChatViewFactory。
 * core 层组合根（FeatureCoordinator / ChatFeatureManager）共用此函数，
 * 确保工厂逻辑只有一份。
 */
export function buildChatViewFactory(
	host: ChatConsumerHost,
	service: ChatService,
): ChatViewFactory {
	return {
		createSidebarView: (leaf) =>
			new ChatView(leaf, host, service, 'sidebar', VIEW_TYPE_CHAT_SIDEBAR),
		createTabView: (leaf) =>
			new ChatView(leaf, host, service, 'tab', VIEW_TYPE_CHAT_TAB),
		createModal: (options) => new ChatModal(host.app, service, options),
		createPersistentModal: (options) =>
			new ChatPersistentModal(host.app, host, service, options),
	};
}
