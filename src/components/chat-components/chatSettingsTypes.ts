import type { McpServerConfig } from 'src/types/mcp'

export interface ExternalMcpEntry {
	server: McpServerConfig
}

export interface ProviderOption {
	value: string
	label: string
}