import {
	buildToolRecoveryHint,
	safeJsonPreview,
	summarizeSchema,
} from 'src/services/mcp/mcpToolCallHandlerInternals';
import { getBuiltinToolHint } from 'src/services/mcp/toolHints';
import {
	validateToolArgsDetailed,
	type ToolArgsValidationResult,
} from 'src/services/mcp/mcpToolArgHelpers';
import type {
	ToolDefinition,
	ToolErrorContext,
	ToolRepairHint,
	ToolValidationIssue,
} from './types';
import type {
	BuiltinPermissionDecision,
	BuiltinToolUserInputError,
	BuiltinValidationResult,
} from 'src/tools/runtime/types';

interface BuildValidationContextOptions {
	readonly notes?: readonly string[];
	readonly argsPreview?: string;
	readonly resultPreview?: string;
	readonly schemaSummary?: string;
}

type StructuredToolErrorKind = Exclude<
	ToolErrorContext['kind'],
	'argument-parse' | 'argument-validation'
>;

const dedupeRepairHints = (hints: readonly ToolRepairHint[]): ToolRepairHint[] => {
	const seen = new Set<string>();
	const results: ToolRepairHint[] = [];
	for (const hint of hints) {
		const signature = JSON.stringify(hint);
		if (seen.has(signature)) {
			continue;
		}
		seen.add(signature);
		results.push(hint);
	}
	return results;
};

const buildRepairHintsFromIssues = (
	issues: readonly ToolValidationIssue[],
	toolName: string,
): ToolRepairHint[] => {
	const hints: ToolRepairHint[] = [];
	for (const issue of issues) {
		switch (issue.code) {
			case 'missing-required':
			case 'conditional-required':
				hints.push({
					kind: 'provide-parameter',
					field: issue.field,
					message: issue.code === 'missing-required'
						? `请补充参数 ${issue.field}`
						: issue.message,
				});
				break;
			case 'unknown-parameter':
			case 'mutually-exclusive':
			case 'conditional-forbidden':
				hints.push({
					kind: 'remove-parameter',
					field: issue.field,
					message: issue.code === 'unknown-parameter'
						? `请移除未知参数 ${issue.field}`
						: issue.message,
				});
				break;
			case 'type-mismatch':
			case 'array-item-type-mismatch':
				hints.push({
					kind: 'adjust-value',
					field: issue.field,
					message: `请把 ${issue.field} 改为 ${issue.expected ?? '正确'} 类型`,
				});
				break;
			case 'invalid-enum':
				hints.push({
					kind: 'adjust-value',
					field: issue.field,
					message: `请把 ${issue.field} 改为允许值之一`,
					suggestedValues: issue.acceptedValues,
				});
				break;
			default:
				break;
		}
	}
	const toolHint = getBuiltinToolHint(toolName);
	if (toolHint?.fallbackTool) {
		hints.push({
			kind: 'use-fallback-tool',
			message: `如果当前工具不适合，请改用 ${toolHint.fallbackTool}`,
			fallbackToolName: toolHint.fallbackTool,
		});
	}
	if (toolHint?.usageHint) {
		hints.push({
			kind: 'retry-with-different-args',
			message: toolHint.usageHint,
		});
	}
	return dedupeRepairHints(hints);
};

const mergeNotes = (
	...collections: Array<readonly string[] | undefined>
): string[] | undefined => {
	const merged = collections.flatMap((collection) => collection ?? []);
	return merged.length > 0 ? merged : undefined;
};

const buildStructuredToolErrorContext = (params: {
	readonly kind: StructuredToolErrorKind;
	readonly toolName: string;
	readonly summary: string;
	readonly issues?: readonly ToolValidationIssue[];
	readonly repairHints?: readonly ToolRepairHint[];
	readonly notes?: readonly string[];
	readonly args?: Record<string, unknown>;
	readonly argsPreview?: string;
	readonly resultPreview?: string;
	readonly schemaSummary?: string;
}): ToolErrorContext => {
	const issues = [...(params.issues ?? [])];
	return {
		kind: params.kind,
		summary: params.summary,
		issues,
		repairHints: params.repairHints
			? dedupeRepairHints(params.repairHints)
			: buildRepairHintsFromIssues(issues, params.toolName),
		notes: params.notes,
		argumentsPreview: params.argsPreview ?? (
			params.args ? safeJsonPreview(params.args) : undefined
		),
		resultPreview: params.resultPreview,
		schemaSummary: params.schemaSummary,
	};
};

