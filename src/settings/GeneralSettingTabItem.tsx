import { Setting } from "obsidian";
import { useEffect, useRef, useState } from "react";
import { localInstance } from "src/i18n/locals";
import FolderSuggest from "src/components/combobox/FolderSuggest";
import OpenChatPlugin from "src/main";
import { DEFAULT_SETTINGS } from "./PluginSettings";
import "./GeneralSettingTabItem.css";

export function GeneralSettingTabItem(props: { plugin: OpenChatPlugin }) {
	const { plugin } = props;
	const settings = {
		...DEFAULT_SETTINGS,
		...plugin.settings,
	};
	const app = plugin.app;
	const formRef = useRef<HTMLDivElement>(null);

	const [settingsValue, setSettingsValue] = useState(settings);
	useEffect(() => {
		plugin.replaceSettings(settingsValue);
	}, [settingsValue]);

	useEffect(() => {
		if (!formRef.current) {
			return;
		}
		const el = formRef.current;
		el.empty();

		new Setting(el).setName("V" + plugin.manifest.version).setDesc("");

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
						plugin.tryEnsureAIDataFolders();
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
					// 通过下拉建议选择时直接传入路径触发文件夹创建
					plugin.tryEnsureAIDataFolders(folder.path);
				});
			});

		return () => {
			el.empty();
		};
	}, [plugin.manifest.version]);

	return (
		<div>
			<div ref={formRef}></div>
		</div>
	);
}
