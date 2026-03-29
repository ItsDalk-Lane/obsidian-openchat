import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
	type Dispatch,
	type ReactNode,
	type SetStateAction,
} from 'react'
import type { App } from 'obsidian'
import { localInstance } from 'src/i18n/locals'
import type { AiRuntimeSettings } from 'src/settings/ai-runtime/api'
import type { SkillScanResult } from 'src/domains/skills/types'
import type { SubAgentScanResult } from 'src/tools/sub-agents/types'
import { BUILTIN_SERVER_ID } from 'src/tools/runtime/constants'
import { McpConfigImporter } from 'src/services/mcp/McpConfigImporter'
import {
	DEFAULT_MCP_SETTINGS,
	type McpServerConfig,
	type McpServerState,
	type McpSettings,
	type McpToolInfo,
} from 'src/services/mcp/types'
import { McpImportModal, McpServerEditModal } from 'src/services/mcp/McpConfigModals'
import {
	DEFAULT_MESSAGE_MANAGEMENT_SETTINGS,
	normalizeMessageManagementSettings,
	type ChatSettings,
} from 'src/types/chat'
import { formatProviderOptionLabel } from './chatSettingsHelpers'
import type { ChatService } from 'src/core/chat/services/chat-service'
import type { ExternalMcpEntry, ProviderOption } from './chatSettingsTypes'

const cloneValue = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T

export interface ChatSettingsContextValue {
	// State
	chatSettings: ChatSettings
	aiRuntimeSettings: AiRuntimeSettings
	recentTurnsDraft: string | null
	setRecentTurnsDraft: Dispatch<SetStateAction<string | null>>
	skillScanResult: SkillScanResult
	subAgentScanResult: SubAgentScanResult
	// Derived
	providers: AiRuntimeSettings['providers']
	providerOptions: ProviderOption[]
	mcpSettings: McpSettings
	messageManagement: ReturnType<typeof normalizeMessageManagementSettings>
	resolvedContextBudget: ReturnType<ChatService['getResolvedContextBudget']>
	externalMcpEntries: ExternalMcpEntry[]
	mcpStateMap: Map<string, McpServerState>
	allBuiltinTools: McpToolInfo[]
	// Callbacks
	persistChatSettings: (partial: Partial<ChatSettings>) => Promise<boolean>
	persistGlobalSystemPrompts: (enabled: boolean) => Promise<boolean>
	openMcpServerEditor: (existingServer: McpServerConfig | null) => void
	openMcpJsonImportModal: (manual: boolean) => void
	handleToggleSingleBuiltinTool: (toolName: string, enabled: boolean) => Promise<void>
	handleEnableAllBuiltinTools: () => Promise<void>
	handleToggleExternalMcpServer: (entry: ExternalMcpEntry, enabled: boolean) => Promise<void>
	handleDeleteExternalMcpServer: (serverId: string) => Promise<void>
	refreshInstalledSkills: () => Promise<void>
	refreshInstalledSubAgents: () => Promise<void>
	copyToolName: (toolName: string) => Promise<void>
}

export const ChatSettingsContext = createContext<ChatSettingsContextValue | null>(null)

export const useChatSettingsContext = (): ChatSettingsContextValue => {
	const ctx = useContext(ChatSettingsContext)
	if (!ctx) {
		throw new Error('useChatSettingsContext 必须在 ChatSettingsProvider 内部使用')
	}
	return ctx
}

interface ChatSettingsProviderProps {
	app: App
	service: ChatService
	children: ReactNode
}

export const ChatSettingsProvider = ({ app, service, children }: ChatSettingsProviderProps) => {
	const [chatSettings, setChatSettings] = useState<ChatSettings>(
		() => service.getChatSettingsSnapshot()
	)
	const [aiRuntimeSettings, setAiRuntimeSettings] = useState<AiRuntimeSettings>(
		() => service.getAiRuntimeSettingsSnapshot()
	)
	const [mcpStates, setMcpStates] = useState<McpServerState[]>(
		() => service.getMcpClientManager()?.getAllStates() ?? []
	)
	const [recentTurnsDraft, setRecentTurnsDraft] = useState<string | null>(null)
	const [skillScanResult, setSkillScanResult] = useState<SkillScanResult>(
		() => service.getInstalledSkillsSnapshot() ?? { skills: [], errors: [] }
	)
	const [subAgentScanResult, setSubAgentScanResult] = useState<SubAgentScanResult>(
		() => service.getInstalledSubAgentsSnapshot() ?? { agents: [], errors: [] }
	)
	const [builtinServerToolsMap, setBuiltinServerToolsMap] = useState<Map<string, McpToolInfo[]>>(
		() => new Map()
	)
	const obsidianApi = service.getObsidianApiProvider()

	const providers = aiRuntimeSettings.providers ?? service.getProviders()
	const providerOptions = useMemo<ProviderOption[]>(
		() =>
			providers.map((provider) => ({
				value: provider.tag,
				label: formatProviderOptionLabel(provider, providers),
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
			service.getState().selectedModelId ||
			chatSettings.defaultModel ||
			providers[0]?.tag ||
			null,
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
			if (!cancelled) setSkillScanResult(result)
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
			if (!cancelled) setSubAgentScanResult(result)
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
					obsidianApi.notify(
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
			if (!manager) return
			try {
				if (enabled) {
					await manager.connectServer(serverId)
				} else {
					await manager.disconnectServer(serverId)
				}
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error)
				obsidianApi.notify(`${localInstance.mcp_server_toggle_failed}: ${message}`)
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

	const refreshInstalledSkills = useCallback(
		async () => setSkillScanResult(await service.refreshInstalledSkills()),
		[service]
	)

	const refreshInstalledSubAgents = useCallback(
		async () => setSubAgentScanResult(await service.refreshInstalledSubAgents()),
		[service]
	)

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
			obsidianApi.notify(localInstance.copy_success)
		} catch {
			obsidianApi.notify(localInstance.copy_failed)
		}
	}, [obsidianApi])

	const value = useMemo<ChatSettingsContextValue>(
		() => ({
			chatSettings,
			aiRuntimeSettings,
			recentTurnsDraft,
			setRecentTurnsDraft,
			skillScanResult,
			subAgentScanResult,
			providers,
			providerOptions,
			mcpSettings,
			messageManagement,
			resolvedContextBudget,
			externalMcpEntries,
			mcpStateMap,
			allBuiltinTools,
			persistChatSettings,
			persistGlobalSystemPrompts,
			openMcpServerEditor,
			openMcpJsonImportModal,
			handleToggleSingleBuiltinTool,
			handleEnableAllBuiltinTools,
			handleToggleExternalMcpServer,
			handleDeleteExternalMcpServer,
			refreshInstalledSkills,
			refreshInstalledSubAgents,
			copyToolName,
		}),
		[
			chatSettings,
			aiRuntimeSettings,
			recentTurnsDraft,
			skillScanResult,
			subAgentScanResult,
			providers,
			providerOptions,
			mcpSettings,
			messageManagement,
			resolvedContextBudget,
			externalMcpEntries,
			mcpStateMap,
			allBuiltinTools,
			persistChatSettings,
			persistGlobalSystemPrompts,
			openMcpServerEditor,
			openMcpJsonImportModal,
			handleToggleSingleBuiltinTool,
			handleEnableAllBuiltinTools,
			handleToggleExternalMcpServer,
			handleDeleteExternalMcpServer,
			refreshInstalledSkills,
			refreshInstalledSubAgents,
			copyToolName,
		]
	)

	return <ChatSettingsContext.Provider value={value}>{children}</ChatSettingsContext.Provider>
}
