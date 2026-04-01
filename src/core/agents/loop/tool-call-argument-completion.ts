import {
	hasUsableValue,
	normalizeToolArgs,
} from 'src/services/mcp/mcpToolArgHelpers';
import type { ToolDefinition, ToolErrorContext } from './types';
import { buildToolArgumentValidationErrorContext, buildToolValidationResult } from './tool-call-validation';

export interface ToolArgumentCompletionContext {
	readonly activeFilePath?: string | null;
}

export interface ToolArgumentCompletionResult {
	readonly args: Record<string, unknown>;
	readonly notes: string[];
	readonly errors: string[];
	readonly errorContext?: ToolErrorContext;
}

export interface ToolArgumentCompletionOptions {
	readonly enableRuntimeCompletion?: boolean;
}

const applyDefaultArgs = (
	args: Record<string, unknown>,
	defaults: Record<string, unknown> | undefined,
	notes: string[],
): Record<string, unknown> => {
	if (!defaults) {
		return args;
	}

	const next = { ...args };
	for (const [field, value] of Object.entries(defaults)) {
		if (hasUsableValue(next[field])) {
			continue;
		}
		next[field] = value;
		notes.push(`已补全默认参数 ${field}`);
	}
	return next;
};

const applyContextDefaults = (
	tool: ToolDefinition,
	args: Record<string, unknown>,
	context: ToolArgumentCompletionContext | undefined,
	notes: string[],
): Record<string, unknown> => {
	const next = { ...args };
	for (const item of tool.runtimePolicy?.contextDefaults ?? []) {
		if (hasUsableValue(next[item.field])) {
			continue;
		}
		if (item.source === 'active-file-path' && context?.activeFilePath) {
			next[item.field] = context.activeFilePath;
			notes.push(`已从当前活动文件补全 ${item.field}`);
		}
	}
	return next;
};

const getValidationSchema = (tool: ToolDefinition): Record<string, unknown> | undefined => {
	return tool.runtimePolicy?.validationSchema ?? tool.inputSchema;
};

export const completeToolArguments = (
	tool: ToolDefinition,
	rawArgs: Record<string, unknown>,
	context?: ToolArgumentCompletionContext,
	options?: ToolArgumentCompletionOptions,
): ToolArgumentCompletionResult => {
	const enableRuntimeCompletion = options?.enableRuntimeCompletion ?? true;
	const normalized = enableRuntimeCompletion
		? normalizeToolArgs(tool.name, getValidationSchema(tool), rawArgs)
		: {
			args: { ...rawArgs },
			notes: [] as string[],
		};
	const notes = [...normalized.notes];
	let args = normalized.args;
	if (enableRuntimeCompletion) {
		args = applyDefaultArgs(args, tool.runtimePolicy?.defaultArgs, notes);
		args = applyContextDefaults(tool, args, context, notes);
	}
	const validation = buildToolValidationResult(tool, args);
	const errors = validation.issues.map((issue) => issue.message);
	return {
		args,
		notes,
		errors,
		errorContext: errors.length > 0
			? buildToolArgumentValidationErrorContext(tool, args, { notes })
			: undefined,
	};
};
