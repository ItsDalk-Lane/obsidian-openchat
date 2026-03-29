import { Setting } from "obsidian";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { localInstance } from "src/i18n/locals";
import FolderSuggest from "src/components/combobox/FolderSuggest";
import { DEFAULT_SETTINGS } from "src/domains/settings/config";
import { t } from "src/i18n/ai-runtime/helper";
import { DebugLogger } from "src/utils/DebugLogger";
import { resolveToolExecutionSettings, syncToolExecutionSettings } from "src/settings/ai-runtime/api";
import type { PluginSettingTabHost } from "./plugin-setting-host";
import "./GeneralSettingTabItem.css";

interface GeneralSettingTabItemProps {
	host: Pick<
		PluginSettingTabHost,
		| "app"
		| "manifest"
		| "settings"
		| "replaceSettings"
		| "saveSettings"
		| "tryEnsureAIDataFolders"
	>;
	children?: ReactNode;
}

export function GeneralSettingTabItem(props: GeneralSettingTabItemProps) {
	const { host, children } = props;
	const settings = {
		...DEFAULT_SETTINGS,
		...host.settings,
	};
	const app = host.app;
	const formRef = useRef<HTMLDivElement>(null);
	const debugSettingsRef = useRef<HTMLDivElement>(null);

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

		new Setting(el).setName("V" + host.manifest.version).setDesc("");

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

		// Tool execution settings
		const aiRuntime = host.settings.aiRuntime;
		const sharedToolExecutionSettings = resolveToolExecutionSettings(aiRuntime);

		new Setting(el)
			.setName(localInstance.tool_execution_max_tool_calls)
			.setDesc(localInstance.tool_execution_max_tool_calls_desc)
			.addText((text) =>
				text
					.setPlaceholder(String(sharedToolExecutionSettings.maxToolCalls))
					.setValue(String(sharedToolExecutionSettings.maxToolCalls))
					.onChange(async (value) => {
						const parsed = Number.parseInt(value, 10);
						if (!Number.isFinite(parsed) || parsed < 1) {
							return;
						}
						syncToolExecutionSettings(host.settings.aiRuntime, { maxToolCalls: parsed });
						await host.saveSettings();
					})
			);

		new Setting(el)
			.setName(localInstance.tool_execution_timeout)
			.setDesc(localInstance.tool_execution_timeout_desc)
			.addText((text) =>
				text
					.setPlaceholder(String(sharedToolExecutionSettings.timeoutMs))
					.setValue(String(sharedToolExecutionSettings.timeoutMs))
					.onChange(async (value) => {
						const parsed = Number.parseInt(value, 10);
						if (!Number.isFinite(parsed) || parsed < 1000) {
							return;
						}
						syncToolExecutionSettings(host.settings.aiRuntime, { timeoutMs: parsed });
						await host.saveSettings();
					})
			);

		return () => {
			el.empty();
		};
	}, [host]);

	// Debug settings - rendered after children
	useEffect(() => {
		if (!debugSettingsRef.current) {
			return;
		}
		const el = debugSettingsRef.current;
		el.empty();

		const aiRuntime = host.settings.aiRuntime;

		new Setting(el)
			.setName(t('Debug mode'))
			.setDesc(t('Debug mode description'))
			.addToggle((toggle) =>
				toggle.setValue(aiRuntime.debugMode ?? false).onChange(async (value) => {
					host.settings.aiRuntime.debugMode = value;
					await host.saveSettings();
					DebugLogger.setDebugMode(value);
				})
			);

		new Setting(el)
			.setName(t('LLM console log'))
			.setDesc(t('LLM console log description'))
			.addToggle((toggle) =>
				toggle.setValue(aiRuntime.enableLlmConsoleLog ?? false).onChange(async (value) => {
					host.settings.aiRuntime.enableLlmConsoleLog = value;
					await host.saveSettings();
					DebugLogger.setLlmConsoleLogEnabled(value);
				})
			);

		new Setting(el)
			.setName(t('LLM response preview length'))
			.setDesc(t('LLM response preview length description'))
			.addText((text) =>
				text
					.setPlaceholder('100')
					.setValue(String(aiRuntime.llmResponsePreviewChars ?? 100))
					.onChange(async (value) => {
						const parsed = Number.parseInt(value, 10);
						const previewChars = Number.isFinite(parsed) && parsed >= 0 ? parsed : 100;
						host.settings.aiRuntime.llmResponsePreviewChars = previewChars;
						await host.saveSettings();
						DebugLogger.setLlmResponsePreviewChars(previewChars);
					})
			);

		new Setting(el)
			.setName(t('Debug log level'))
			.setDesc(t('Debug log level description'))
			.addDropdown((dropdown) =>
				dropdown
					.addOption('debug', t('Debug log level debug option'))
					.addOption('info', t('Debug log level info option'))
					.addOption('warn', t('Debug log level warn option'))
					.addOption('error', t('Debug log level error option'))
					.setValue(aiRuntime.debugLevel ?? 'error')
					.onChange(async (value) => {
						const debugLevel = value as typeof aiRuntime.debugLevel;
						host.settings.aiRuntime.debugLevel = debugLevel;
						await host.saveSettings();
						DebugLogger.setDebugLevel(debugLevel);
					})
			);

		return () => {
			el.empty();
		};
	}, [host]);

	return (
		<div>
			<div ref={formRef}></div>
			{children ? <div className="general-settings-embedded-sections">{children}</div> : null}
			<div ref={debugSettingsRef}></div>
		</div>
	);
}
