import type { App } from 'obsidian';
import { buildBuiltinTool } from '../../runtime/build-tool';
import { readOnlyToolAnnotations, structuredOutputSchema } from '../filesystemToolSchemas';
import { LIST_DIRECTORY_FLAT_DESCRIPTION } from './description';
import { buildListDirectoryFlatArgs, executeListDirectoryFlat } from './service';
import {
	listDirectoryFlatSchema,
	type ListDirectoryFlatArgs,
} from './schema';

export const LIST_DIRECTORY_FLAT_TOOL_NAME = 'list_directory_flat';

export const createListDirectoryFlatTool = (
	app: App,
) => buildBuiltinTool<ListDirectoryFlatArgs>({
	name: LIST_DIRECTORY_FLAT_TOOL_NAME,
	title: '列出当前目录一层内容',
	description: LIST_DIRECTORY_FLAT_DESCRIPTION,
	inputSchema: listDirectoryFlatSchema,
	outputSchema: structuredOutputSchema,
	annotations: readOnlyToolAnnotations,
	surface: {
		family: 'builtin.vault.discovery',
		visibility: 'default',
		argumentComplexity: 'medium',
		riskLevel: 'read-only',
		oneLinePurpose: '浏览一个已知目录的一层内容。',
		whenNotToUse: [
			'需要树形递归时用 list_directory_tree',
			'需要全库总览时用 list_vault_overview',
		],
		capabilityTags: ['directory', 'folder', 'flat list', '目录浏览', '当前目录'],
		requiredArgsSummary: ['directory_path'],
	},
	isReadOnly: () => true,
	isConcurrencySafe: () => true,
	getToolUseSummary: (args) => args.directory_path ?? '/',
	getActivityDescription: (args) =>
		`浏览目录 ${buildListDirectoryFlatArgs({
			directory_path: args.directory_path ?? '/',
			include_sizes: args.include_sizes ?? false,
			sort_by: args.sort_by ?? 'name',
			regex: args.regex,
			limit: args.limit ?? 100,
			offset: args.offset ?? 0,
		}).directory_path ?? '/'}`,
	execute: async (args) => await executeListDirectoryFlat(app, args),
});
