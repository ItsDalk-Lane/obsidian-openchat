import type { App } from 'obsidian';
import { buildBuiltinTool } from '../../runtime/build-tool';
import { READ_FILE_DESCRIPTION } from './description';
import { executeReadFile } from './service';
import {
	DEFAULT_READ_SEGMENT_LINES,
	readFileAnnotations,
	readFileOutputSchema,
	readTextFileSchema,
	type ReadFileArgs,
} from './schema';

export const READ_FILE_TOOL_NAME = 'read_file';

const READ_FILE_SURFACE = {
	family: 'builtin.vault.read',
	visibility: 'default',
	argumentComplexity: 'medium',
	riskLevel: 'read-only',
	oneLinePurpose: '读取单个已知文件的文本内容。',
	whenNotToUse: ['不知道路径时先用 find_paths'],
	capabilityTags: ['read', 'file', 'content', 'lines', '读取文件', '查看内容'],
	requiredArgsSummary: ['file_path'],
} as const;

const summarizeReadFileTarget = (args: Partial<ReadFileArgs>): string | null => {
	if (!args.file_path) {
		return null;
	}
	const readMode = args.read_mode ?? 'segment';
	if (readMode !== 'segment') {
		return `${args.file_path} (${readMode})`;
	}
	const startLine = args.start_line ?? 1;
	const lineCount = args.line_count ?? DEFAULT_READ_SEGMENT_LINES;
	return `${args.file_path}:${startLine}-${startLine + lineCount - 1}`;
};

export const createReadFileTool = (app: App) => buildBuiltinTool<ReadFileArgs>({
	name: READ_FILE_TOOL_NAME,
	title: '读取文本文件',
	description: READ_FILE_DESCRIPTION,
	inputSchema: readTextFileSchema,
	outputSchema: readFileOutputSchema,
	annotations: readFileAnnotations,
	surface: READ_FILE_SURFACE,
	runtimePolicy: {
		defaultArgs: {
			response_format: 'json',
		},
		hiddenSchemaFields: ['response_format'],
		contextDefaults: [
			{ field: 'file_path', source: 'selected-text-file-path' },
			{ field: 'file_path', source: 'active-file-path' },
			{ field: 'start_line', source: 'selected-text-start-line' },
			{ field: 'line_count', source: 'selected-text-line-count' },
		],
	},
	isReadOnly: () => true,
	isConcurrencySafe: () => true,
	getToolUseSummary: summarizeReadFileTarget,
	getActivityDescription: (args) =>
		args.file_path ? `读取文件 ${args.file_path}` : null,
	execute: async (args) => await executeReadFile(app, args),
});
