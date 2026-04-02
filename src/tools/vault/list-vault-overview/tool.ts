import type { App } from 'obsidian';
import { buildBuiltinTool } from '../../runtime/build-tool';
import { readOnlyToolAnnotations, structuredOutputSchema } from '../filesystemToolSchemas';
import { LIST_VAULT_OVERVIEW_DESCRIPTION } from './description';
import { executeListVaultOverview } from './service';
import {
	listVaultOverviewSchema,
	type ListVaultOverviewArgs,
} from './schema';

export const LIST_VAULT_OVERVIEW_TOOL_NAME = 'list_vault_overview';

const summarizeOverviewTarget = (args: Partial<ListVaultOverviewArgs>): string | null => {
	const extensions = args.file_extensions?.filter(Boolean) ?? [];
	if (extensions.length === 0) {
		return 'entire vault';
	}
	return `extensions:${extensions.join(',')}`;
};

export const createListVaultOverviewTool = (
	app: App,
) => buildBuiltinTool<ListVaultOverviewArgs>({
	name: LIST_VAULT_OVERVIEW_TOOL_NAME,
	title: '获取 Vault 总览',
	description: LIST_VAULT_OVERVIEW_DESCRIPTION,
	inputSchema: listVaultOverviewSchema,
	outputSchema: structuredOutputSchema,
	annotations: readOnlyToolAnnotations,
	surface: {
		family: 'builtin.vault.discovery',
		visibility: 'default',
		argumentComplexity: 'medium',
		riskLevel: 'read-only',
		oneLinePurpose: '获取整个 Vault 的轻量文件路径总览。',
		whenNotToUse: [
			'只浏览单个目录时用 list_directory_flat',
			'需要目录树时用 list_directory_tree',
		],
		capabilityTags: ['vault overview', 'vault', 'workspace overview', '全库总览', 'Vault 总览'],
		requiredArgsSummary: ['file_extensions'],
	},
	isReadOnly: () => true,
	isConcurrencySafe: () => true,
	getToolUseSummary: summarizeOverviewTarget,
	getActivityDescription: () => '获取 Vault 总览',
	execute: async (args) => await executeListVaultOverview(app, args),
});
