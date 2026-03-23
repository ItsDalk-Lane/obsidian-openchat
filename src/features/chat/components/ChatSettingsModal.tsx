import { App, Modal, Notice } from 'obsidian';
import { StrictMode, useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Copy, Pencil, Plus, RotateCw, Trash2 } from 'lucide-react';
import { ObsidianAppContext } from 'src/contexts/obsidianAppContext';
import { Tab, type TabItem } from 'src/components/tab/Tab';
import { ToggleSwitch } from 'src/components/toggle-switch/ToggleSwitch';
import { localInstance } from 'src/i18n/locals';
import type { SkillScanResult } from 'src/skills';
import type { SubAgentScanResult } from 'src/subAgents';
import { BUILTIN_SERVER_ID } from 'src/mcp/builtin/constants';
import {
	DEFAULT_MCP_SETTINGS,
	McpConfigImporter,
	type McpServerConfig,
	type McpServerState,
	type McpSettings,
	type McpToolInfo,
} from 'src/mcp/client';
import {
	McpImportModal,
	McpServerEditModal,
} from 'src/mcp/client/McpConfigModals';
import { summarizeToolDescriptionForUi } from 'src/mcp/client/toolDescriptionSummary';
import { SystemPromptManagerPanel } from 'src/systemPrompts/SystemPromptManagerModal';
import type { TarsSettings } from 'src/features/tars/settings';
import {
	DEFAULT_MESSAGE_MANAGEMENT_SETTINGS,
	normalizeMessageManagementSettings,
	type ChatOpenMode,
	type ChatSettings,
} from '../types/chat';
import type { ChatService } from '../services/ChatService';
import {
	formatProviderOptionLabel,
	getMcpStatusColor,
	getMcpStatusText,
	getOpenModeAutoOpenDescription,
} from './chatSettingsHelpers';
import './ChatSettingsModal.css';

type ChatSettingsTabId =
	| 'ai-chat'
	| 'system-prompts'
	| 'mcp-servers'
	| 'skills'
	| 'sub-agents'
	| 'tools';

interface ChatSettingsModalProps {
	app: App;
	service: ChatService;
}

interface ExternalMcpEntry {
	server: McpServerConfig;
}

const DEFAULT_CHAT_SETTINGS_TAB_ID: ChatSettingsTabId = 'ai-chat';

const cloneValue = <T,>(value: T): T =>
	JSON.parse(JSON.stringify(value)) as T;

const getOpenModeOptions = (): Array<{ value: ChatOpenMode; label: string }> => [
	{ value: 'sidebar', label: localInstance.chat_settings_open_mode_sidebar },
	{ value: 'left-sidebar', label: localInstance.chat_settings_open_mode_left_sidebar },
	{ value: 'tab', label: localInstance.chat_settings_open_mode_tab },
	{ value: 'window', label: localInstance.chat_settings_open_mode_window },
	{ value: 'persistent-modal', label: localInstance.chat_settings_open_mode_persistent_modal },
];



export class ChatSettingsModal extends Modal {
	private root: Root | null = null;

	constructor(
		app: App,
		private readonly service: ChatService,
		private readonly onRequestClose?: () => void,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl, titleEl, modalEl } = this;
		contentEl.empty();
		contentEl.addClass('chat-settings-modal-content');
		modalEl.addClass('chat-settings-modal');
		titleEl.textContent = localInstance.chat_settings_modal_title;

		this.root = createRoot(contentEl);
		this.root.render(
			<StrictMode>
				<ObsidianAppContext.Provider value={this.app}>
					<ChatSettingsModalApp app={this.app} service={this.service} />
				</ObsidianAppContext.Provider>
			</StrictMode>
		);
	}

	onClose(): void {
		this.root?.unmount();
		this.root = null;
		this.contentEl.empty();
		this.onRequestClose?.();
	}
}

