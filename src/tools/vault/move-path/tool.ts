import type { App } from 'obsidian';
import { buildBuiltinTool } from '../../runtime/build-tool';
import { MOVE_PATH_DESCRIPTION } from './description';
import {
	checkMovePathPermissions,
	executeMovePath,
	summarizeMovePathTarget,
	validateMovePathInput,
} from './service';
import {
	moveFileSchema,
	movePathAnnotations,
	movePathOutputSchema,
	type MovePathArgs,
} from './schema';

export const MOVE_PATH_TOOL_NAME = 'move_path';

export const createMovePathTool = (app: App) => buildBuiltinTool<MovePathArgs>({
	name: MOVE_PATH_TOOL_NAME,
	title: '移动或重命名路径',
	description: MOVE_PATH_DESCRIPTION,
	inputSchema: moveFileSchema,
	outputSchema: movePathOutputSchema,
	annotations: movePathAnnotations,
	surface: {
		family: 'builtin.vault.write',
		visibility: 'default',
		argumentComplexity: 'low',
		riskLevel: 'mutating',
		oneLinePurpose: '移动或重命名文件、目录。',
		whenNotToUse: ['不知道路径时先用 find_paths', '只是想复制内容时不要用 move_path'],
		capabilityTags: ['move', 'rename', '移动', '重命名'],
		requiredArgsSummary: ['source_path', 'destination_path'],
	},
	isReadOnly: () => false,
	isDestructive: () => false,
	isConcurrencySafe: () => false,
	validateInput: (args) => validateMovePathInput(args),
	checkPermissions: (args) => checkMovePathPermissions(app, args),
	getToolUseSummary: summarizeMovePathTarget,
	getActivityDescription: (args) => {
		const summary = summarizeMovePathTarget(args);
		return summary ? `移动路径 ${summary}` : null;
	},
	execute: async (args) => await executeMovePath(app, args),
});
