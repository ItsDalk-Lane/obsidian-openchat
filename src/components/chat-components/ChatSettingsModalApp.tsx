import { Notice } from 'obsidian'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Tab, type TabItem } from 'src/components/tab/Tab'
import { localInstance } from 'src/i18n/locals'
import type { AiRuntimeSettings } from 'src/settings/ai-runtime'
import type { SkillScanResult } from 'src/services/skills'
import type { SubAgentScanResult } from 'src/tools/sub-agents'
import { BUILTIN_SERVER_ID } from 'src/tools/runtime/constants'
import { DEFAULT_MCP_SETTINGS, McpConfigImporter, type McpServerConfig, type McpServerState, type McpSettings, type McpToolInfo } from 'src/services/mcp'
import { McpImportModal, McpServerEditModal } from 'src/services/mcp/McpConfigModals'
import {
	DEFAULT_MESSAGE_MANAGEMENT_SETTINGS,
	normalizeMessageManagementSettings,
	type ChatSettings,
} from 'src/types/chat'
import { formatProviderOptionLabel } from './chatSettingsHelpers'
import {
	AiChatSettingsTab,
	SystemPromptSettingsTab,
	ToolsSettingsTab,
} from './chatSettingsGeneralTabs'
import {
	McpServersSettingsTab,
	SkillsSettingsTab,
	SubAgentsSettingsTab,
} from './chatSettingsIntegrationTabs'
import { DEFAULT_CHAT_SETTINGS_TAB_ID, type ChatSettingsModalProps, type ExternalMcpEntry, type ProviderOption } from './chatSettingsModalTypes'

const cloneValue = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T

