import type {
	ToolCallRequest,
	ToolCallResult,
	ToolErrorContext,
	ToolExecutionOptions,
	ToolDefinition,
	ToolExecutor,
} from 'src/types/tool';
import type { BuiltinToolRegistry } from './tool-registry';
import type { ToolContext } from './types';
import {
	defaultBuiltinToolInvoker,
	type BuiltinToolInvoker,
} from './builtin-tool-executor-support';
import {
	executeBuiltinToolLifecycle,
} from './builtin-tool-direct-execution';
import { completeToolArguments } from 'src/core/agents/loop/tool-call-argument-completion';
import {
	buildToolArgumentValidationErrorContext,
	buildToolArgumentParseErrorContext,
	formatToolErrorContext,
} from 'src/core/agents/loop/tool-call-validation';
import { DebugLogger } from 'src/utils/DebugLogger';
import type {
	ToolArgumentCompletionContext,
} from 'src/core/agents/loop/tool-call-argument-completion';

export class BuiltinToolExecutor implements ToolExecutor {
	private readonly invokeTool: BuiltinToolInvoker;
	private readonly enableRuntimeArgumentCompletion: boolean;
	private readonly runtimeArgumentContext?: Omit<ToolArgumentCompletionContext, 'activeFilePath'>;

	constructor(
		private readonly registry: BuiltinToolRegistry,
		private readonly context: ToolContext,
		invokeTool?: BuiltinToolInvoker,
		options?: {
			readonly enableRuntimeArgumentCompletion?: boolean;
			readonly runtimeArgumentContext?: Omit<ToolArgumentCompletionContext, 'activeFilePath'>;
		},
	) {
		this.invokeTool = invokeTool ?? defaultBuiltinToolInvoker;
		this.enableRuntimeArgumentCompletion = options?.enableRuntimeArgumentCompletion ?? true;
		this.runtimeArgumentContext = options?.runtimeArgumentContext;
	}

	canHandle(call: ToolCallRequest, tools: ToolDefinition[]): boolean {
		const tool = this.resolveDefinition(call.name, tools);
		return tool?.source === 'builtin';
	}

	async execute(
		call: ToolCallRequest,
		tools: ToolDefinition[],
		options?: ToolExecutionOptions,
	): Promise<ToolCallResult> {
		const definition = this.resolveDefinition(call.name, tools);
		const canonicalName = definition?.name ?? this.registry.getCanonicalName(call.name) ?? call.name;
		const normalizedCall = {
			...call,
			name: canonicalName,
		};
		if (!definition) return this.buildMissingToolResult(normalizedCall);

		const rawArgsResult = this.parseRawArgs(normalizedCall);
		if ('result' in rawArgsResult) return rawArgsResult.result;

		const completionResult = this.completeArgs(normalizedCall, definition, rawArgsResult.args);
		if ('result' in completionResult) return completionResult.result;

		const builtinTool = this.registry.get(canonicalName);
		if (!builtinTool) return this.buildMissingToolResult(normalizedCall);

		const executionResult = await executeBuiltinToolLifecycle({
			call: normalizedCall,
			definition,
			tool: builtinTool,
			args: completionResult.args,
			notes: completionResult.notes,
			context: this.context,
			options,
			invokeTool: this.invokeTool,
		});
		if (executionResult.status === 'failed') {
			return {
				toolCallId: normalizedCall.id,
				name: canonicalName,
				content: executionResult.content,
				status: 'failed',
				errorContext: executionResult.errorContext,
			};
		}

		return {
			toolCallId: normalizedCall.id,
			name: canonicalName,
			content: executionResult.serializedResult,
			status: 'completed',
		};
	}

	private resolveDefinition(
		name: string,
		tools: ToolDefinition[],
	): ToolDefinition | undefined {
		const canonicalName = this.registry.getCanonicalName(name) ?? name;
		return tools.find((item) =>
			item.name === name
			|| item.name === canonicalName
			|| (item.compatibility?.legacyCallNames?.includes(name) ?? false),
		);
	}

	private buildMissingToolResult(call: ToolCallRequest): ToolCallResult {
		return {
			toolCallId: call.id,
			name: call.name,
			content: `[工具参数错误] 未找到工具定义: ${call.name}`,
			status: 'failed',
		};
	}

	private parseRawArgs(call: ToolCallRequest):
		| { args: Record<string, unknown> }
		| { result: ToolCallResult } {
		try {
			return {
				args: JSON.parse(call.arguments) as Record<string, unknown>,
			};
		} catch (error) {
			const errorContext = buildToolArgumentParseErrorContext(
				call.name,
				call.arguments,
				error,
			);
			return {
				result: this.createFailedResult(call, errorContext),
			};
		}
	}

	private completeArgs(
		call: ToolCallRequest,
		tool: ToolDefinition,
		rawArgs: Record<string, unknown>,
	):
		| { args: Record<string, unknown>; notes: string[] }
		| { result: ToolCallResult } {
		const completion = completeToolArguments(tool, rawArgs, {
			activeFilePath: this.context.app.workspace.getActiveFile()?.path ?? null,
			...this.runtimeArgumentContext,
		}, {
			enableRuntimeCompletion: this.enableRuntimeArgumentCompletion,
		});
		if (completion.notes.length > 0) {
			DebugLogger.debug('[BuiltinToolExecutor] 参数已补全', {
				toolName: call.name,
				notes: completion.notes,
			});
		}
		if (completion.errors.length > 0) {
			return {
				result: this.createFailedResult(call, completion.errorContext!),
			};
		}
		return {
			args: completion.args,
			notes: completion.notes,
		};
	}

	private createFailedResult(
		call: ToolCallRequest,
		errorContext: ToolErrorContext,
	): ToolCallResult {
		return {
			toolCallId: call.id,
			name: call.name,
			content: formatToolErrorContext(errorContext),
			status: 'failed',
			errorContext,
		};
	}
}
