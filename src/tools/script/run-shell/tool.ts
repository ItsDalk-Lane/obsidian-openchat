import type { App } from 'obsidian';
import type { BuiltinTool } from '../../runtime/types';
import { buildBuiltinTool } from '../../runtime/build-tool';
import { RUN_SHELL_DESCRIPTION } from './description';
import {
	checkRunShellPermissions,
	executeRunShell,
	resolveRunShellRisk,
	summarizeRunShell,
	validateRunShellInput,
} from './service';
import {
	runShellAnnotations,
	runShellResultSchema,
	runShellSchema,
	type RunShellArgs,
	type RunShellResult,
} from './schema';

export const RUN_SHELL_TOOL_NAME = 'run_shell';

export const createRunShellTool = (
	app: App,
): BuiltinTool<RunShellArgs, RunShellResult, Record<string, unknown>> => buildBuiltinTool<
	RunShellArgs,
	RunShellResult,
	Record<string, unknown>
>({
	name: RUN_SHELL_TOOL_NAME,
	title: '执行本机 Shell',
	description: RUN_SHELL_DESCRIPTION,
	inputSchema: runShellSchema,
	outputSchema: runShellResultSchema,
	annotations: runShellAnnotations,
	surface: {
		family: 'escape.shell',
		source: 'escape-hatch',
		visibility: 'workflow-only',
		argumentComplexity: 'high',
		riskLevel: 'escape-hatch',
		oneLinePurpose: '执行本机 shell 命令。',
		whenNotToUse: [
			'只需要编排多个工具时改用 run_script',
			'Vault 内文件操作优先使用内置文件系统工具',
		],
		capabilityTags: ['shell', 'terminal', 'bash', 'zsh', '终端', '命令行'],
		requiredArgsSummary: ['command'],
	},
	isReadOnly: (args) => resolveRunShellRisk(args.command) === 'read-only',
	isDestructive: (args) => resolveRunShellRisk(args.command) === 'destructive',
	isConcurrencySafe: () => false,
	interruptBehavior: () => 'cancel',
	validateInput: (args) => validateRunShellInput(args),
	checkPermissions: async (args) => await checkRunShellPermissions(app, args),
	getToolUseSummary: summarizeRunShell,
	getActivityDescription: (args) => {
		const summary = summarizeRunShell(args);
		return summary ? `执行 shell 命令 ${summary}` : '执行 shell 命令';
	},
	execute: async (args, context) => await executeRunShell(app, args, context),
});
