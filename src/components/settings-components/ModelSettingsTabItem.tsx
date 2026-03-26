import type OpenChatPlugin from "src/main";
import {
	AiRuntimeSettingsTabItem,
} from "src/components/settings-components/AiRuntimeSettingsTabItem";
import type { AiRuntimeSettingsPanelOptions } from "src/components/settings-components/AiRuntimeSettingsPanel";

interface Props {
	plugin: OpenChatPlugin;
}

const MODEL_SETTINGS_PANEL_OPTIONS: AiRuntimeSettingsPanelOptions = {
	sections: {
		modelSelection: true,
		providers: true,
		vendorApiKeys: false,
		quickActions: false,
		tabCompletion: false,
	},
	plainSections: {
		providers: true,
	},
}

export const ModelSettingsTabItem = ({ plugin }: Props) => {
	return (
		<AiRuntimeSettingsTabItem
			plugin={plugin}
			panelOptions={MODEL_SETTINGS_PANEL_OPTIONS}
		/>
	);
};
