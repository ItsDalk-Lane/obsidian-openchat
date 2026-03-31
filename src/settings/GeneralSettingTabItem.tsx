import { Setting } from "obsidian";
import { useEffect, useRef, useState } from "react";
import { formatProviderOptionLabel } from "src/components/chat-components/chatSettingsHelpers";
import { localInstance } from "src/i18n/locals";
import FolderSuggest from "src/components/combobox/FolderSuggest";
import { DEFAULT_SETTINGS } from "src/domains/settings/config";
import type { PluginSettingTabHost } from "./plugin-setting-host";
import "./GeneralSettingTabItem.css";

interface GeneralSettingTabItemProps {
	host: Pick<
		PluginSettingTabHost,
		| "app"
		| "manifest"
		| "settings"
		| "getAiRuntimeSettings"
		| "replaceSettings"
		| "tryEnsureAIDataFolders"
		| "updateChatSettings"
	>;
}

export function GeneralSettingTabItem(props: GeneralSettingTabItemProps) {
	const { host } = props;
	const settings = {
		...DEFAULT_SETTINGS,
		...host.settings,
	};
	const app = host.app;
	const formRef = useRef<HTMLDivElement>(null);

	const [settingsValue, setSettingsValue] = useState(settings);
	useEffect(() => {
		void host.replaceSettings(settingsValue);
	}, [host, settingsValue]);

	useEffect(() => {
		if (!formRef.current) {
			return;
		}
		const el = formRef.current;
		el.empty();
		const providers = host.getAiRuntimeSettings().providers ?? [];
		const providerOptions = providers.map((provider) => ({
			value: provider.tag,
			label: formatProviderOptionLabel(provider, providers),
		}));
		const currentDefaultModel = host.settings.chat.defaultModel;
		const selectedDefaultModel = providers.some((provider) => provider.tag === currentDefaultModel)
			? currentDefaultModel
			: providers[0]?.tag ?? "";

		new Setting(el).setName("V" + host.manifest.version).setDesc("");

		new Setting(el)
			.setName(localInstance.chat_settings_default_model)
			.setDesc(localInstance.chat_settings_default_model_desc)
			.addDropdown((dropdown) => {
				if (providers.length === 0) {
					dropdown.addOption("", localInstance.chat_settings_no_models);
					dropdown.setValue("");
					dropdown.setDisabled(true);
					return;
				}

				for (const option of providerOptions) {
					dropdown.addOption(option.value, option.label);
				}

				dropdown.setValue(selectedDefaultModel);
				dropdown.onChange((value) => {
					void host.updateChatSettings({ defaultModel: value });
				});
			});

		// AI data folder setting
		new Setting(el)
			.setName(localInstance.ai_data_folder)
			.setDesc(localInstance.ai_data_folder_desc)
			.addText((cb) => {
				cb.setValue(settingsValue.aiDataFolder);
				cb.setPlaceholder("System/AI Data");
				// 记录进入输入框时的初始值，用于失焦时判断是否变化
				let valueOnFocus = settingsValue.aiDataFolder;
				cb.inputEl.addEventListener('focus', () => {
					valueOnFocus = cb.getValue();
				});
				cb.inputEl.addEventListener('blur', () => {
					const current = cb.getValue();
					if (current !== valueOnFocus) {
						void host.tryEnsureAIDataFolders();
					}
				});
				cb.onChange((v) => {
					setSettingsValue((prev) => {
						return {
							...prev,
							aiDataFolder: v,
						};
					});
				});
				const suggest = new FolderSuggest(app, cb.inputEl);
				suggest.onSelect((folder) => {
					cb.setValue(folder.path);
					setSettingsValue((prev) => {
						return {
							...prev,
							aiDataFolder: folder.path,
						};
					});
					suggest.close();
					void host.tryEnsureAIDataFolders(folder.path);
				});
			});

		return () => {
			el.empty();
		};
	}, [host]);

	return (
		<div ref={formRef}></div>
	);
}
