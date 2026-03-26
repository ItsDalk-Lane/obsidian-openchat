import { useEffect, useRef } from "react";
import type OpenChatPlugin from "src/main";
import {
	AiRuntimeSettingsPanel,
	type AiRuntimeSettingsPanelOptions,
} from "src/components/settings-components/AiRuntimeSettingsPanel";
import { getPromptTemplatePath } from "src/utils/AIPathManager";

interface Props {
	plugin: OpenChatPlugin;
	panelOptions?: AiRuntimeSettingsPanelOptions;
}

export const AiRuntimeSettingsTabItem = ({ plugin, panelOptions }: Props) => {
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!containerRef.current) return;

		const panel = new AiRuntimeSettingsPanel(plugin.app, {
			getSettings: () => plugin.settings.aiRuntime,
			getChatSettings: () => plugin.settings.chat,
			getAiDataFolder: () => plugin.settings.aiDataFolder,
			getPromptTemplateFolder: () => getPromptTemplatePath(plugin.settings.aiDataFolder),
			saveSettings: async () => {
				await plugin.saveSettings();
			},
			updateChatSettings: async (partial) => {
				plugin.settings.chat = {
					...plugin.settings.chat,
					...partial,
				};
				await plugin.saveSettings();
			},
			refreshQuickActionsCache: async () => {
				// 通过插件实例访问 FeatureCoordinator 来刷新快捷操作缓存
				await plugin.featureCoordinator.refreshQuickActionsCache();
			},
			getMcpClientManager: () => plugin.featureCoordinator.getMcpClientManager(),
		}, panelOptions);

		panel.render(containerRef.current);

		return () => {
			panel.dispose();
			containerRef.current?.replaceChildren();
		};
	}, [panelOptions, plugin]);

	return <div ref={containerRef} />;
};
