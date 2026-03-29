import { useEffect, useRef } from "react";
import {
	AiRuntimeSettingsPanel,
	type AiRuntimeSettingsPanelOptions,
} from "src/components/settings-components/AiRuntimeSettingsPanel";
import type { PluginSettingTabHost } from "src/settings/plugin-setting-host";
import { getPromptTemplatePath } from "src/utils/AIPathManager";

interface Props {
	host: Pick<
		PluginSettingTabHost,
		| "app"
		| "getObsidianApiProvider"
		| "settings"
		| "saveSettings"
		| "updateChatSettings"
		| "refreshQuickActionsCache"
		| "getMcpClientManager"
	>;
	panelOptions?: AiRuntimeSettingsPanelOptions;
}

export const AiRuntimeSettingsTabItem = ({ host, panelOptions }: Props) => {
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!containerRef.current) return;

		const panel = new AiRuntimeSettingsPanel(host.app, {
			getObsidianApiProvider: () => host.getObsidianApiProvider(),
			getSettings: () => host.settings.aiRuntime,
			getChatSettings: () => host.settings.chat,
			getAiDataFolder: () => host.settings.aiDataFolder,
			getPromptTemplateFolder: () => getPromptTemplatePath(host.settings.aiDataFolder),
			saveSettings: async () => {
				await host.saveSettings();
			},
			updateChatSettings: async (partial) => {
				await host.updateChatSettings(partial);
			},
			refreshQuickActionsCache: async () => {
				await host.refreshQuickActionsCache();
			},
			getMcpClientManager: () => host.getMcpClientManager(),
		}, panelOptions);

		panel.render(containerRef.current);

		return () => {
			panel.dispose();
			containerRef.current?.replaceChildren();
		};
	}, [host, panelOptions]);

	return <div ref={containerRef} />;
};
