import { createBuiltinToolsRuntime } from 'src/tools/runtime/BuiltinToolsRuntime';
import type { ObsidianApiProvider } from 'src/providers/providers.types';
import type { ChatRuntimeDeps } from '../runtime/chat-runtime-deps';
import type {
	ChatConsumerHost,
	ChatHostDeps,
	ChatServiceDeps,
	ChatSettingsAccessor,
} from './chat-service-types';
import { FileContentService } from './file-content-service';
import { MessageService } from './message-service';
import { SubAgentScannerService } from 'src/tools/sub-agents/SubAgentScannerService';
import { SubAgentWatcherService } from 'src/tools/sub-agents/SubAgentWatcherService';

const resolveVaultBasePath = (host: ChatConsumerHost): string | null => {
	const adapter = host.app.vault.adapter;
	const maybeAdapter = adapter as unknown as {
		getBasePath?: () => string;
	};
	return typeof maybeAdapter.getBasePath === 'function'
		? maybeAdapter.getBasePath()
		: null;
};

const createChatSettingsAccessor = (
	host: ChatConsumerHost,
): ChatSettingsAccessor => ({
	getManifestId: () => host.getManifestId(),
	getAiDataFolder: () => host.getAiDataFolder(),
	getPluginSettings: () => host.getPluginSettings(),
	getChatSettings: () => host.getChatSettings(),
	setChatSettings: (nextSettings) => {
		host.setChatSettings(nextSettings);
	},
	getAiRuntimeSettings: () => host.getAiRuntimeSettings(),
	setAiRuntimeSettings: (nextSettings) => {
		host.setAiRuntimeSettings(nextSettings);
	},
	saveSettings: async () => await host.saveSettings(),
	openSettingsTab: () => host.openSettingsTab(),
});

export const createChatHostDeps = (
	host: ChatConsumerHost,
	obsidianApi: ObsidianApiProvider,
	runtimeDeps: ChatRuntimeDeps,
): ChatHostDeps => ({
	obsidianApi,
	settingsAccessor: createChatSettingsAccessor(host),
	requestToolUserInput: (request) => host.requestToolUserInput(request),
	createFileContentService: () => new FileContentService(obsidianApi),
	createMessageService: (fileContentService) =>
		new MessageService(
			host.app,
			fileContentService,
		),
	resolveVaultBasePath: () => resolveVaultBasePath(host),
	createBuiltinToolsRuntime: async (settings, skillScanner, executeSkillExecution) => {
		return await createBuiltinToolsRuntime({
			app: host.app,
			settings,
			skillScanner,
			executeSkillExecution,
			mcpManager: runtimeDeps.getMcpClientManager(),
		});
	},
	createSubAgentScannerService: () =>
		new SubAgentScannerService(host.app, {
			getAiDataFolder: () => host.getAiDataFolder(),
		}),
	createSubAgentWatcherService: (scanner) =>
		new SubAgentWatcherService(host.app, scanner),
});

export const createChatServiceDeps = (
	host: ChatConsumerHost,
	runtimeDeps: ChatRuntimeDeps,
	obsidianApi: ObsidianApiProvider,
): ChatServiceDeps => ({
	host: createChatHostDeps(host, obsidianApi, runtimeDeps),
	runtimeDeps,
});
