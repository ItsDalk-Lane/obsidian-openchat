import type { App } from 'obsidian';
import { buildBuiltinTool } from '../../runtime/build-tool';
import { OPEN_FILE_DESCRIPTION } from './description';
import { executeOpenFile, type OpenFileArgs } from './service';
import { openFileResultSchema, openFileSchema } from './schema';

export const OPEN_FILE_TOOL_NAME = 'open_file';

export const createOpenFileTool = (app: App) => buildBuiltinTool<OpenFileArgs>({
	name: OPEN_FILE_TOOL_NAME,
	title: '在 Obsidian 中打开文件',
	description: OPEN_FILE_DESCRIPTION,
	inputSchema: openFileSchema,
	outputSchema: openFileResultSchema,
	annotations: {
		readOnlyHint: false,
		destructiveHint: false,
		idempotentHint: false,
		openWorldHint: false,
	},
	surface: {
		family: 'builtin.vault.read',
		visibility: 'candidate-only',
		argumentComplexity: 'low',
		riskLevel: 'read-only',
		oneLinePurpose: '在 Obsidian 中聚焦一个已知且稳定的文件目标。',
		whenToUse: ['已经知道准确 file_path，只是需要把文件切到前台或展示给用户'],
		whenNotToUse: [
			'不知道路径时先用 find_paths',
			'需要读取正文内容时用 read_file',
			'路径仍不稳定或仍在猜测时不要直接打开',
		],
		capabilityTags: ['open', 'file', 'panel', '打开文件'],
		requiredArgsSummary: ['file_path'],
	},
	runtimePolicy: {
		contextDefaults: [
			{ field: 'file_path', source: 'selected-text-file-path' },
			{ field: 'file_path', source: 'active-file-path' },
		],
	},
	getToolUseSummary: (args) => args.file_path ?? null,
	getActivityDescription: (args) =>
		args.file_path ? `打开文件 ${args.file_path}` : null,
	execute: async (args) => await executeOpenFile(app, args),
});
