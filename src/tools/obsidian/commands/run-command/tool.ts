import type { App } from 'obsidian';
import { buildBuiltinTool } from '../../../runtime/build-tool';
import { RUN_COMMAND_DESCRIPTION } from './description';
import {
	checkRunCommandPermissions,
	describeRunCommandActivity,
	executeRunCommand,
	resolveRunCommandRisk,
	summarizeRunCommand,
	validateRunCommandInput,
} from './service';
import {
	runCommandAnnotations,
	runCommandResultSchema,
	runCommandSchema,
	type RunCommandArgs,
	type RunCommandResult,
} from './schema';

export const RUN_COMMAND_TOOL_NAME = 'run_command';

export const createRunCommandTool = (app: App) => buildBuiltinTool<
	RunCommandArgs,
	RunCommandResult
>({
	name: RUN_COMMAND_TOOL_NAME,
	title: '执行 Obsidian 命令',
	description: RUN_COMMAND_DESCRIPTION,
	inputSchema: runCommandSchema,
	outputSchema: runCommandResultSchema,
	annotations: runCommandAnnotations,
	surface: {
		family: 'workflow.obsidian.commands',
		source: 'workflow',
		visibility: 'workflow-only',
		argumentComplexity: 'low',
		riskLevel: 'mutating',
		oneLinePurpose: '执行一个已知的 Obsidian command id。',
		whenToUse: [
			'已经知道命令 id 并希望直接触发',
			'需要通过命令来打开面板或调用插件动作',
		],
		whenNotToUse: [
			'不知道命令 id 时先用 list_commands',
		],
		capabilityTags: [
			'command',
			'commands',
			'obsidian',
			'workflow',
			'命令',
			'执行命令',
		],
		requiredArgsSummary: ['command_id'],
	},
	isReadOnly: (args) => resolveRunCommandRisk(args.command_id) === 'read-only',
	isDestructive: (args) => {
		const risk = resolveRunCommandRisk(args.command_id);
		return risk === 'destructive' || risk === 'unknown';
	},
	isConcurrencySafe: () => false,
	validateInput: validateRunCommandInput,
	checkPermissions: async (args) => await checkRunCommandPermissions(app, args),
	getToolUseSummary: summarizeRunCommand,
	getActivityDescription: describeRunCommandActivity,
	execute: async (args) => executeRunCommand(app, args),
});
