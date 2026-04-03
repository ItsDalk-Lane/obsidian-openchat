import type { App } from 'obsidian';
import { buildBuiltinTool } from '../../runtime/build-tool';
import { READ_FILES_DESCRIPTION } from './description';
import { executeReadFiles, summarizeReadFilesTarget } from './service';
import {
	readFilesAnnotations,
	readFilesOutputSchema,
	readFilesSchema,
	type ReadMultipleFilesArgs,
} from './schema';

export const READ_FILES_TOOL_NAME = 'read_files';

export const createReadFilesTool = (app: App) => buildBuiltinTool<ReadMultipleFilesArgs>({
	name: READ_FILES_TOOL_NAME,
	title: '批量读取文本文件',
	description: READ_FILES_DESCRIPTION,
	inputSchema: readFilesSchema,
	outputSchema: readFilesOutputSchema,
	annotations: readFilesAnnotations,
	surface: {
		family: 'builtin.vault.read',
		visibility: 'candidate-only',
		argumentComplexity: 'medium',
		riskLevel: 'read-only',
		oneLinePurpose: '批量读取多个已知文件。',
		capabilityTags: ['batch', 'multiple files', '多个文件', '批量'],
		requiredArgsSummary: ['file_paths'],
	},
	runtimePolicy: {
		defaultArgs: {
			response_format: 'json',
		},
		hiddenSchemaFields: ['response_format'],
	},
	isReadOnly: () => true,
	isConcurrencySafe: () => true,
	getToolUseSummary: summarizeReadFilesTarget,
	getActivityDescription: (args) => {
		const summary = summarizeReadFilesTarget(args);
		return summary ? `批量读取 ${summary}` : '批量读取文件';
	},
	execute: async (args) => await executeReadFiles(app, args),
});