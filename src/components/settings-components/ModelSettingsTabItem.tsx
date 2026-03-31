import {
	AiRuntimeSettingsTabItem,
} from "src/components/settings-components/AiRuntimeSettingsTabItem";
import type { AiRuntimeSettingsPanelOptions } from "src/components/settings-components/AiRuntimeSettingsPanel";
import type { PluginSettingTabHost } from "src/settings/plugin-setting-host";

interface Props {
	host: Pick<
		PluginSettingTabHost,
		| "app"
		| "settings"
		| "saveSettings"
		| "updateChatSettings"
		| "refreshQuickActionsCache"
		| "getMcpClientManager"
	>;
}

const MODEL_SETTINGS_PANEL_OPTIONS: AiRuntimeSettingsPanelOptions = {
	sections: {
		modelSelection: false,
		providers: true,
		vendorApiKeys: false,
		quickActions: false,
		tabCompletion: false,
	},
	plainSections: {
		providers: true,
	},
}

export const ModelSettingsTabItem = ({ host }: Props) => {
	return (
		<AiRuntimeSettingsTabItem
			host={host}
			panelOptions={MODEL_SETTINGS_PANEL_OPTIONS}
		/>
	);
};
