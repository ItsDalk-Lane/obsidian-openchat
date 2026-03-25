import type { Dispatch, SetStateAction } from 'react'
import type { App } from 'obsidian'
import { Copy } from 'lucide-react'
import { ToggleSwitch } from 'src/components/toggle-switch/ToggleSwitch'
import { SystemPromptManagerPanel } from 'src/components/system-prompt-components/SystemPromptManagerModal'
import type { ChatService } from 'src/core/chat/services/ChatService'
import { localInstance } from 'src/i18n/locals'
import type { AiRuntimeSettings } from 'src/settings/ai-runtime'
import type { McpSettings, McpToolInfo } from 'src/services/mcp'
import { summarizeToolDescriptionForUi } from 'src/services/mcp/toolDescriptionSummary'
import {
	type ChatOpenMode,
	type ChatSettings,
	type MessageManagementSettings,
} from 'src/types/chat'
import { getOpenModeAutoOpenDescription } from './chatSettingsHelpers'
import type { ProviderOption } from './chatSettingsModalTypes'

interface AiChatSettingsTabProps {
	chatSettings: ChatSettings
	providers: AiRuntimeSettings['providers']
	providerOptions: ProviderOption[]
	resolvedContextBudget: ReturnType<ChatService['getResolvedContextBudget']>
	messageManagement: MessageManagementSettings
	recentTurnsDraft: string | null
	setRecentTurnsDraft: Dispatch<SetStateAction<string | null>>
	persistChatSettings: (partial: Partial<ChatSettings>) => Promise<boolean>
}

interface SystemPromptSettingsTabProps {
	app: App
	aiRuntimeSettings: AiRuntimeSettings
	persistGlobalSystemPrompts: (enabled: boolean) => Promise<boolean>
}

interface ToolsSettingsTabProps {
	allBuiltinTools: McpToolInfo[]
	mcpSettings: McpSettings
	handleEnableAllBuiltinTools: () => Promise<void>
	handleToggleSingleBuiltinTool: (toolName: string, enabled: boolean) => Promise<void>
	copyToolName: (toolName: string) => Promise<void>
}

const getOpenModeOptions = (): Array<{ value: ChatOpenMode; label: string }> => [
	{ value: 'sidebar', label: localInstance.chat_settings_open_mode_sidebar },
	{ value: 'left-sidebar', label: localInstance.chat_settings_open_mode_left_sidebar },
	{ value: 'tab', label: localInstance.chat_settings_open_mode_tab },
	{ value: 'window', label: localInstance.chat_settings_open_mode_window },
	{ value: 'persistent-modal', label: localInstance.chat_settings_open_mode_persistent_modal },
]

export const AiChatSettingsTab = ({
	chatSettings,
	providers,
	providerOptions,
	resolvedContextBudget,
	messageManagement,
	recentTurnsDraft,
	setRecentTurnsDraft,
	persistChatSettings,
}: AiChatSettingsTabProps) => (
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
						void persistChatSettings({ defaultModel: event.target.value })
					}}
				>
					{providers.length === 0 ? (
						<option value="">{localInstance.chat_settings_no_models}</option>
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
						void persistChatSettings({ autosaveChat: checked })
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
						})
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
						void persistChatSettings({ showSidebarByDefault: checked })
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
						void persistChatSettings({ autoAddActiveFile: checked })
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
						void persistChatSettings({ showRibbonIcon: checked })
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
							const nextValue = Number.parseInt(event.target.value, 10)
							if (Number.isFinite(nextValue) && nextValue > 0) {
								void persistChatSettings({ chatModalWidth: nextValue })
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
							const nextValue = Number.parseInt(event.target.value, 10)
							if (Number.isFinite(nextValue) && nextValue > 0) {
								void persistChatSettings({ chatModalHeight: nextValue })
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
						})
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
						<div>
							{localInstance.chat_settings_auto_context_budget_usable}:{' '}
							{resolvedContextBudget.usableInputTokens.toLocaleString()}
						</div>
						<div>
							{localInstance.chat_settings_auto_context_budget_trigger}:{' '}
							{resolvedContextBudget.triggerTokens.toLocaleString()}
						</div>
						<div>
							{localInstance.chat_settings_auto_context_budget_target}:{' '}
							{resolvedContextBudget.targetTokens.toLocaleString()}
						</div>
						<div>
							{localInstance.chat_settings_auto_context_budget_reserve}:{' '}
							{resolvedContextBudget.reserveForOutput.toLocaleString()}
						</div>
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
							})
						}}
					>
						<option value="">
							{localInstance.chat_settings_summary_model_follow_current}
						</option>
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
							setRecentTurnsDraft(event.target.value)
						}}
						onFocus={() => {
							setRecentTurnsDraft(String(messageManagement.recentTurns))
						}}
						onBlur={() => {
							if (recentTurnsDraft === null) {
								return
							}
							const draft = recentTurnsDraft.trim()
							if (draft === '') {
								setRecentTurnsDraft(null)
								return
							}
							const nextValue = Number.parseInt(draft, 10)
							if (Number.isFinite(nextValue) && nextValue > 0) {
								void persistChatSettings({
									messageManagement: {
										...messageManagement,
										recentTurns: nextValue,
									},
								})
							}
							setRecentTurnsDraft(null)
						}}
						onKeyDown={(event) => {
							if (event.key === 'Enter') {
								event.currentTarget.blur()
							}
						}}
						onWheel={(event) => {
							event.currentTarget.blur()
						}}
					/>
				</label>
			</div>
		</div>
	</section>
)

export const SystemPromptSettingsTab = ({
	app,
	aiRuntimeSettings,
	persistGlobalSystemPrompts,
}: SystemPromptSettingsTabProps) => (
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
				checked={aiRuntimeSettings.enableGlobalSystemPrompts ?? false}
				onChange={(checked) => {
					void persistGlobalSystemPrompts(checked)
				}}
				ariaLabel={localInstance.enable_global_system_prompts}
			/>
		</div>
		<div className="chat-settings-panel__fill">
			<SystemPromptManagerPanel app={app} embedded />
		</div>
	</section>
)

export const ToolsSettingsTab = ({
	allBuiltinTools,
	mcpSettings,
	handleEnableAllBuiltinTools,
	handleToggleSingleBuiltinTool,
	copyToolName,
}: ToolsSettingsTabProps) => (
	<section className="chat-settings-panel">
		{(mcpSettings.disabledBuiltinToolNames?.length ?? 0) > 0 && (
			<div className="chat-settings-enable-all-row">
				<div className="chat-settings-enable-all-row__info">
					<span className="chat-settings-enable-all-row__title">
						{localInstance.mcp_enable_all_tools}
					</span>
					<span className="chat-settings-enable-all-row__desc">
						{localInstance.mcp_enable_all_tools_desc}
					</span>
				</div>
				<button
					type="button"
					className="chat-settings-toolbar__button"
					onClick={() => {
						void handleEnableAllBuiltinTools()
					}}
				>
					{localInstance.mcp_enable_all_tools}
				</button>
			</div>
		)}
		<div className="chat-settings-list">
			{allBuiltinTools.map((tool) => {
				const disabledNames = mcpSettings.disabledBuiltinToolNames ?? []
				const isEnabled = !disabledNames.includes(tool.name)
				const uiDescription = summarizeToolDescriptionForUi(tool)
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
									onClick={() => {
										void copyToolName(tool.name)
									}}
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
								void handleToggleSingleBuiltinTool(tool.name, checked)
							}}
							ariaLabel={tool.title ?? tool.name}
						/>
					</div>
				)
			})}
		</div>
	</section>
)
