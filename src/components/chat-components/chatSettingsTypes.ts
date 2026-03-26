import type { McpServerConfig } from 'src/services/mcp'

export interface ExternalMcpEntry {
	server: McpServerConfig
}

export interface ProviderOption {
	value: string
	label: string
}