import type { App } from 'obsidian';
import { buildBuiltinTool } from '../../runtime/build-tool';
import { DELETE_PATH_DESCRIPTION } from './description';
import {
	checkDeletePathPermissions,
	executeDeletePath,
	summarizeDeletePathTarget,
	validateDeletePathInput,
} from './service';
import {
	deleteFileSchema,
	deletePathAnnotations,
	deletePathOutputSchema,
	type DeletePathArgs,
} from './schema';

export const DELETE_PATH_TOOL_NAME = 'delete_path';

export const createDeletePathTool = (app: App) => buildBuiltinTool<DeletePathArgs>({
	name: DELETE_PATH_TOOL_NAME,
	title: '删除路径',
	description: DELETE_PATH_DESCRIPTION,
	inputSchema: deleteFileSchema,
	outputSchema: deletePathOutputSchema,
	annotations: deletePathAnnotations,
	surface: {
		family: 'builtin.vault.write',
		visibility: 'workflow-only',
		argumentComplexity: 'medium',
		riskLevel: 'destructive',
		oneLinePurpose: '删除文件或目录。',
		whenNotToUse: [
			'不知道路径时先用 find_paths',
			'只是想重组内容时优先用 move_path 或 edit_file',
		],
		capabilityTags: ['delete', 'remove', '删除', '移除'],
		requiredArgsSummary: ['target_path'],
	},
	isReadOnly: () => false,
	isDestructive: () => true,
	isConcurrencySafe: () => false,
	validateInput: (args) => validateDeletePathInput(args),
	checkPermissions: (args) => checkDeletePathPermissions(app, args),
	getToolUseSummary: summarizeDeletePathTarget,
	getActivityDescription: (args) =>
		args.target_path ? `删除路径 ${args.target_path}` : null,
	execute: async (args) => await executeDeletePath(app, args),
});
