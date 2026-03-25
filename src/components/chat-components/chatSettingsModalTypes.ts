import type { App } from 'obsidian'
import type { ChatService } from 'src/core/chat/services/ChatService'
import type { McpServerConfig } from 'src/services/mcp'

export type ChatSettingsTabId =
	| 'ai-chat'
	| 'system-prompts'
	| 'mcp-servers'
	| 'skills'
	| 'sub-agents'
	| 'tools'

export interface ChatSettingsModalProps {
	app: App
	service: ChatService
}

export interface ExternalMcpEntry {
	server: McpServerConfig
}

export interface ProviderOption {
	value: string
	label: string
}

export const DEFAULT_CHAT_SETTINGS_TAB_ID: ChatSettingsTabId = 'ai-chat'
