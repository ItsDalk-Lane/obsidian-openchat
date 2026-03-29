import { Plugin, PluginSettingTab as ObPluginSettingTab } from "obsidian";
import { StrictMode, useEffect } from "react";
import { Root, createRoot } from "react-dom/client";
import { Tab } from "src/components/tab/Tab";
import {
	AiRuntimeSettingsTabItem,
} from "src/components/settings-components/AiRuntimeSettingsTabItem";
import type {
	AiRuntimeSettingsPanelOptions,
	AiRuntimeSettingsPanelState,
} from "src/components/settings-components/AiRuntimeSettingsPanel";
import { ObsidianAppContext } from "src/contexts/obsidianAppContext";
import { t } from "src/i18n/ai-runtime/helper";
import { localInstance } from "src/i18n/locals";
import { GeneralSettingTabItem } from "./GeneralSettingTabItem";
import { ChatSettingsProvider } from "src/components/chat-components/ChatSettingsContext";
import {
	AiChatSettingsTab,
	SystemPromptSettingsTab,
	ToolsSettingsTab,
} from "src/components/chat-components/chatSettingsGeneralTabs";
import {
	McpServersSettingsTab,
	SkillsSettingsTab,
	SubAgentsSettingsTab,
} from "src/components/chat-components/chatSettingsIntegrationTabs";
import { useChatSettingsContext } from "src/components/chat-components/ChatSettingsContext";
import { ModelSettingsTabItem } from "src/components/settings-components/ModelSettingsTabItem";
import {
	createPluginSettingTabHost,
	type PluginSettingTabHost,
	type PluginSettingTabRuntime,
} from "./plugin-setting-host";


const GENERAL_AI_RUNTIME_PANEL_OPTIONS: AiRuntimeSettingsPanelOptions = {
	sections: {
		providers: false,
		vendorApiKeys: false,
		quickActions: false,
		tabCompletion: false,
	},
}

const QUICK_ACTIONS_PANEL_OPTIONS: AiRuntimeSettingsPanelOptions = {
	sections: {
		providers: false,
		vendorApiKeys: false,
		quickActions: true,
		tabCompletion: false,
	},
	plainSections: {
		quickActions: true,
	},
	initialCollapsed: {
		quickActions: false,
	},
}

const TAB_COMPLETION_PANEL_OPTIONS: AiRuntimeSettingsPanelOptions = {
	sections: {
		providers: false,
		vendorApiKeys: false,
		quickActions: false,
		tabCompletion: true,
	},
	plainSections: {
		tabCompletion: true,
	},
	initialCollapsed: {
		tabCompletion: false,
	},
}

const GeneralSettingsTabContent = ({
	host,
	aiRuntimePanelOptions,
}: {
	host: PluginSettingTabHost
	aiRuntimePanelOptions: AiRuntimeSettingsPanelOptions
}) => {
	const {
		chatSettings,
		messageManagement,
		recentTurnsDraft,
		setRecentTurnsDraft,
		persistChatSettings,
	} = useChatSettingsContext()

	return (
		<GeneralSettingTabItem host={host}>
			<AiRuntimeSettingsTabItem
				host={host}
				panelOptions={aiRuntimePanelOptions}
			/>
			<AiChatSettingsTab
				chatSettings={chatSettings}
				messageManagement={messageManagement}
				recentTurnsDraft={recentTurnsDraft}
				setRecentTurnsDraft={setRecentTurnsDraft}
				persistChatSettings={persistChatSettings}
				embedded
			/>
		</GeneralSettingTabItem>
	)
}

const ModelsTabContent = ({ host }: { host: PluginSettingTabHost }) => {
	return <ModelSettingsTabItem host={host} />
}

const GeneralSettingsFallbackContent = ({
	host,
	aiRuntimePanelOptions,
}: {
	host: PluginSettingTabHost
	aiRuntimePanelOptions: AiRuntimeSettingsPanelOptions
}) => (
	<GeneralSettingTabItem host={host}>
		<AiRuntimeSettingsTabItem
			host={host}
			panelOptions={aiRuntimePanelOptions}
		/>
	</GeneralSettingTabItem>
)

const SystemPromptsTabContent = ({ app }: { app: import("obsidian").App }) => {
	const { aiRuntimeSettings, persistGlobalSystemPrompts } = useChatSettingsContext()
	return (
		<SystemPromptSettingsTab
			app={app}
			aiRuntimeSettings={aiRuntimeSettings}
			persistGlobalSystemPrompts={persistGlobalSystemPrompts}
		/>
	)
}

const McpServersTabContent = () => {
	const {
		externalMcpEntries, mcpStateMap, openMcpServerEditor,
		openMcpJsonImportModal, handleToggleExternalMcpServer, handleDeleteExternalMcpServer,
	} = useChatSettingsContext()
	return (
		<McpServersSettingsTab
			externalMcpEntries={externalMcpEntries}
			mcpStateMap={mcpStateMap}
			openMcpServerEditor={openMcpServerEditor}
			openMcpJsonImportModal={openMcpJsonImportModal}
			handleToggleExternalMcpServer={handleToggleExternalMcpServer}
			handleDeleteExternalMcpServer={handleDeleteExternalMcpServer}
		/>
	)
}

const SkillsTabContent = () => {
	const { skillScanResult, refreshInstalledSkills } = useChatSettingsContext()

	// 每次进入这个界面时自动扫描一次
	useEffect(() => {
		void refreshInstalledSkills()
	}, [refreshInstalledSkills])

	return (
		<SkillsSettingsTab
			skillScanResult={skillScanResult}
			refreshInstalledSkills={refreshInstalledSkills}
		/>
	)
}

