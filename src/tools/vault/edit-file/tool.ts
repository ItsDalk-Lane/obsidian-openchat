import type { App } from 'obsidian';
import { buildBuiltinTool } from '../../runtime/build-tool';
import { EDIT_FILE_DESCRIPTION } from './description';
import {
	checkEditFilePermissions,
	executeEditFile,
	isDestructiveEditOperation,
	validateEditFileInput,
} from './service';
import {
	editFileAnnotations,
	editFileOutputSchema,
	editFileSchema,
	type EditFileArgs,
} from './schema';

export const EDIT_FILE_TOOL_NAME = 'edit_file';

const summarizeEditTarget = (args: Partial<EditFileArgs>): string | null => {
	if (!args.file_path) {
		return null;
	}
	const editCount = Array.isArray(args.edits) ? args.edits.length : 0;
	const prefix = args.dry_run ? '[dry-run] ' : '';
	return `${prefix}${args.file_path}${editCount > 0 ? ` (${editCount} edits)` : ''}`;
};

export const createEditFileTool = (app: App) => buildBuiltinTool<EditFileArgs>({
	name: EDIT_FILE_TOOL_NAME,
	title: '编辑文本文件',
	description: EDIT_FILE_DESCRIPTION,
	inputSchema: editFileSchema,
	outputSchema: editFileOutputSchema,
	annotations: editFileAnnotations,
	surface: {
		family: 'builtin.vault.write',
		visibility: 'default',
		argumentComplexity: 'medium',
		riskLevel: 'mutating',
		oneLinePurpose: '对已知文件做最小局部编辑。',
		whenToUse: ['只修改当前一段或少量已知片段', '希望保留文件其余内容不变'],
		whenNotToUse: [
			'需要整文件重写时用 write_file',
			'片段定位不唯一时先用 read_file 读取目标范围',
		],
		capabilityTags: ['edit', 'patch', 'modify', '局部修改', '编辑文件'],
		requiredArgsSummary: ['file_path', 'edits'],
	},
	runtimePolicy: {
		contextDefaults: [
			{ field: 'file_path', source: 'selected-text-file-path' },
			{ field: 'file_path', source: 'active-file-path' },
		],
	},
	isReadOnly: (args) => args.dry_run === true,
	isDestructive: (args) =>
		args.dry_run !== true && args.edits.some(isDestructiveEditOperation),
	isConcurrencySafe: (args) => args.dry_run === true,
	validateInput: (args) => validateEditFileInput(args),
	checkPermissions: async (args) => await checkEditFilePermissions(app, args),
	getToolUseSummary: summarizeEditTarget,
	getActivityDescription: (args) =>
		args.file_path ? `编辑文件 ${args.file_path}` : null,
	execute: async (args) => await executeEditFile(app, args),
});