const ChatSettingsModalApp = ({ app, service }: ChatSettingsModalProps) => {
	const [chatSettings, setChatSettings] = useState<ChatSettings>(() =>
		service.getChatSettingsSnapshot()
	);
	const [tarsSettings, setTarsSettings] = useState<TarsSettings>(() =>
		service.getTarsSettingsSnapshot()
	);
	const [mcpStates, setMcpStates] = useState<McpServerState[]>(() =>
		service.getMcpClientManager()?.getAllStates() ?? []
	);

	const [recentTurnsDraft, setRecentTurnsDraft] = useState<string | null>(null);
	const [skillScanResult, setSkillScanResult] = useState<SkillScanResult>(() =>
		service.getInstalledSkillsSnapshot() ?? { skills: [], errors: [] }
	);
	const [subAgentScanResult, setSubAgentScanResult] = useState<SubAgentScanResult>(() =>
		service.getInstalledSubAgentsSnapshot() ?? { agents: [], errors: [] }
	);
	const [builtinServerToolsMap, setBuiltinServerToolsMap] = useState<Map<string, McpToolInfo[]>>(
		() => new Map()
	);

	const providers = tarsSettings.providers ?? service.getProviders();
	const providerOptions = useMemo(
		() =>
			providers.map((provider) => ({
				value: provider.tag,
				label: formatProviderOptionLabel(provider),
			})),
		[providers]
	);
	const mcpSettings = useMemo<McpSettings>(
		() => ({
			...DEFAULT_MCP_SETTINGS,
			...(tarsSettings.mcp ?? {}),
			servers: cloneValue(tarsSettings.mcp?.servers ?? []),
		}),
		[tarsSettings.mcp]
	);
	const messageManagement = useMemo(
		() => normalizeMessageManagementSettings({
			...DEFAULT_MESSAGE_MANAGEMENT_SETTINGS,
			...(chatSettings.messageManagement ?? {}),
		}),
		[chatSettings.messageManagement]
	);
	const activeModelTag = useMemo(
		() =>
			service.getState().selectedModelId
			|| chatSettings.defaultModel
			|| providers[0]?.tag
			|| null,
		[chatSettings.defaultModel, providers, service]
	);
	const resolvedContextBudget = useMemo(
		() => service.getResolvedContextBudget(activeModelTag),
		[activeModelTag, service]
	);

	const reloadSnapshots = useCallback(() => {
		setChatSettings(service.getChatSettingsSnapshot());
		setTarsSettings(service.getTarsSettingsSnapshot());
		setMcpStates(service.getMcpClientManager()?.getAllStates() ?? []);
	}, [service]);

	useEffect(() => {
		reloadSnapshots();
	}, [reloadSnapshots]);



	useEffect(() => {
		const manager = service.getMcpClientManager();
		if (!manager) {
			setMcpStates([]);
			return undefined;
		}

		setMcpStates(manager.getAllStates());
		return manager.onStateChange((states) => {
			setMcpStates(states);
		});
	}, [service]);

	useEffect(() => {
		let cancelled = false;
		void service.loadInstalledSkills().then((result) => {
			if (!cancelled) {
				setSkillScanResult(result);
			}
		});
		const unsubscribe = service.onInstalledSkillsChange((result) => {
			setSkillScanResult(result);
		});
		return () => {
			cancelled = true;
			unsubscribe();
		};
	}, [service]);

	useEffect(() => {
		let cancelled = false;
		void service.loadInstalledSubAgents().then((result) => {
			if (!cancelled) {
				setSubAgentScanResult(result);
			}
		});
		const unsubscribe = service.onInstalledSubAgentsChange((result) => {
			setSubAgentScanResult(result);
		});
		return () => {
			cancelled = true;
			unsubscribe();
		};
	}, [service]);

	// 加载内置服务器工具列表（用于工具选项卡中的单独工具启用/禁用配置）
	useEffect(() => {
		let cancelled = false;
		service.getBuiltinToolsForSettings().then((tools) => {
			if (cancelled) return;
			setBuiltinServerToolsMap(new Map([[BUILTIN_SERVER_ID, tools as McpToolInfo[]]]));
		}).catch(() => { /* 忽略 */ });

		return () => {
			cancelled = true;
		};
	}, [service, mcpSettings.builtinCoreToolsEnabled, mcpSettings.builtinFilesystemEnabled, mcpSettings.builtinFetchEnabled, mcpSettings.builtinBingSearchEnabled, skillScanResult.skills.length]);

	const persistChatSettings = useCallback(async (partial: Partial<ChatSettings>): Promise<boolean> => {
		const previousChatSettings = chatSettings;
		setChatSettings((current) => ({ ...current, ...partial }));

		try {
			await service.persistChatSettings(partial);
			reloadSnapshots();
			return true;
		} catch {
			setChatSettings(previousChatSettings);
			reloadSnapshots();
			return false;
		}
	}, [chatSettings, reloadSnapshots, service]);

	const persistGlobalSystemPrompts = useCallback(async (enabled: boolean): Promise<boolean> => {
		const previousTarsSettings = tarsSettings;
		setTarsSettings((current) => ({
			...current,
			enableGlobalSystemPrompts: enabled,
		}));

		try {
			await service.persistGlobalSystemPromptsEnabled(enabled);
			reloadSnapshots();
			return true;
		} catch {
			setTarsSettings(previousTarsSettings);
			reloadSnapshots();
			return false;
		}
	}, [reloadSnapshots, service, tarsSettings]);

	const persistMcpSettings = useCallback(async (nextMcpSettings: McpSettings): Promise<boolean> => {
		const previousTarsSettings = tarsSettings;
		setTarsSettings((current) => ({
			...current,
			mcp: cloneValue(nextMcpSettings),
		}));

		try {
			await service.persistMcpSettings(nextMcpSettings);
			reloadSnapshots();
			return true;
		} catch {
			setTarsSettings(previousTarsSettings);
			reloadSnapshots();
			return false;
		}
	}, [reloadSnapshots, service, tarsSettings]);

	const openMcpServerEditor = useCallback((existingServer: McpServerConfig | null) => {
		new McpServerEditModal(app, existingServer, async (serverConfig) => {
			const nextServers = existingServer
				? mcpSettings.servers.map((server) =>
					server.id === existingServer.id ? serverConfig : server
				)
				: [...mcpSettings.servers, serverConfig];

			const success = await persistMcpSettings({
				...mcpSettings,
				servers: nextServers,
			});
			if (!success) {
				throw new Error(localInstance.chat_settings_save_failed);
			}
		}).open();
	}, [app, mcpSettings, persistMcpSettings]);

	const openMcpJsonImportModal = useCallback((manual: boolean) => {
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
				const result = McpConfigImporter.importFromJson(jsonContent, mcpSettings.servers);
				const success = await persistMcpSettings({
					...mcpSettings,
					servers: result.merged,
				});
				if (!success) {
					throw new Error(localInstance.chat_settings_save_failed);
				}
				new Notice(
					`${manual ? localInstance.mcp_manual_config_confirm : localInstance.mcp_import_confirm}: +${result.added.length} / ${result.skipped.length}`
				);
			}
		).open();
	}, [app, mcpSettings, persistMcpSettings]);

	const updateMcpConnectionState = useCallback(async (serverId: string, enabled: boolean) => {
		const manager = service.getMcpClientManager();
		if (!manager) {
			return;
		}

		try {
			if (enabled) {
				await manager.connectServer(serverId);
			} else {
				await manager.disconnectServer(serverId);
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			new Notice(`${localInstance.mcp_server_toggle_failed}: ${message}`);
		}
	}, [service]);



	/** 切换单个内置工具的启用/禁用状态 */
	const handleToggleSingleBuiltinTool = useCallback(async (toolName: string, enabled: boolean) => {
		const current = mcpSettings.disabledBuiltinToolNames ?? [];
		const next = enabled
			? current.filter((n) => n !== toolName)
			: current.includes(toolName) ? current : [...current, toolName];
		await persistMcpSettings({ ...mcpSettings, disabledBuiltinToolNames: next });
	}, [mcpSettings, persistMcpSettings]);

	/** 一键启用所有内置工具（清空禁用列表） */
	const handleEnableAllBuiltinTools = useCallback(async () => {
		await persistMcpSettings({ ...mcpSettings, disabledBuiltinToolNames: [] });
	}, [mcpSettings, persistMcpSettings]);

	const handleToggleExternalMcpServer = useCallback(async (entry: ExternalMcpEntry, enabled: boolean) => {
		const success = await persistMcpSettings({
			...mcpSettings,
			servers: mcpSettings.servers.map((server) =>
				server.id === entry.server.id
					? { ...server, enabled }
					: server
			),
		});
		if (!success) {
			return;
		}
		await updateMcpConnectionState(entry.server.id, enabled);
	}, [mcpSettings, persistMcpSettings, updateMcpConnectionState]);

	const handleDeleteExternalMcpServer = useCallback(async (serverId: string) => {
		void persistMcpSettings({
			...mcpSettings,
			servers: mcpSettings.servers.filter((server) => server.id !== serverId),
		});
	}, [mcpSettings, persistMcpSettings]);

	const refreshInstalledSkills = useCallback(async () => {
		const result = await service.refreshInstalledSkills();
		setSkillScanResult(result);
	}, [service]);

	const refreshInstalledSubAgents = useCallback(async () => {
		const result = await service.refreshInstalledSubAgents();
		setSubAgentScanResult(result);
	}, [service]);



	const externalMcpEntries = useMemo<ExternalMcpEntry[]>(
		() => mcpSettings.servers.map((server) => ({ server })),
		[mcpSettings.servers]
	);
	const mcpStateMap = useMemo(
		() => new Map(mcpStates.map((state) => [state.serverId, state])),
		[mcpStates]
	);

	/** 所有内置工具的合并列表（不分组） */
	const allBuiltinTools = useMemo(
		() => builtinServerToolsMap.get(BUILTIN_SERVER_ID) ?? [],
		[builtinServerToolsMap]
	);

	/** 复制工具名称到剪贴板 */
	const copyToolName = useCallback(async (toolName: string): Promise<void> => {
		try {
			await navigator.clipboard.writeText(toolName);
			new Notice(localInstance.copy_success);
		} catch {
			new Notice(localInstance.copy_failed);
		}
	}, []);

	const aiChatTab = (
		<section className="chat-settings-panel">
			<div className="chat-settings-fields">
				<label className="chat-settings-field">
					<span className="chat-settings-field__title">
						{localInstance.chat_settings_default_model}
					</span>
					<span className="chat-settings-field__desc">
						{localInstance.chat_settings_default_model_desc}
					</span>
					<select
						className="chat-settings-input"
						value={chatSettings.defaultModel || providers[0]?.tag || ''}
						disabled={providers.length === 0}
						onChange={(event) => {
							void persistChatSettings({ defaultModel: event.target.value });
						}}
					>
						{providers.length === 0 ? (
							<option value="">
								{localInstance.chat_settings_no_models}
							</option>
						) : (
							providerOptions.map((option) => (
								<option key={option.value} value={option.value}>
									{option.label}
								</option>
							))
						)}
					</select>
				</label>

				<div className="chat-settings-switch">
					<div>
						<div className="chat-settings-field__title">
							{localInstance.chat_settings_autosave}
						</div>
						<div className="chat-settings-field__desc">
							{localInstance.chat_settings_autosave_desc}
						</div>
					</div>
					<ToggleSwitch
						checked={chatSettings.autosaveChat}
						onChange={(checked) => {
							void persistChatSettings({ autosaveChat: checked });
						}}
						ariaLabel={localInstance.chat_settings_autosave}
					/>
				</div>

				<label className="chat-settings-field">
					<span className="chat-settings-field__title">
						{localInstance.chat_settings_open_mode}
					</span>
					<span className="chat-settings-field__desc">
						{localInstance.chat_settings_open_mode_desc}
					</span>
					<select
						className="chat-settings-input"
						value={chatSettings.openMode}
						onChange={(event) => {
							void persistChatSettings({
								openMode: event.target.value as ChatOpenMode,
							});
						}}
					>
						{getOpenModeOptions().map((option) => (
							<option key={option.value} value={option.value}>
								{option.label}
							</option>
						))}
					</select>
				</label>

				<div className="chat-settings-switch">
					<div>
						<div className="chat-settings-field__title">
							{localInstance.chat_settings_auto_open}
						</div>
						<div className="chat-settings-field__desc">
							{getOpenModeAutoOpenDescription(chatSettings.openMode, localInstance)}
						</div>
					</div>
					<ToggleSwitch
						checked={chatSettings.showSidebarByDefault}
						onChange={(checked) => {
							void persistChatSettings({ showSidebarByDefault: checked });
						}}
						ariaLabel={localInstance.chat_settings_auto_open}
					/>
				</div>

				<div className="chat-settings-switch">
					<div>
						<div className="chat-settings-field__title">
							{localInstance.chat_settings_auto_add_active_file}
						</div>
						<div className="chat-settings-field__desc">
							{localInstance.chat_settings_auto_add_active_file_desc}
						</div>
					</div>
					<ToggleSwitch
						checked={chatSettings.autoAddActiveFile ?? true}
						onChange={(checked) => {
							void persistChatSettings({ autoAddActiveFile: checked });
						}}
						ariaLabel={localInstance.chat_settings_auto_add_active_file}
					/>
				</div>

				<div className="chat-settings-switch">
					<div>
						<div className="chat-settings-field__title">
							{localInstance.chat_settings_show_ribbon_icon}
						</div>
						<div className="chat-settings-field__desc">
							{localInstance.chat_settings_show_ribbon_icon_desc}
						</div>
					</div>
					<ToggleSwitch
						checked={chatSettings.showRibbonIcon ?? true}
						onChange={(checked) => {
							void persistChatSettings({ showRibbonIcon: checked });
						}}
						ariaLabel={localInstance.chat_settings_show_ribbon_icon}
					/>
				</div>

				<div className="chat-settings-grid">
					<label className="chat-settings-field">
						<span className="chat-settings-field__title">
							{localInstance.chat_modal_width}
						</span>
						<span className="chat-settings-field__desc">
							{localInstance.chat_modal_width_desc}
						</span>
						<input
							className="chat-settings-input"
							type="number"
							min={1}
							value={chatSettings.chatModalWidth ?? 700}
							onChange={(event) => {
								const nextValue = Number.parseInt(event.target.value, 10);
								if (Number.isFinite(nextValue) && nextValue > 0) {
									void persistChatSettings({ chatModalWidth: nextValue });
								}
							}}
						/>
					</label>

					<label className="chat-settings-field">
						<span className="chat-settings-field__title">
							{localInstance.chat_modal_height}
						</span>
						<span className="chat-settings-field__desc">
							{localInstance.chat_modal_height_desc}
						</span>
						<input
							className="chat-settings-input"
							type="number"
							min={1}
							value={chatSettings.chatModalHeight ?? 500}
							onChange={(event) => {
								const nextValue = Number.parseInt(event.target.value, 10);
								if (Number.isFinite(nextValue) && nextValue > 0) {
									void persistChatSettings({ chatModalHeight: nextValue });
								}
							}}
						/>
					</label>
				</div>

				<div className="chat-settings-switch">
					<div>
						<div className="chat-settings-field__title">
							{localInstance.chat_settings_message_management}
						</div>
						<div className="chat-settings-field__desc">
							{localInstance.chat_settings_message_management_desc}
						</div>
					</div>
					<ToggleSwitch
						checked={messageManagement.enabled}
						onChange={(checked) => {
							void persistChatSettings({
								messageManagement: {
									...messageManagement,
									enabled: checked,
								},
							});
						}}
						ariaLabel={localInstance.chat_settings_message_management}
					/>
				</div>

				<div className="chat-settings-grid">
					<label className="chat-settings-field chat-settings-field--section">
						<span className="chat-settings-field__title">
							{localInstance.chat_settings_auto_context_budget}
						</span>
						<span className="chat-settings-field__desc">
							{localInstance.chat_settings_auto_context_budget_desc}
						</span>
						<div className="chat-settings-input">
							<div>{localInstance.chat_settings_auto_context_budget_usable}: {resolvedContextBudget.usableInputTokens.toLocaleString()}</div>
							<div>{localInstance.chat_settings_auto_context_budget_trigger}: {resolvedContextBudget.triggerTokens.toLocaleString()}</div>
							<div>{localInstance.chat_settings_auto_context_budget_target}: {resolvedContextBudget.targetTokens.toLocaleString()}</div>
							<div>{localInstance.chat_settings_auto_context_budget_reserve}: {resolvedContextBudget.reserveForOutput.toLocaleString()}</div>
						</div>
					</label>

					<label className="chat-settings-field chat-settings-field--section">
						<span className="chat-settings-field__title">
							{localInstance.chat_settings_summary_model}
						</span>
						<span className="chat-settings-field__desc">
							{localInstance.chat_settings_summary_model_desc}
						</span>
						<select
							className="chat-settings-input"
							value={messageManagement.summaryModelTag ?? ''}
							onChange={(event) => {
								void persistChatSettings({
									messageManagement: {
										...messageManagement,
										summaryModelTag: event.target.value || undefined,
									},
								});
							}}
						>
							<option value="">{localInstance.chat_settings_summary_model_follow_current}</option>
							{providerOptions.map((option) => (
								<option key={option.value} value={option.value}>
									{option.label}
								</option>
							))}
						</select>
					</label>

					<label className="chat-settings-field chat-settings-field--section">
						<span className="chat-settings-field__title">
							{localInstance.chat_settings_recent_turns}
						</span>
						<span className="chat-settings-field__desc">
							{localInstance.chat_settings_recent_turns_desc}
						</span>
						<input
							className="chat-settings-input"
							type="number"
							min={1}
							step={1}
							value={recentTurnsDraft ?? messageManagement.recentTurns}
							onChange={(event) => {
								setRecentTurnsDraft(event.target.value);
							}}
							onFocus={() => {
								setRecentTurnsDraft(String(messageManagement.recentTurns));
							}}
							onBlur={() => {
								if (recentTurnsDraft === null) {
									return;
								}
								const draft = recentTurnsDraft.trim();
								if (draft === '') {
									// 空值时恢复原值
									setRecentTurnsDraft(null);
									return;
								}
								const nextValue = Number.parseInt(draft, 10);
								if (Number.isFinite(nextValue) && nextValue > 0) {
									void persistChatSettings({
										messageManagement: {
											...messageManagement,
											recentTurns: nextValue,
										},
									});
								}
								setRecentTurnsDraft(null);
							}}
							onKeyDown={(event) => {
								if (event.key === 'Enter') {
									event.currentTarget.blur();
								}
							}}
							onWheel={(event) => {
								// 禁用鼠标滚轮改变数值
								event.currentTarget.blur();
							}}
						/>
					</label>
				</div>
			</div>
		</section>
	);

	const systemPromptTab = (
		<section className="chat-settings-panel chat-settings-panel--system-prompts">
			<div className="chat-settings-switch chat-settings-switch--stacked">
				<div>
					<div className="chat-settings-field__title">
						{localInstance.enable_global_system_prompts}
					</div>
					<div className="chat-settings-field__desc">
						{localInstance.enable_global_system_prompts_desc}
					</div>
				</div>
				<ToggleSwitch
					checked={tarsSettings.enableGlobalSystemPrompts ?? false}
					onChange={(checked) => {
						void persistGlobalSystemPrompts(checked);
					}}
					ariaLabel={localInstance.enable_global_system_prompts}
				/>
			</div>
			<div className="chat-settings-panel__fill">
				<SystemPromptManagerPanel app={app} embedded />
			</div>
		</section>
	);

	const toolsTab = (
		<section className="chat-settings-panel">
			{/* 一键启用所有工具 */}
			{(mcpSettings.disabledBuiltinToolNames?.length ?? 0) > 0 && (
				<div className="chat-settings-enable-all-row">
					<div className="chat-settings-enable-all-row__info">
						<span className="chat-settings-enable-all-row__title">{localInstance.mcp_enable_all_tools}</span>
						<span className="chat-settings-enable-all-row__desc">{localInstance.mcp_enable_all_tools_desc}</span>
					</div>
					<button
						type="button"
						className="chat-settings-toolbar__button"
						onClick={() => { void handleEnableAllBuiltinTools(); }}
					>
						{localInstance.mcp_enable_all_tools}
					</button>
				</div>
			)}
			<div className="chat-settings-list">
					{allBuiltinTools.map((tool) => {
						const disabledNames = mcpSettings.disabledBuiltinToolNames ?? [];
						const isEnabled = !disabledNames.includes(tool.name);
						const uiDescription = summarizeToolDescriptionForUi(tool);
						return (
							<div key={tool.name} className="chat-settings-tool-item">
							<div className="chat-settings-tool-item__info">
								<div className="chat-settings-tool-item__title-row">
									<span className="chat-settings-tool-item__name">
										{tool.title ?? tool.name}
									</span>
									<button
										type="button"
										className="chat-settings-tool-item__copy clickable-icon"
										aria-label={localInstance.copy}
										title={localInstance.copy}
										onClick={() => { void copyToolName(tool.name); }}
									>
										<Copy size={12} />
									</button>
								</div>
								<code className="chat-settings-tool-item__key">{tool.name}</code>
									{uiDescription && (
										<span className="chat-settings-tool-item__desc">{uiDescription}</span>
									)}
								</div>
							<ToggleSwitch
								checked={isEnabled}
								onChange={(checked) => {
									void handleToggleSingleBuiltinTool(tool.name, checked);
								}}
								ariaLabel={tool.title ?? tool.name}
							/>
						</div>
					);
				})}
			</div>
		</section>
	);

	const mcpTab = (
		<section className="chat-settings-panel">
			<div className="chat-settings-toolbar">
				<button
					type="button"
					className="mod-cta"
					onClick={() => openMcpServerEditor(null)}
				>
					<Plus size={16} />
					<span>{localInstance.mcp_settings_add_server}</span>
				</button>
				<button
					type="button"
					className="chat-settings-toolbar__button"
					onClick={() => openMcpJsonImportModal(true)}
				>
					{localInstance.mcp_settings_manual_config}
				</button>
				<button
					type="button"
					className="chat-settings-toolbar__button"
					onClick={() => openMcpJsonImportModal(false)}
				>
					{localInstance.mcp_settings_import}
				</button>
			</div>

			<div className="chat-settings-list">
				{externalMcpEntries.map((entry) => {
					const serverState = mcpStateMap.get(entry.server.id);
					const status = entry.server.enabled
						? (serverState?.status ?? 'idle')
						: 'stopped';
					const descriptionParts = [
						`${entry.server.transportType.toUpperCase()} · ${getMcpStatusText(status, localInstance)}`,
					];
					if (serverState?.lastError && status === 'error') {
						descriptionParts.push(serverState.lastError);
					}

					return (
						<div key={entry.server.id} className="chat-settings-server-card">
							<div className="chat-settings-server-card__header">
								<div className="chat-settings-server-card__title-row">
									<span className="chat-settings-server-card__title">
										{entry.server.name || entry.server.id}
									</span>
									<span
										className="chat-settings-server-card__status-dot"
										style={{ backgroundColor: getMcpStatusColor(status) }}
									/>
								</div>
								<div className="chat-settings-server-card__actions">
									<ToggleSwitch
										checked={entry.server.enabled}
										onChange={(checked) => {
											void handleToggleExternalMcpServer(entry, checked);
										}}
										ariaLabel={entry.server.name || entry.server.id}
									/>
									<button
										type="button"
										className="chat-settings-icon-button"
										title={localInstance.mcp_edit_server}
										onClick={() => {
											openMcpServerEditor(entry.server);
										}}
									>
										<Pencil size={16} />
									</button>
									<button
										type="button"
										className="chat-settings-icon-button chat-settings-icon-button--danger"
										title={localInstance.mcp_delete_server}
										onClick={() => {
											void handleDeleteExternalMcpServer(entry.server.id);
										}}
									>
										<Trash2 size={16} />
									</button>
								</div>
							</div>
							<div className="chat-settings-server-card__desc">
								{descriptionParts.join(' · ')}
							</div>
						</div>
					);
				})}
			</div>

			{externalMcpEntries.length === 0 && (
				<div className="chat-settings-empty">
					{localInstance.mcp_settings_no_external_servers}
				</div>
			)}
		</section>
	);

	const skillsTab = (
		<section className="chat-settings-panel">
			<div className="chat-settings-subsection">
				<div className="chat-settings-subsection__header">
					<div>
						<div className="chat-settings-subsection__title">
							{localInstance.tab_skills}
						</div>
						<div className="chat-settings-field__desc">
							{localInstance.chat_settings_skills_desc}
						</div>
					</div>
					<button
						type="button"
						className="chat-settings-toolbar__button"
						onClick={() => {
							void refreshInstalledSkills();
						}}
					>
						<RotateCw size={16} />
						<span>{localInstance.chat_settings_skills_refresh}</span>
					</button>
				</div>
				<div className="chat-settings-list">
					{skillScanResult.skills.map((skill) => (
						<div key={skill.skillFilePath} className="chat-settings-server-card">
							<div className="chat-settings-server-card__header">
								<div className="chat-settings-server-card__title-row">
									<span className="chat-settings-server-card__title">
										{skill.metadata.name}
									</span>
								</div>
							</div>
							<div className="chat-settings-server-card__desc">
								{skill.metadata.description}
							</div>
							<div className="chat-settings-skill-card__path">
								{skill.skillFilePath}
							</div>
						</div>
					))}
				</div>

				{skillScanResult.skills.length === 0 && (
					<div className="chat-settings-empty">
						{localInstance.chat_settings_skills_empty}
					</div>
				)}

				{skillScanResult.errors.length > 0 && (
					<div className="chat-settings-subsection">
						<div className="chat-settings-subsection__title">
							{localInstance.chat_settings_skills_errors}
						</div>
						<div className="chat-settings-list">
							{skillScanResult.errors.map((error) => (
								<div
									key={`${error.path}:${error.reason}`}
									className="chat-settings-server-card"
								>
									<div className="chat-settings-server-card__desc">
										{error.reason}
									</div>
									<div className="chat-settings-skill-card__path">
										{error.path}
									</div>
								</div>
							))}
						</div>
					</div>
				)}
			</div>
		</section>
	);

	const subAgentsTab = (
		<section className="chat-settings-panel">
			<div className="chat-settings-subsection">
				<div className="chat-settings-subsection__header">
					<div>
						<div className="chat-settings-subsection__title">
							{localInstance.tab_sub_agents}
						</div>
						<div className="chat-settings-field__desc">
							{localInstance.chat_settings_sub_agents_desc}
						</div>
					</div>
					<button
						type="button"
						className="chat-settings-toolbar__button"
						onClick={() => {
							void refreshInstalledSubAgents();
						}}
					>
						<RotateCw size={16} />
						<span>{localInstance.chat_settings_sub_agents_refresh}</span>
					</button>
				</div>
				<div className="chat-settings-list">
					{subAgentScanResult.agents.map((agent) => (
						<div key={agent.agentFilePath} className="chat-settings-server-card">
							<div className="chat-settings-server-card__header">
								<div className="chat-settings-server-card__title-row">
									<span className="chat-settings-server-card__title">
										{agent.metadata.name}
									</span>
								</div>
							</div>
							<div className="chat-settings-server-card__desc">
								{agent.metadata.description}
							</div>
							<div className="chat-settings-metadata-list">
								{agent.metadata.tools && agent.metadata.tools.length > 0 && (
									<div className="chat-settings-metadata-row">
										<span className="chat-settings-metadata-row__label">
											{localInstance.chat_settings_sub_agents_tools}
										</span>
										<span className="chat-settings-metadata-row__value">
											{agent.metadata.tools.join(', ')}
										</span>
									</div>
								)}
								{agent.metadata.mcps && agent.metadata.mcps.length > 0 && (
									<div className="chat-settings-metadata-row">
										<span className="chat-settings-metadata-row__label">
											{localInstance.chat_settings_sub_agents_mcps}
										</span>
										<span className="chat-settings-metadata-row__value">
											{agent.metadata.mcps.join(', ')}
										</span>
									</div>
								)}
								{agent.metadata.models && (
									<div className="chat-settings-metadata-row">
										<span className="chat-settings-metadata-row__label">
											{localInstance.chat_settings_sub_agents_model}
										</span>
										<span className="chat-settings-metadata-row__value">
											{agent.metadata.models}
										</span>
									</div>
								)}
								{agent.metadata.maxTokens && (
									<div className="chat-settings-metadata-row">
										<span className="chat-settings-metadata-row__label">
											{localInstance.chat_settings_sub_agents_max_tokens}
										</span>
										<span className="chat-settings-metadata-row__value">
											{agent.metadata.maxTokens}
										</span>
									</div>
								)}
							</div>
						</div>
					))}
				</div>

				{subAgentScanResult.agents.length === 0 && (
					<div className="chat-settings-empty">
						{localInstance.chat_settings_sub_agents_empty}
					</div>
				)}

				{subAgentScanResult.errors.length > 0 && (
					<div className="chat-settings-subsection">
						<div className="chat-settings-subsection__title">
							{localInstance.chat_settings_sub_agents_errors}
						</div>
						<div className="chat-settings-list">
							{subAgentScanResult.errors.map((error) => (
								<div
									key={`${error.path}:${error.reason}`}
									className="chat-settings-server-card"
								>
									<div className="chat-settings-server-card__desc">
										{error.reason}
									</div>
									<div className="chat-settings-skill-card__path">
										{error.path}
									</div>
								</div>
							))}
						</div>
					</div>
				)}
			</div>
		</section>
	);

	const tabItems = useMemo<TabItem[]>(
		() => [
			{ id: 'ai-chat', title: localInstance.tab_ai_chat, content: aiChatTab },
			{ id: 'system-prompts', title: localInstance.tab_system_prompts, content: systemPromptTab },
			{ id: 'mcp-servers', title: localInstance.tab_mcp_servers, content: mcpTab },
			{ id: 'skills', title: localInstance.tab_skills, content: skillsTab },
			{ id: 'sub-agents', title: localInstance.tab_sub_agents, content: subAgentsTab },
			{ id: 'tools', title: localInstance.tab_tools, content: toolsTab },
		],
		[aiChatTab, mcpTab, skillsTab, subAgentsTab, systemPromptTab, toolsTab]
	);

	return (
		<div className="chat-settings-modal-shell">
			<Tab
				items={tabItems}
				defaultValue={DEFAULT_CHAT_SETTINGS_TAB_ID}
				className="chat-settings-modal-tabs"
			/>
		</div>
	);
};