const SubAgentsTabContent = () => {
	const { subAgentScanResult, refreshInstalledSubAgents } = useChatSettingsContext()

	// 每次进入这个界面时自动扫描一次
	useEffect(() => {
		void refreshInstalledSubAgents()
	}, [refreshInstalledSubAgents])

	return (
		<SubAgentsSettingsTab
			subAgentScanResult={subAgentScanResult}
			refreshInstalledSubAgents={refreshInstalledSubAgents}
		/>
	)
}

const ToolsTabContent = () => {
	const {
		allBuiltinTools, mcpSettings, handleEnableAllBuiltinTools,
		handleToggleSingleBuiltinTool, copyToolName,
	} = useChatSettingsContext()
	return (
		<ToolsSettingsTab
			allBuiltinTools={allBuiltinTools}
			mcpSettings={mcpSettings}
			handleEnableAllBuiltinTools={handleEnableAllBuiltinTools}
			handleToggleSingleBuiltinTool={handleToggleSingleBuiltinTool}
			copyToolName={copyToolName}
		/>
	)
}

const QuickActionsTabContent = ({
	host,
	panelOptions,
}: {
	host: PluginSettingTabHost
	panelOptions: AiRuntimeSettingsPanelOptions
}) => (
	<AiRuntimeSettingsTabItem
		host={host}
		panelOptions={panelOptions}
	/>
)

const TabCompletionTabContent = ({
	host,
	panelOptions,
}: {
	host: PluginSettingTabHost
	panelOptions: AiRuntimeSettingsPanelOptions
}) => (
	<AiRuntimeSettingsTabItem
		host={host}
		panelOptions={panelOptions}
	/>
)

export class PluginSettingTab extends ObPluginSettingTab {
	plugin: PluginSettingTabHost;
	root: Root | null = null;
	private generalAiRuntimePanelState: AiRuntimeSettingsPanelState = {};
	private quickActionsPanelState: AiRuntimeSettingsPanelState = {};
	private tabCompletionPanelState: AiRuntimeSettingsPanelState = {};
	private readonly generalAiRuntimePanelOptions: AiRuntimeSettingsPanelOptions;
	private readonly quickActionsPanelOptions: AiRuntimeSettingsPanelOptions;
	private readonly tabCompletionPanelOptions: AiRuntimeSettingsPanelOptions;

	constructor(plugin: PluginSettingTabRuntime) {
		super(plugin.app, plugin as Plugin);
		this.plugin = createPluginSettingTabHost(plugin);
		this.generalAiRuntimePanelOptions = {
			...GENERAL_AI_RUNTIME_PANEL_OPTIONS,
			state: this.generalAiRuntimePanelState,
		};
		this.quickActionsPanelOptions = {
			...QUICK_ACTIONS_PANEL_OPTIONS,
			state: this.quickActionsPanelState,
		};
		this.tabCompletionPanelOptions = {
			...TAB_COMPLETION_PANEL_OPTIONS,
			state: this.tabCompletionPanelState,
		};
	}

	display() {
		const { containerEl } = this;
		this.root = createRoot(containerEl);

		const service = this.plugin.getChatSettingsService();

		const baseItems = [
			{
				id: "general_setting",
				title: localInstance.general_setting,
				content: service
					? <GeneralSettingsTabContent host={this.plugin} aiRuntimePanelOptions={this.generalAiRuntimePanelOptions} />
					: <GeneralSettingsFallbackContent host={this.plugin} aiRuntimePanelOptions={this.generalAiRuntimePanelOptions} />,
			},
			{
				id: "models_setting",
				title: localInstance.tab_models,
				content: <ModelsTabContent host={this.plugin} />,
			},
			{
				id: "quick_actions_setting",
				title: localInstance.selection_toolbar_settings_section,
				content: <QuickActionsTabContent host={this.plugin} panelOptions={this.quickActionsPanelOptions} />,
			},
			{
				id: "tab_completion_setting",
				title: t('AI Tab completion'),
				content: <TabCompletionTabContent host={this.plugin} panelOptions={this.tabCompletionPanelOptions} />,
			},
		];

		const chatItems = service
			? [
				{
					id: "chat_system_prompts",
					title: localInstance.tab_system_prompts,
					content: <SystemPromptsTabContent app={this.app} />,
				},
				{
					id: "chat_mcp_servers",
					title: localInstance.tab_mcp_servers,
					content: <McpServersTabContent />,
				},
				{
					id: "chat_skills",
					title: localInstance.tab_skills,
					content: <SkillsTabContent />,
				},
				{
					id: "chat_sub_agents",
					title: localInstance.tab_sub_agents,
					content: <SubAgentsTabContent />,
				},
				{
					id: "chat_tools",
					title: localInstance.tab_tools,
					content: <ToolsTabContent />,
				},
			]
			: [];

		const allItems = [...baseItems, ...chatItems];

		this.root.render(
			<StrictMode>
				<ObsidianAppContext.Provider value={this.app}>
					{service ? (
						<ChatSettingsProvider app={this.app} service={service}>
							<Tab items={allItems} />
						</ChatSettingsProvider>
					) : (
						<Tab items={allItems} />
					)}
				</ObsidianAppContext.Provider>
			</StrictMode>
		);
	}

	hide() {
		this.root?.unmount();
		this.containerEl.empty();
	}
}
