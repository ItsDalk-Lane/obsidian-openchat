import type { App } from 'obsidian';
import { buildBuiltinTool } from '../../runtime/build-tool';
import { CREATE_DIRECTORY_DESCRIPTION } from './description';
import { executeCreateDirectory } from './service';
import {
	createDirectoryAnnotations,
	createDirectoryOutputSchema,
	createDirectorySchema,
	type CreateDirectoryArgs,
} from './schema';

export const CREATE_DIRECTORY_TOOL_NAME = 'create_directory';

export const createCreateDirectoryTool = (app: App) => buildBuiltinTool<CreateDirectoryArgs>({
	name: CREATE_DIRECTORY_TOOL_NAME,
	title: '创建目录',
	description: CREATE_DIRECTORY_DESCRIPTION,
	inputSchema: createDirectorySchema,
	outputSchema: createDirectoryOutputSchema,
	annotations: createDirectoryAnnotations,
	surface: {
		family: 'builtin.vault.write',
		visibility: 'default',
		argumentComplexity: 'low',
		riskLevel: 'mutating',
		oneLinePurpose: '创建目录。',
		capabilityTags: ['directory', 'folder', 'mkdir', '创建目录', '新建文件夹'],
		requiredArgsSummary: ['directory_path'],
	},
	isReadOnly: () => false,
	isDestructive: () => false,
	isConcurrencySafe: () => false,
	getToolUseSummary: (args) => args.directory_path,
	getActivityDescription: (args) =>
		args.directory_path ? `创建目录 ${args.directory_path}` : '创建目录',
	execute: async (args) => await executeCreateDirectory(app, args),
});