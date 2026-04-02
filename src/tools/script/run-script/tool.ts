import type { BuiltinTool } from '../../runtime/types';
import { buildBuiltinTool } from '../../runtime/build-tool';
import { ScriptRuntime } from '../../runtime/script-runtime';
import { RUN_SCRIPT_DESCRIPTION } from './description';
import {
	executeRunScript,
	summarizeRunScript,
	validateRunScriptInput,
} from './service';
import {
	runScriptAnnotations,
	runScriptSchema,
	type RunScriptArgs,
} from './schema';

export const RUN_SCRIPT_TOOL_NAME = 'run_script';

export const createRunScriptTool = (
	scriptRuntime: ScriptRuntime,
): BuiltinTool<RunScriptArgs, unknown, Record<string, unknown>> => buildBuiltinTool<
	RunScriptArgs,
	unknown,
	Record<string, unknown>
>({
	name: RUN_SCRIPT_TOOL_NAME,
	title: '执行受限脚本',
	description: RUN_SCRIPT_DESCRIPTION,
	inputSchema: runScriptSchema,
	annotations: runScriptAnnotations,
	surface: {
		family: 'workflow.orchestrate',
		source: 'workflow',
		visibility: 'workflow-only',
		argumentComplexity: 'high',
		riskLevel: 'escape-hatch',
		oneLinePurpose: '用受限脚本编排多个工具调用。',
		whenNotToUse: [
			'只调用单个工具时直接调用目标工具',
			'需要执行本机命令时改用 run_shell',
		],
		capabilityTags: ['workflow', 'orchestrate', '编排', '脚本'],
		requiredArgsSummary: ['script'],
	},
	isReadOnly: () => false,
	isDestructive: () => false,
	isConcurrencySafe: () => false,
	interruptBehavior: () => 'block',
	validateInput: (args) => validateRunScriptInput(args, scriptRuntime),
	getToolUseSummary: summarizeRunScript,
	getActivityDescription: () => '执行受限脚本编排',
	execute: async (args, context) =>
		await executeRunScript(args, context, scriptRuntime),
});
