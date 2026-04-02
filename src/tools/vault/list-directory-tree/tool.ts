import type { App } from 'obsidian';
import { buildBuiltinTool } from '../../runtime/build-tool';
import { readOnlyToolAnnotations, structuredOutputSchema } from '../filesystemToolSchemas';
import { LIST_DIRECTORY_TREE_DESCRIPTION } from './description';
import { executeListDirectoryTree } from './service';
import {
	listDirectoryTreeSchema,
	type ListDirectoryTreeArgs,
} from './schema';

export const LIST_DIRECTORY_TREE_TOOL_NAME = 'list_directory_tree';

export const createListDirectoryTreeTool = (
	app: App,
) => buildBuiltinTool<ListDirectoryTreeArgs>({
	name: LIST_DIRECTORY_TREE_TOOL_NAME,
	title: '树形列出目录',
	description: LIST_DIRECTORY_TREE_DESCRIPTION,
	inputSchema: listDirectoryTreeSchema,
	outputSchema: structuredOutputSchema,
	annotations: readOnlyToolAnnotations,
	surface: {
		family: 'builtin.vault.discovery',
		visibility: 'default',
		argumentComplexity: 'medium',
		riskLevel: 'read-only',
		oneLinePurpose: '以树形方式递归浏览已知目录。',
		whenNotToUse: [
			'只看当前目录一层时用 list_directory_flat',
			'需要全库概览时用 list_vault_overview',
		],
		capabilityTags: ['directory tree', 'tree', 'recursive directory', '树形目录', '递归目录'],
		requiredArgsSummary: ['directory_path'],
	},
	isReadOnly: () => true,
	isConcurrencySafe: () => true,
	getToolUseSummary: (args) => args.directory_path ?? '/',
	getActivityDescription: (args) =>
		`递归浏览目录 ${args.directory_path ?? '/'}`,
	execute: async (args) => await executeListDirectoryTree(app, args),
});
