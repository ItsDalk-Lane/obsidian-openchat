import type { App } from 'obsidian';
import { buildBuiltinTool } from '../../runtime/build-tool';
import { FIND_PATHS_DESCRIPTION } from './description';
import { executeFindPaths } from './service';
import {
	findPathsAnnotations,
	findPathsOutputSchema,
	findPathsSchema,
	type FindPathsArgs,
} from './schema';

export const FIND_PATHS_TOOL_NAME = 'find_paths';

const summarizeFindPathsTarget = (args: Partial<FindPathsArgs>): string | null => {
	if (!args.query) {
		return null;
	}
	const scopePath = args.scope_path ?? '/';
	return scopePath === '/' ? args.query : `${args.query} @ ${scopePath}`;
};

export const createFindPathsTool = (app: App) => buildBuiltinTool<FindPathsArgs>({
	name: FIND_PATHS_TOOL_NAME,
	title: '按名称发现路径',
	description: FIND_PATHS_DESCRIPTION,
	inputSchema: findPathsSchema,
	outputSchema: findPathsOutputSchema,
	annotations: findPathsAnnotations,
	surface: {
		family: 'builtin.vault.discovery',
		visibility: 'default',
		argumentComplexity: 'medium',
		riskLevel: 'read-only',
		oneLinePurpose: '按名称或路径片段查找文件和目录。',
		whenToUse: ['只知道名称或模糊路径时先定位目标'],
		whenNotToUse: [
			'已经知道准确目录路径时改用 list_directory_flat 或 list_directory_tree',
			'要读取内容时改用 read_file',
		],
		capabilityTags: ['find', 'path', 'locate', '文件名', '路径搜索', '查找'],
		requiredArgsSummary: ['query'],
	},
	runtimePolicy: {
		defaultArgs: {
			response_format: 'json',
		},
		hiddenSchemaFields: ['response_format'],
	},
	isReadOnly: () => true,
	isConcurrencySafe: () => true,
	getToolUseSummary: summarizeFindPathsTarget,
	getActivityDescription: (args) =>
		args.query ? `查找路径 ${summarizeFindPathsTarget(args)}` : null,
	execute: async (args) => await executeFindPaths(app, args),
});