export const buildToolArgumentParseErrorContext = (
	toolName: string,
	rawArguments: string,
	error: unknown,
): ToolErrorContext => {
	const message = error instanceof Error ? error.message : String(error);
	const repairHints = buildRepairHintsFromIssues([], toolName);
	return {
		kind: 'argument-parse',
		summary: `参数 JSON 解析失败（${message}）`,
		issues: [],
		repairHints,
		argumentsPreview: rawArguments.slice(0, 300),
	};
};

export const buildToolArgumentValidationErrorContext = (
	tool: Pick<ToolDefinition, 'name' | 'inputSchema' | 'runtimePolicy'>,
	args: Record<string, unknown>,
	options?: BuildValidationContextOptions,
): ToolErrorContext => {
	const schema = tool.runtimePolicy?.validationSchema ?? tool.inputSchema;
	const validation = validateToolArgsDetailed(tool.name, schema, args);
	return {
		kind: 'argument-validation',
		summary: validation.issues.map((issue) => issue.message).join('; '),
		issues: validation.issues,
		repairHints: buildRepairHintsFromIssues(validation.issues, tool.name),
		notes: options?.notes,
		argumentsPreview: options?.argsPreview ?? safeJsonPreview(args),
		resultPreview: options?.resultPreview,
		schemaSummary: options?.schemaSummary ?? summarizeSchema(schema),
	};
};

export const buildBuiltinToolValidationErrorContext = (
	toolName: string,
	args: Record<string, unknown>,
	validation: Exclude<BuiltinValidationResult, { ok: true }>,
	options?: BuildValidationContextOptions,
): ToolErrorContext => {
	return buildStructuredToolErrorContext({
		kind: 'tool-validation',
		toolName,
		summary: validation.summary,
		issues: validation.issues,
		repairHints: validation.repairHints,
		notes: mergeNotes(validation.notes, options?.notes),
		args,
		argsPreview: options?.argsPreview,
		schemaSummary: options?.schemaSummary,
	});
};

export const buildBuiltinToolPermissionErrorContext = (
	toolName: string,
	args: Record<string, unknown>,
	decision: Pick<
		Extract<BuiltinPermissionDecision<unknown>, { behavior: 'deny' | 'ask' }>,
		'message'
	>,
	options?: BuildValidationContextOptions,
): ToolErrorContext => {
	return buildStructuredToolErrorContext({
		kind: 'tool-permission',
		toolName,
		summary: decision.message,
		args,
		argsPreview: options?.argsPreview,
		notes: options?.notes,
	});
};

export const buildBuiltinToolUserInputErrorContext = (
	toolName: string,
	args: Record<string, unknown>,
	error: BuiltinToolUserInputError,
	options?: BuildValidationContextOptions,
): ToolErrorContext => {
	return buildStructuredToolErrorContext({
		kind: 'tool-user-input',
		toolName,
		summary: error.message,
		args,
		argsPreview: options?.argsPreview,
		notes: options?.notes,
	});
};

export const buildToolOutputValidationErrorContext = (
	toolName: string,
	result: unknown,
	error: unknown,
	options?: BuildValidationContextOptions,
): ToolErrorContext => {
	const message = error instanceof Error ? error.message : String(error);
	return buildStructuredToolErrorContext({
		kind: 'output-validation',
		toolName,
		summary: `工具输出校验失败（${message}）`,
		notes: options?.notes,
		resultPreview: options?.resultPreview ?? safeJsonPreview(result),
		schemaSummary: options?.schemaSummary ?? '工具输出需满足 outputSchema 约束',
	});
};

export const formatToolErrorContext = (context: ToolErrorContext): string => {
	const parts = [`工具调用失败: ${context.summary}`];
	if (context.argumentsPreview) {
		const previewLabel = context.kind === 'argument-parse'
			? '原始参数'
			: '当前参数';
		parts.push(
			`${previewLabel}=${context.argumentsPreview}`,
		);
	}
	if (context.resultPreview) {
		parts.push(`工具结果=${context.resultPreview}`);
	}
	if (context.schemaSummary) {
		parts.push(`参数约束=${context.schemaSummary}`);
	}
	if (context.notes && context.notes.length > 0) {
		parts.push(`自动修正=${context.notes.join('；')}`);
	}
	if (context.repairHints.length > 0) {
		parts.push(`修复建议=${context.repairHints.map((hint) => hint.message).join('；')}`);
	}
	return parts.join('。');
};

export const buildToolRecoveryHintText = (toolName: string): string => {
	return buildToolRecoveryHint(toolName);
};

export const buildToolValidationResult = (
	tool: Pick<ToolDefinition, 'name' | 'inputSchema' | 'runtimePolicy'>,
	args: Record<string, unknown>,
): ToolArgsValidationResult => {
	const schema = tool.runtimePolicy?.validationSchema ?? tool.inputSchema;
	return validateToolArgsDetailed(tool.name, schema, args);
};
