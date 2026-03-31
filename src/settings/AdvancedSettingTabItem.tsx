import { Setting } from "obsidian";
import { useEffect, useRef } from "react";
import { t } from "src/i18n/ai-runtime/helper";
import { localInstance } from "src/i18n/locals";
import {
	resolveToolExecutionSettings,
	syncToolExecutionSettings,
} from "src/domains/settings/config-ai-runtime";
import { DebugLogger } from "src/utils/DebugLogger";
import type { PluginSettingTabHost } from "./plugin-setting-host";

interface AdvancedSettingTabItemProps {
	host: Pick<
		PluginSettingTabHost,
		"settings" | "saveSettings"
	>;
}

export function AdvancedSettingTabItem(props: AdvancedSettingTabItemProps) {
	const { host } = props;
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!containerRef.current) {
			return;
		}
		const el = containerRef.current;
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

		// 工具执行设置
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

	return <div ref={containerRef}></div>;
}
