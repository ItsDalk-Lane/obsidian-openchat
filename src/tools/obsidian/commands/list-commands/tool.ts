import type { App } from 'obsidian';
import { buildBuiltinTool } from '../../../runtime/build-tool';
import { LIST_COMMANDS_DESCRIPTION } from './description';
import {
	describeListCommandsActivity,
	executeListCommands,
	summarizeListCommands,
} from './service';
import {
	listCommandsAnnotations,
	listCommandsResultSchema,
	listCommandsSchema,
	type ListCommandsArgs,
	type ListCommandsResult,
} from './schema';

export const LIST_COMMANDS_TOOL_NAME = 'list_commands';

export const createListCommandsTool = (app: App) => buildBuiltinTool<
	ListCommandsArgs,
	ListCommandsResult
>({
	name: LIST_COMMANDS_TOOL_NAME,
	title: '列出 Obsidian 命令',
	description: LIST_COMMANDS_DESCRIPTION,
	inputSchema: listCommandsSchema,
	outputSchema: listCommandsResultSchema,
	annotations: listCommandsAnnotations,
	surface: {
		family: 'builtin.obsidian.commands',
		visibility: 'candidate-only',
		argumentComplexity: 'low',
		riskLevel: 'read-only',
		oneLinePurpose: '发现当前可执行的 Obsidian 命令。',
		whenToUse: [
			'需要先发现命令再执行',
			'需要按关键词筛选插件命令',
		],
		whenNotToUse: [
			'已经知道命令 id 时改用 run_command',
		],
		capabilityTags: [
			'command',
			'commands',
			'obsidian',
			'palette',
			'命令',
			'命令面板',
		],
	},
	isReadOnly: () => true,
	isConcurrencySafe: () => true,
	getToolUseSummary: summarizeListCommands,
	getActivityDescription: describeListCommandsActivity,
	execute: async (args) => executeListCommands(app, args),
});
