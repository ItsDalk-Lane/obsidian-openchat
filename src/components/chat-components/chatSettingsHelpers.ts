import type { Local } from 'src/i18n/local';
import type { ProviderSettings } from 'src/types/provider';
import type { McpServerStatus } from 'src/services/mcp/types';
import { getProviderModelDisplayName } from 'src/utils/aiProviderMetadata';

type McpStatusLocale = Pick<
	Local,
	| 'mcp_status_idle'
	| 'mcp_status_connecting'
	| 'mcp_status_running'
	| 'mcp_status_stopping'
	| 'mcp_status_stopped'
	| 'mcp_status_error'
>;

export const formatProviderOptionLabel = (
	provider: ProviderSettings,
	providers?: ProviderSettings[]
): string => getProviderModelDisplayName(provider, providers);

export const getMcpStatusText = (
	status: McpServerStatus,
	local: McpStatusLocale
): string => {
	switch (status) {
		case 'idle':
			return local.mcp_status_idle;
		case 'connecting':
			return local.mcp_status_connecting;
		case 'running':
			return local.mcp_status_running;
		case 'stopping':
			return local.mcp_status_stopping;
		case 'stopped':
			return local.mcp_status_stopped;
		case 'error':
			return local.mcp_status_error;
		default:
			return status;
	}
};

export const getMcpStatusColor = (status: McpServerStatus): string => {
	switch (status) {
		case 'idle':
			return 'var(--text-muted)';
		case 'connecting':
			return 'var(--interactive-accent)';
		case 'running':
			return 'var(--color-green)';
		case 'stopping':
			return 'var(--interactive-accent)';
		case 'stopped':
			return 'var(--text-muted)';
		case 'error':
			return 'var(--color-red)';
		default:
			return 'var(--text-muted)';
	}
};
