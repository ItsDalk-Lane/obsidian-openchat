import { PluginSettingTab as ObPluginSettingTab } from "obsidian";
import { StrictMode } from "react";
import { Root, createRoot } from "react-dom/client";
import { Tab } from "src/components/tab/Tab";
import { AiRuntimeSettingsTabItem } from "src/components/settings-components/AiRuntimeSettingsTabItem";
import { ObsidianAppContext } from "src/contexts/obsidianAppContext";
import { localInstance } from "src/i18n/locals";
import OpenChatPlugin from "src/main";
import { GeneralSettingTabItem } from "./GeneralSettingTabItem";

export class PluginSettingTab extends ObPluginSettingTab {
	plugin: OpenChatPlugin;
	root: Root | null = null;

	constructor(plugin: OpenChatPlugin) {
		super(plugin.app, plugin);
		this.plugin = plugin;
	}

	display() {
		const { containerEl } = this;
		this.root = createRoot(containerEl);
		this.root.render(
			<StrictMode>
				<ObsidianAppContext.Provider value={this.app}>
					<Tab
						items={[
							{
								id: "general_setting",
								title: localInstance.general_setting,
								content: (
									<GeneralSettingTabItem
										plugin={this.plugin}
									/>
								),
							},
							{
								id: "ai_runtime_setting",
								title: localInstance.ai_runtime_setting,
								content: <AiRuntimeSettingsTabItem plugin={this.plugin} />,
							},
						]}
					></Tab>
				</ObsidianAppContext.Provider>
			</StrictMode>
		);
	}

	hide() {
		this.root?.unmount();
		this.containerEl.empty();
	}
}
