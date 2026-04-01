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

interface BuildValidationContextOptions {
	readonly notes?: readonly string[];
	readonly argsPreview?: string;
	readonly schemaSummary?: string;
}

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
	const hints: ToolRepairHint[] = issues.flatMap((issue) => {
		switch (issue.code) {
			case 'missing-required':
				return [{
					kind: 'provide-parameter',
					field: issue.field,
					message: `请补充参数 ${issue.field}`,
				}];
			case 'unknown-parameter':
				return [{
					kind: 'remove-parameter',
					field: issue.field,
					message: `请移除未知参数 ${issue.field}`,
				}];
			case 'type-mismatch':
			case 'array-item-type-mismatch':
				return [{
					kind: 'adjust-value',
					field: issue.field,
					message: `请把 ${issue.field} 改为 ${issue.expected ?? '正确'} 类型`,
				}];
			case 'invalid-enum':
				return [{
					kind: 'adjust-value',
					field: issue.field,
					message: `请把 ${issue.field} 改为允许值之一`,
					suggestedValues: issue.acceptedValues,
				}];
			case 'mutually-exclusive':
			case 'conditional-forbidden':
				return [{
					kind: 'remove-parameter',
					field: issue.field,
					message: issue.message,
				}];
			case 'conditional-required':
				return [{
					kind: 'provide-parameter',
					field: issue.field,
					message: issue.message,
				}];
			default:
				return [];
		}
	});
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
		schemaSummary: options?.schemaSummary ?? summarizeSchema(schema),
	};
};

export const formatToolErrorContext = (context: ToolErrorContext): string => {
	const parts = [`工具调用失败: ${context.summary}`];
	if (context.argumentsPreview) {
		parts.push(
			`${context.kind === 'argument-parse' ? '原始参数' : '当前参数'}=${context.argumentsPreview}`,
		);
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