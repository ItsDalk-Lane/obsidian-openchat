import { Setting } from "obsidian";
import { useEffect, useRef } from "react";
import {
	DEFAULT_MESSAGE_MANAGEMENT_SETTINGS,
	normalizeMessageManagementSettings,
} from "src/domains/chat/config";
import { formatProviderOptionLabel } from "src/components/chat-components/chatSettingsHelpers";
import { localInstance } from "src/i18n/locals";
import type { PluginSettingTabHost } from "./plugin-setting-host";

interface ChatInterfaceSettingTabItemProps {
	host: Pick<
		PluginSettingTabHost,
		"settings" | "updateChatSettings"
	>;
}

export function ChatInterfaceSettingTabItem(props: ChatInterfaceSettingTabItemProps) {
	const { host } = props;
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!containerRef.current) {
			return;
		}
		const el = containerRef.current;
		el.empty();

		const providers = host.settings.aiRuntime.providers ?? [];
		const providerOptions = providers.map((provider) => ({
			value: provider.tag,
			label: formatProviderOptionLabel(provider, providers),
		}));
		const chatSettings = host.settings.chat;
		const messageManagement = normalizeMessageManagementSettings({
			...DEFAULT_MESSAGE_MANAGEMENT_SETTINGS,
			...(chatSettings.messageManagement ?? {}),
		});

		// 摘要模型
		new Setting(el)
			.setName(localInstance.chat_settings_summary_model)
			.setDesc(localInstance.chat_settings_summary_model_desc)
			.addDropdown((dropdown) => {
				dropdown.addOption('', localInstance.chat_settings_summary_model_follow_current);
				for (const option of providerOptions) {
					dropdown.addOption(option.value, option.label);
				}
				dropdown.setValue(messageManagement.summaryModelTag ?? '');
				dropdown.setDisabled(providers.length === 0);
				dropdown.onChange((value) => {
					void host.updateChatSettings({
						messageManagement: {
							...messageManagement,
							summaryModelTag: value || undefined,
						},
					});
				});
			});

		return () => {
			el.empty();
		};
	}, [host]);

	return <div ref={containerRef}></div>;
}
