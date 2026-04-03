import type {
	BuiltinToolExecutionContext,
	BuiltinValidationResult,
} from '../../runtime/types';
import {
	ScriptRuntime,
	type ScriptToolCallEvent,
} from '../../runtime/script-runtime';
import type { RunScriptArgs } from './schema';

const RUN_SCRIPT_SUMMARY_LIMIT = 96;

const collapseScript = (script?: string): string => {
	return String(script ?? '').replace(/\s+/gu, ' ').trim();
};

export const summarizeRunScript = (
	args: Partial<RunScriptArgs>,
): string | null => {
	const collapsed = collapseScript(args.script);
	if (!collapsed) {
		return null;
	}
	return collapsed.length <= RUN_SCRIPT_SUMMARY_LIMIT
		? collapsed
		: `${collapsed.slice(0, RUN_SCRIPT_SUMMARY_LIMIT - 3)}...`;
};

export const validateRunScriptInput = (
	args: RunScriptArgs,
	scriptRuntime: ScriptRuntime,
): BuiltinValidationResult => {
	try {
		scriptRuntime.validateScriptSource(args.script);
		return { ok: true };
	} catch (error) {
		return {
			ok: false,
			summary: error instanceof Error ? error.message : String(error),
			notes: [
				'run_script 只允许受限脚本运行时支持的语法。',
				'如需执行本机命令，请改用 run_shell。',
			],
		};
	}
};

const buildToolCallMessage = (event: ScriptToolCallEvent): string => {
	return `脚本正在调用 ${event.toolName}（第 ${event.callIndex} 步）`;
};

export const executeRunScript = async (
	args: RunScriptArgs,
	context: BuiltinToolExecutionContext<unknown>,
	scriptRuntime: ScriptRuntime,
): Promise<unknown> => {
	return await scriptRuntime.execute(args.script, {
		abortSignal: context.abortSignal,
		toolContext: context,
		onToolCall: (event) => {
			context.reportProgress?.({
				message: buildToolCallMessage(event),
				progress: {
					toolName: event.toolName,
					callIndex: event.callIndex,
				},
			});
		},
	});
};
