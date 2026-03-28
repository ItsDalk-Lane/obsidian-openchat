import type OpenChatPlugin from 'src/main';
import { createBuiltinToolsRuntime } from 'src/tools/runtime/BuiltinToolsRuntime';
import type { ObsidianApiProvider } from 'src/providers/providers.types';
import type { ChatRuntimeDeps } from '../runtime/chat-runtime-deps';
import type {
	ChatHostDeps,
	ChatServiceDeps,
	ChatSettingsAccessor,
} from './chat-service-types';
import { FileContentService } from './file-content-service';
import { MessageService } from './message-service';
import {
	SubAgentScannerService,
	SubAgentWatcherService,
} from 'src/tools/sub-agents';

const createChatSettingsAccessor = (
	plugin: OpenChatPlugin,
): ChatSettingsAccessor => ({
	getManifestId: () => plugin.manifest.id,
	getAiDataFolder: () => plugin.settings.aiDataFolder,
	getPluginSettings: () => plugin.settings,
	getChatSettings: () => plugin.settings.chat,
	setChatSettings: (nextSettings) => {
		(plugin.settings as { chat: typeof nextSettings }).chat = nextSettings;
	},
	getAiRuntimeSettings: () => plugin.settings.aiRuntime,
	setAiRuntimeSettings: (nextSettings) => {
		(plugin.settings as { aiRuntime: typeof nextSettings }).aiRuntime = nextSettings;
	},
	saveSettings: async () => await plugin.saveSettings(),
	openSettingsTab: () => {
		const settingApp = plugin.app as typeof plugin.app & {
			setting?: { open: () => void; openTabById: (id: string) => boolean };
		};
		settingApp.setting?.open();
		settingApp.setting?.openTabById(plugin.manifest.id);
	},
});

export const createChatHostDeps = (
	plugin: OpenChatPlugin,
	obsidianApi: ObsidianApiProvider,
): ChatHostDeps => ({
	obsidianApi,
	settingsAccessor: createChatSettingsAccessor(plugin),
	createFileContentService: () => new FileContentService(obsidianApi),
	createMessageService: (fileContentService) =>
		new MessageService(
			plugin.app,
			fileContentService,
		),
	createBuiltinToolsRuntime: async (settings, skillScanner) => {
		return await createBuiltinToolsRuntime({
			app: plugin.app,
			settings,
			skillScanner,
		});
	},
	createSubAgentScannerService: () =>
		new SubAgentScannerService(plugin.app, {
			getAiDataFolder: () => plugin.settings.aiDataFolder,
		}),
	createSubAgentWatcherService: (scanner) =>
		new SubAgentWatcherService(plugin.app, scanner),
});

export const createChatServiceDeps = (
	plugin: OpenChatPlugin,
	runtimeDeps: ChatRuntimeDeps,
	obsidianApi: ObsidianApiProvider,
): ChatServiceDeps => ({
	host: createChatHostDeps(plugin, obsidianApi),
	runtimeDeps,
});
