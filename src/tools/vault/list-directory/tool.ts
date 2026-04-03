import type { App } from 'obsidian';
import { buildBuiltinTool } from '../../runtime/build-tool';
import { LIST_DIRECTORY_DESCRIPTION } from './description';
import {
	describeListDirectoryActivity,
	executeLegacyListDirectory,
	summarizeListDirectoryTarget,
} from './service';
import {
	listDirectoryAnnotations,
	listDirectoryOutputSchema,
	listDirectorySchema,
	type ListDirectoryArgs,
} from './schema';

export const LIST_DIRECTORY_TOOL_NAME = 'list_directory';

export const createListDirectoryTool = (app: App) => buildBuiltinTool<ListDirectoryArgs>({
	name: LIST_DIRECTORY_TOOL_NAME,
	title: '兼容目录浏览',
	description: LIST_DIRECTORY_DESCRIPTION,
	inputSchema: listDirectorySchema,
	outputSchema: listDirectoryOutputSchema,
	annotations: listDirectoryAnnotations,
	surface: {
		family: 'builtin.vault.discovery',
		visibility: 'default',
		argumentComplexity: 'high',
		riskLevel: 'read-only',
		oneLinePurpose:
			'兼容型目录浏览工具；默认优先使用 list_directory_flat、list_directory_tree 或 list_vault_overview。',
		whenNotToUse: ['不知道目录路径时先用 find_paths'],
		capabilityTags: ['directory', 'folder', 'tree', 'list', '目录', '树形'],
		requiredArgsSummary: ['directory_path', 'view'],
		compatibility: {
			deprecationStatus: 'legacy',
		},
	},
	runtimePolicy: {
		defaultArgs: {
			response_format: 'json',
		},
		hiddenSchemaFields: ['response_format'],
	},
	isReadOnly: () => true,
	isConcurrencySafe: () => true,
	getToolUseSummary: summarizeListDirectoryTarget,
	getActivityDescription: describeListDirectoryActivity,
	execute: async (args) => executeLegacyListDirectory(app, args),
});