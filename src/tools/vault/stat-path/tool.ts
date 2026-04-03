import type { App } from 'obsidian';
import { buildBuiltinTool } from '../../runtime/build-tool';
import { STAT_PATH_DESCRIPTION } from './description';
import { executeStatPath } from './service';
import {
	statPathAnnotations,
	statPathOutputSchema,
	statPathSchema,
	type StatPathArgs,
} from './schema';

export const STAT_PATH_TOOL_NAME = 'stat_path';
export const LEGACY_STAT_PATH_TOOL_NAME = 'get_file_info';

export const createStatPathTool = (app: App) => buildBuiltinTool<StatPathArgs>({
	name: STAT_PATH_TOOL_NAME,
	title: '读取文件元信息',
	aliases: [LEGACY_STAT_PATH_TOOL_NAME],
	description: STAT_PATH_DESCRIPTION,
	inputSchema: statPathSchema,
	outputSchema: statPathOutputSchema,
	annotations: statPathAnnotations,
	surface: {
		family: 'builtin.vault.discovery',
		visibility: 'default',
		argumentComplexity: 'low',
		riskLevel: 'read-only',
		oneLinePurpose: '读取文件或目录的元数据。',
		capabilityTags: ['stat', 'metadata', 'info', '属性', '元数据'],
		requiredArgsSummary: ['target_path'],
	},
	runtimePolicy: {
		defaultArgs: {
			response_format: 'json',
		},
		hiddenSchemaFields: ['response_format'],
		contextDefaults: [
			{ field: 'target_path', source: 'selected-text-file-path' },
			{ field: 'target_path', source: 'active-file-path' },
		],
	},
	isReadOnly: () => true,
	isConcurrencySafe: () => true,
	getToolUseSummary: (args) => args.target_path ?? '/',
	getActivityDescription: (args) =>
		args.target_path ? `读取路径元信息 ${args.target_path}` : '读取路径元信息',
	execute: async (args) => await executeStatPath(app, args),
});