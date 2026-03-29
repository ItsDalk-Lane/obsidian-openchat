import type { Plugin, PluginManifest, App } from 'obsidian';
import type { ChatService } from 'src/core/chat/services/chat-service';
import type { McpRuntimeManager } from 'src/domains/mcp/types';
import type { PluginSettings } from 'src/domains/settings/types';
import type { ObsidianApiProvider } from 'src/providers/providers.types';
import type { ChatSettings } from 'src/types/chat';

interface PluginSettingFeatureCoordinator {
	getChatFeatureManager(): { getService(): ChatService } | null;
	refreshQuickActionsCache(): Promise<void>;
	getMcpClientManager(): McpRuntimeManager | null;
	getObsidianApiProvider(): ObsidianApiProvider;
}

export type PluginSettingTabRuntime = Plugin & {
	app: App;
	manifest: PluginManifest;
	settings: PluginSettings;
	featureCoordinator: PluginSettingFeatureCoordinator;
	replaceSettings(value: Partial<PluginSettings>): Promise<void>;
	saveSettings(): Promise<void>;
	tryEnsureAIDataFolders(folderPath?: string): Promise<void>;
};

export interface PluginSettingTabHost {
	readonly app: App;
	readonly manifest: PluginManifest;
	readonly settings: PluginSettings;
	getObsidianApiProvider(): ObsidianApiProvider;
	replaceSettings(value: Partial<PluginSettings>): Promise<void>;
	saveSettings(): Promise<void>;
	tryEnsureAIDataFolders(folderPath?: string): Promise<void>;
	updateChatSettings(partial: Partial<ChatSettings>): Promise<void>;
	refreshQuickActionsCache(): Promise<void>;
	getMcpClientManager(): McpRuntimeManager | null;
	getChatSettingsService(): ChatService | null;
}

export function createPluginSettingTabHost(
	plugin: PluginSettingTabRuntime,
): PluginSettingTabHost {
	return {
		get app(): App {
			return plugin.app;
		},
		get manifest(): PluginManifest {
			return plugin.manifest;
		},
		get settings(): PluginSettings {
			return plugin.settings;
		},
		getObsidianApiProvider(): ObsidianApiProvider {
			return plugin.featureCoordinator.getObsidianApiProvider();
		},
		async replaceSettings(value: Partial<PluginSettings>): Promise<void> {
			await plugin.replaceSettings(value);
		},
		async saveSettings(): Promise<void> {
			await plugin.saveSettings();
		},
		async tryEnsureAIDataFolders(folderPath?: string): Promise<void> {
			await plugin.tryEnsureAIDataFolders(folderPath);
		},
		async updateChatSettings(partial: Partial<ChatSettings>): Promise<void> {
			await plugin.replaceSettings({
				chat: {
					...plugin.settings.chat,
					...partial,
				},
			});
		},
		async refreshQuickActionsCache(): Promise<void> {
			await plugin.featureCoordinator.refreshQuickActionsCache();
		},
		getMcpClientManager(): McpRuntimeManager | null {
			return plugin.featureCoordinator.getMcpClientManager();
		},
		getChatSettingsService(): ChatService | null {
			return plugin.featureCoordinator.getChatFeatureManager()?.getService() ?? null;
		},
	};
}