export const ChatSettingsModalApp = ({ app, service }: ChatSettingsModalProps) => {
	const [chatSettings, setChatSettings] = useState<ChatSettings>(() => service.getChatSettingsSnapshot())
	const [aiRuntimeSettings, setAiRuntimeSettings] = useState<AiRuntimeSettings>(() => service.getAiRuntimeSettingsSnapshot())
	const [mcpStates, setMcpStates] = useState<McpServerState[]>(() => service.getMcpClientManager()?.getAllStates() ?? [])
	const [recentTurnsDraft, setRecentTurnsDraft] = useState<string | null>(null)
	const [skillScanResult, setSkillScanResult] = useState<SkillScanResult>(() => service.getInstalledSkillsSnapshot() ?? { skills: [], errors: [] })
	const [subAgentScanResult, setSubAgentScanResult] = useState<SubAgentScanResult>(() => service.getInstalledSubAgentsSnapshot() ?? { agents: [], errors: [] })
	const [builtinServerToolsMap, setBuiltinServerToolsMap] = useState<Map<string, McpToolInfo[]>>(() => new Map())

	const providers = aiRuntimeSettings.providers ?? service.getProviders()
	const providerOptions = useMemo<ProviderOption[]>(
		() =>
			providers.map((provider) => ({
				value: provider.tag,
				label: formatProviderOptionLabel(provider),
			})),
		[providers]
	)
	const mcpSettings = useMemo<McpSettings>(
		() => ({
			...DEFAULT_MCP_SETTINGS,
			...(aiRuntimeSettings.mcp ?? {}),
			servers: cloneValue(aiRuntimeSettings.mcp?.servers ?? []),
		}),
		[aiRuntimeSettings.mcp]
	)
	const messageManagement = useMemo(
		() =>
			normalizeMessageManagementSettings({
				...DEFAULT_MESSAGE_MANAGEMENT_SETTINGS,
				...(chatSettings.messageManagement ?? {}),
			}),
		[chatSettings.messageManagement]
	)
	const activeModelTag = useMemo(
		() =>
			service.getState().selectedModelId
			|| chatSettings.defaultModel
			|| providers[0]?.tag
			|| null,
		[chatSettings.defaultModel, providers, service]
	)
	const resolvedContextBudget = useMemo(
		() => service.getResolvedContextBudget(activeModelTag),
		[activeModelTag, service]
	)

	const reloadSnapshots = useCallback(() => {
		setChatSettings(service.getChatSettingsSnapshot())
		setAiRuntimeSettings(service.getAiRuntimeSettingsSnapshot())
		setMcpStates(service.getMcpClientManager()?.getAllStates() ?? [])
	}, [service])

	useEffect(() => {
		reloadSnapshots()
	}, [reloadSnapshots])

	useEffect(() => {
		const manager = service.getMcpClientManager()
		if (!manager) {
			setMcpStates([])
			return undefined
		}

		setMcpStates(manager.getAllStates())
		return manager.onStateChange((states: McpServerState[]) => {
			setMcpStates(states)
		})
	}, [service])

	useEffect(() => {
		let cancelled = false
		void service.loadInstalledSkills().then((result) => {
			if (!cancelled) {
				setSkillScanResult(result)
			}
		})
		const unsubscribe = service.onInstalledSkillsChange((result) => {
			setSkillScanResult(result)
		})
		return () => {
			cancelled = true
			unsubscribe()
		}
	}, [service])

	useEffect(() => {
		let cancelled = false
		void service.loadInstalledSubAgents().then((result) => {
			if (!cancelled) {
				setSubAgentScanResult(result)
			}
		})
		const unsubscribe = service.onInstalledSubAgentsChange((result) => {
			setSubAgentScanResult(result)
		})
		return () => {
			cancelled = true
			unsubscribe()
		}
	}, [service])

	useEffect(() => {
		let cancelled = false
		service
			.getBuiltinToolsForSettings()
			.then((tools) => {
				if (!cancelled) {
					setBuiltinServerToolsMap(new Map([[BUILTIN_SERVER_ID, tools as McpToolInfo[]]]))
				}
			})
			.catch(() => {
				/* 忽略 */
			})

		return () => {
			cancelled = true
		}
	}, [
		service,
		mcpSettings.builtinCoreToolsEnabled,
		mcpSettings.builtinFilesystemEnabled,
		mcpSettings.builtinFetchEnabled,
		mcpSettings.builtinBingSearchEnabled,
		skillScanResult.skills.length,
	])

	const persistChatSettings = useCallback(
		async (partial: Partial<ChatSettings>): Promise<boolean> => {
			const previousChatSettings = chatSettings
			setChatSettings((current) => ({ ...current, ...partial }))

			try {
				await service.persistChatSettings(partial)
				reloadSnapshots()
				return true
			} catch {
				setChatSettings(previousChatSettings)
				reloadSnapshots()
				return false
			}
		},
		[chatSettings, reloadSnapshots, service]
	)

	const persistGlobalSystemPrompts = useCallback(
		async (enabled: boolean): Promise<boolean> => {
			const previousAiRuntimeSettings = aiRuntimeSettings
			setAiRuntimeSettings((current) => ({
				...current,
				enableGlobalSystemPrompts: enabled,
			}))

			try {
				await service.persistGlobalSystemPromptsEnabled(enabled)
				reloadSnapshots()
				return true
			} catch {
				setAiRuntimeSettings(previousAiRuntimeSettings)
				reloadSnapshots()
				return false
			}
		},
		[aiRuntimeSettings, reloadSnapshots, service]
	)

	const persistMcpSettings = useCallback(
		async (nextMcpSettings: McpSettings): Promise<boolean> => {
			const previousAiRuntimeSettings = aiRuntimeSettings
			setAiRuntimeSettings((current) => ({
				...current,
				mcp: cloneValue(nextMcpSettings),
			}))

			try {
				await service.persistMcpSettings(nextMcpSettings)
				reloadSnapshots()
				return true
			} catch {
				setAiRuntimeSettings(previousAiRuntimeSettings)
				reloadSnapshots()
				return false
			}
		},
		[aiRuntimeSettings, reloadSnapshots, service]
	)

	const openMcpServerEditor = useCallback(
		(existingServer: McpServerConfig | null) => {
			new McpServerEditModal(app, existingServer, async (serverConfig) => {
				const nextServers = existingServer
					? mcpSettings.servers.map((server) =>
						server.id === existingServer.id ? serverConfig : server
					)
					: [...mcpSettings.servers, serverConfig]

				const success = await persistMcpSettings({
					...mcpSettings,
					servers: nextServers,
				})
				if (!success) {
					throw new Error(localInstance.chat_settings_save_failed)
				}
			}).open()
		},
		[app, mcpSettings, persistMcpSettings]
	)

	const openMcpJsonImportModal = useCallback(
		(manual: boolean) => {
			new McpImportModal(
				app,
				manual
					? {
						title: localInstance.mcp_manual_config_title,
						description: localInstance.mcp_manual_config_desc,
						label: localInstance.mcp_manual_config_label,
						placeholder:
							'{\n  "mcpServers": {\n    "zread": {\n      "type": "streamable-http",\n      "url": "https://open.bigmodel.cn/api/mcp/zread/mcp",\n      "headers": {\n        "Authorization": "Bearer your_api_key"\n      }\n    }\n  }\n}',
						confirmText: localInstance.mcp_manual_config_confirm,
					}
					: {
						title: localInstance.mcp_import_title,
						description: localInstance.mcp_import_desc,
						label: localInstance.mcp_import_label,
						placeholder:
							'{\n  "mcpServers": {\n    "server-name": {\n      "command": "npx",\n      "args": ["-y", "@modelcontextprotocol/server-filesystem"]\n    }\n  }\n}',
						confirmText: localInstance.mcp_import_confirm,
					},
				async (jsonContent) => {
					const result = McpConfigImporter.importFromJson(jsonContent, mcpSettings.servers)
					const success = await persistMcpSettings({
						...mcpSettings,
						servers: result.merged,
					})
					if (!success) {
						throw new Error(localInstance.chat_settings_save_failed)
					}
					new Notice(
						`${manual ? localInstance.mcp_manual_config_confirm : localInstance.mcp_import_confirm}: +${result.added.length} / ${result.skipped.length}`
					)
				}
			).open()
		},
		[app, mcpSettings, persistMcpSettings]
	)

	const updateMcpConnectionState = useCallback(
		async (serverId: string, enabled: boolean) => {
			const manager = service.getMcpClientManager()
			if (!manager) {
				return
			}

			try {
				if (enabled) {
					await manager.connectServer(serverId)
				} else {
					await manager.disconnectServer(serverId)
				}
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error)
				new Notice(`${localInstance.mcp_server_toggle_failed}: ${message}`)
			}
		},
		[service]
	)

	const handleToggleSingleBuiltinTool = useCallback(
		async (toolName: string, enabled: boolean) => {
			const current = mcpSettings.disabledBuiltinToolNames ?? []
			const next = enabled
				? current.filter((name) => name !== toolName)
				: current.includes(toolName)
					? current
					: [...current, toolName]
			await persistMcpSettings({ ...mcpSettings, disabledBuiltinToolNames: next })
		},
		[mcpSettings, persistMcpSettings]
	)

	const handleEnableAllBuiltinTools = useCallback(async () => {
		await persistMcpSettings({ ...mcpSettings, disabledBuiltinToolNames: [] })
	}, [mcpSettings, persistMcpSettings])

	const handleToggleExternalMcpServer = useCallback(
		async (entry: ExternalMcpEntry, enabled: boolean) => {
			const success = await persistMcpSettings({
				...mcpSettings,
				servers: mcpSettings.servers.map((server) =>
					server.id === entry.server.id ? { ...server, enabled } : server
				),
			})
			if (success) {
				await updateMcpConnectionState(entry.server.id, enabled)
			}
		},
		[mcpSettings, persistMcpSettings, updateMcpConnectionState]
	)

	const handleDeleteExternalMcpServer = useCallback(
		async (serverId: string) => {
			await persistMcpSettings({
				...mcpSettings,
				servers: mcpSettings.servers.filter((server) => server.id !== serverId),
			})
		},
		[mcpSettings, persistMcpSettings]
	)

	const refreshInstalledSkills = useCallback(async () => setSkillScanResult(await service.refreshInstalledSkills()), [service])
	const refreshInstalledSubAgents = useCallback(async () => setSubAgentScanResult(await service.refreshInstalledSubAgents()), [service])

	const externalMcpEntries = useMemo<ExternalMcpEntry[]>(
		() => mcpSettings.servers.map((server) => ({ server })),
		[mcpSettings.servers]
	)
	const mcpStateMap = useMemo(
		() => new Map(mcpStates.map((state) => [state.serverId, state])),
		[mcpStates]
	)
	const allBuiltinTools = useMemo(
		() => builtinServerToolsMap.get(BUILTIN_SERVER_ID) ?? [],
		[builtinServerToolsMap]
	)

	const copyToolName = useCallback(async (toolName: string): Promise<void> => {
		try {
			await navigator.clipboard.writeText(toolName)
			new Notice(localInstance.copy_success)
		} catch {
			new Notice(localInstance.copy_failed)
		}
	}, [])

	const tabItems = useMemo<TabItem[]>(
		() => [
			{
				id: 'ai-chat',
				title: localInstance.tab_ai_chat,
				content: (
					<AiChatSettingsTab
						chatSettings={chatSettings}
						providers={providers}
						providerOptions={providerOptions}
						resolvedContextBudget={resolvedContextBudget}
						messageManagement={messageManagement}
						recentTurnsDraft={recentTurnsDraft}
						setRecentTurnsDraft={setRecentTurnsDraft}
						persistChatSettings={persistChatSettings}
					/>
				),
			},
			{
				id: 'system-prompts',
				title: localInstance.tab_system_prompts,
				content: (
					<SystemPromptSettingsTab
						app={app}
						aiRuntimeSettings={aiRuntimeSettings}
						persistGlobalSystemPrompts={persistGlobalSystemPrompts}
					/>
				),
			},
			{
				id: 'mcp-servers',
				title: localInstance.tab_mcp_servers,
				content: (
					<McpServersSettingsTab
						externalMcpEntries={externalMcpEntries}
						mcpStateMap={mcpStateMap}
						openMcpServerEditor={openMcpServerEditor}
						openMcpJsonImportModal={openMcpJsonImportModal}
						handleToggleExternalMcpServer={handleToggleExternalMcpServer}
						handleDeleteExternalMcpServer={handleDeleteExternalMcpServer}
					/>
				),
			},
			{
				id: 'skills',
				title: localInstance.tab_skills,
				content: (
					<SkillsSettingsTab
						skillScanResult={skillScanResult}
						refreshInstalledSkills={refreshInstalledSkills}
					/>
				),
			},
			{
				id: 'sub-agents',
				title: localInstance.tab_sub_agents,
				content: (
					<SubAgentsSettingsTab
						subAgentScanResult={subAgentScanResult}
						refreshInstalledSubAgents={refreshInstalledSubAgents}
					/>
				),
			},
			{
				id: 'tools',
				title: localInstance.tab_tools,
				content: (
					<ToolsSettingsTab
						allBuiltinTools={allBuiltinTools}
						mcpSettings={mcpSettings}
						handleEnableAllBuiltinTools={handleEnableAllBuiltinTools}
						handleToggleSingleBuiltinTool={handleToggleSingleBuiltinTool}
						copyToolName={copyToolName}
					/>
				),
			},
		],
		[
			aiRuntimeSettings,
			allBuiltinTools,
			app,
			chatSettings,
			copyToolName,
			externalMcpEntries,
			handleDeleteExternalMcpServer,
			handleEnableAllBuiltinTools,
			handleToggleExternalMcpServer,
			handleToggleSingleBuiltinTool,
			mcpSettings,
			mcpStateMap,
			messageManagement,
			openMcpJsonImportModal,
			openMcpServerEditor,
			persistChatSettings,
			persistGlobalSystemPrompts,
			providerOptions,
			providers,
			recentTurnsDraft,
			refreshInstalledSkills,
			refreshInstalledSubAgents,
			resolvedContextBudget,
			skillScanResult,
			subAgentScanResult,
		]
	)

	return (
		<div className="chat-settings-modal-shell">
			<Tab
				items={tabItems}
				defaultValue={DEFAULT_CHAT_SETTINGS_TAB_ID}
				className="chat-settings-modal-tabs"
			/>
		</div>
	)
}
