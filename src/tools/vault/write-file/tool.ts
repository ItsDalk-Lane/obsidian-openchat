import type { App } from 'obsidian';
import { buildBuiltinTool } from '../../runtime/build-tool';
import { WRITE_FILE_DESCRIPTION } from './description';
import {
	checkWriteFilePermissions,
	executeWriteFile,
	validateWriteFileInput,
} from './service';
import {
	writeFileAnnotations,
	writeFileOutputSchema,
	writeFileSchema,
	type WriteFileArgs,
} from './schema';

export const WRITE_FILE_TOOL_NAME = 'write_file';

const summarizeWriteFileTarget = (
	args: Partial<WriteFileArgs>,
): string | null => args.file_path ?? null;

export const createWriteFileTool = (app: App) => buildBuiltinTool<WriteFileArgs>({
	name: WRITE_FILE_TOOL_NAME,
	title: '写入文本文件',
	description: WRITE_FILE_DESCRIPTION,
	inputSchema: writeFileSchema,
	outputSchema: writeFileOutputSchema,
	annotations: writeFileAnnotations,
	surface: {
		family: 'builtin.vault.write',
		visibility: 'default',
		argumentComplexity: 'low',
		riskLevel: 'mutating',
		oneLinePurpose: '创建文本文件或整体覆盖已有内容。',
		whenNotToUse: [
			'只需要局部修改时改用 edit_file',
			'不知道路径时先用 find_paths',
		],
		capabilityTags: ['write', 'create file', 'overwrite', '写入文件', '新建文件'],
		requiredArgsSummary: ['file_path', 'content'],
	},
	isReadOnly: () => false,
	isDestructive: (args) => args.content.trim().length === 0,
	isConcurrencySafe: () => false,
	validateInput: (args) => validateWriteFileInput(args),
	checkPermissions: async (args) => await checkWriteFilePermissions(app, args),
	getToolUseSummary: summarizeWriteFileTarget,
	getActivityDescription: (args) =>
		args.file_path ? `写入文件 ${args.file_path}` : null,
	execute: async (args) => await executeWriteFile(app, args),
});
