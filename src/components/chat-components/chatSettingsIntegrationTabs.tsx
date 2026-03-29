import { Pencil, Plus, Trash2 } from 'lucide-react'
import { ToggleSwitch } from 'src/components/toggle-switch/ToggleSwitch'
import { localInstance } from 'src/i18n/locals'
import type { SkillScanResult } from 'src/domains/skills/types'
import type { McpServerState } from 'src/services/mcp/types'
import type { SubAgentScanResult } from 'src/tools/sub-agents/types'
import { getMcpStatusColor, getMcpStatusText } from './chatSettingsHelpers'
import type { ExternalMcpEntry } from './chatSettingsTypes'
import { OverflowTooltip } from './OverflowTooltip'

interface McpServersSettingsTabProps {
	externalMcpEntries: ExternalMcpEntry[]
	mcpStateMap: Map<string, McpServerState>
	openMcpServerEditor: (existingServer: ExternalMcpEntry['server'] | null) => void
	openMcpJsonImportModal: (manual: boolean) => void
	handleToggleExternalMcpServer: (
		entry: ExternalMcpEntry,
		enabled: boolean
	) => Promise<void>
	handleDeleteExternalMcpServer: (serverId: string) => Promise<void>
}

interface SkillsSettingsTabProps {
	skillScanResult: SkillScanResult
	refreshInstalledSkills: () => Promise<void>
}

interface SubAgentsSettingsTabProps {
	subAgentScanResult: SubAgentScanResult
	refreshInstalledSubAgents: () => Promise<void>
}

export const McpServersSettingsTab = ({
	externalMcpEntries,
	mcpStateMap,
	openMcpServerEditor,
	openMcpJsonImportModal,
	handleToggleExternalMcpServer,
	handleDeleteExternalMcpServer,
}: McpServersSettingsTabProps) => (
	<section className="chat-settings-panel">
		<div className="chat-settings-toolbar">
			<button type="button" className="mod-cta" onClick={() => openMcpServerEditor(null)}>
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
				const serverState = mcpStateMap.get(entry.server.id)
				const status = entry.server.enabled ? (serverState?.status ?? 'idle') : 'stopped'
				const descriptionParts = [
					`${entry.server.transportType.toUpperCase()} · ${getMcpStatusText(status, localInstance)}`,
				]
				if (serverState?.lastError && status === 'error') {
					descriptionParts.push(serverState.lastError)
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
										void handleToggleExternalMcpServer(entry, checked)
									}}
									ariaLabel={entry.server.name || entry.server.id}
								/>
								<button
									type="button"
									className="chat-settings-icon-button"
									title={localInstance.mcp_edit_server}
									onClick={() => {
										openMcpServerEditor(entry.server)
									}}
								>
									<Pencil size={16} />
								</button>
								<button
									type="button"
									className="chat-settings-icon-button chat-settings-icon-button--danger"
									title={localInstance.mcp_delete_server}
									onClick={() => {
										void handleDeleteExternalMcpServer(entry.server.id)
									}}
								>
									<Trash2 size={16} />
								</button>
							</div>
						</div>
						<OverflowTooltip content={descriptionParts.join(' · ')}>
							{descriptionParts.join(' · ')}
						</OverflowTooltip>
					</div>
				)
			})}
		</div>

		{externalMcpEntries.length === 0 && (
			<div className="chat-settings-empty">
				{localInstance.mcp_settings_no_external_servers}
			</div>
		)}
	</section>
)

export const SkillsSettingsTab = ({
	skillScanResult,
	refreshInstalledSkills,
}: SkillsSettingsTabProps) => (
	<section className="chat-settings-panel">
		<div className="chat-settings-subsection">
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
						<OverflowTooltip content={skill.metadata.description}>
							{skill.metadata.description}
						</OverflowTooltip>
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
								<OverflowTooltip content={error.reason}>
									{error.reason}
								</OverflowTooltip>
							</div>
						))}
					</div>
				</div>
			)}
		</div>
	</section>
)

export const SubAgentsSettingsTab = ({
	subAgentScanResult,
	refreshInstalledSubAgents,
}: SubAgentsSettingsTabProps) => (
	<section className="chat-settings-panel">
		<div className="chat-settings-subsection">
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
						<OverflowTooltip content={agent.metadata.description}>
							{agent.metadata.description}
						</OverflowTooltip>
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
								<OverflowTooltip content={error.reason}>
									{error.reason}
								</OverflowTooltip>
							</div>
						))}
					</div>
				</div>
			)}
		</div>
	</section>
)
