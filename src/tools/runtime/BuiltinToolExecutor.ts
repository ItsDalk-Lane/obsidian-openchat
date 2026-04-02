import type {
	ToolCallRequest,
	ToolCallResult,
	ToolErrorContext,
	ToolExecutionOptions,
	ToolDefinition,
	ToolExecutor,
} from 'src/types/tool';
import type { BuiltinToolRegistry } from './tool-registry';
import type {
	BuiltinTool,
	BuiltinToolExecutionContext,
	ToolContext,
} from './types';
import { BuiltinToolUserInputError } from './types';
import {
	createBuiltinInteractionHandlers,
	defaultBuiltinToolInvoker,
	emitBuiltinToolProgress,
	getBuiltinExecutionMeta,
	type BuiltinExecutionMeta,
	type BuiltinToolInvoker,
	type PreparedBuiltinToolExecution,
	toToolConfirmationRequest,
} from './builtin-tool-executor-support';
import {
	normalizeBuiltinToolExecutionResult,
	serializeMcpToolResult,
} from './tool-result';
import { completeToolArguments } from 'src/core/agents/loop/tool-call-argument-completion';
import {
	buildBuiltinToolPermissionErrorContext,
	buildBuiltinToolUserInputErrorContext,
	buildBuiltinToolValidationErrorContext,
	buildToolArgumentValidationErrorContext,
	buildToolArgumentParseErrorContext,
	buildToolOutputValidationErrorContext,
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
		const tool = tools.find((item) => item.name === call.name);
		return tool?.source === 'builtin';
	}

	async execute(
		call: ToolCallRequest,
		tools: ToolDefinition[],
		options?: ToolExecutionOptions,
	): Promise<ToolCallResult> {
		const definition = tools.find((item) => item.name === call.name);
		if (!definition) return this.buildMissingToolResult(call);

		const rawArgsResult = this.parseRawArgs(call);
		if ('result' in rawArgsResult) return rawArgsResult.result;

		const completionResult = this.completeArgs(call, definition, rawArgsResult.args);
		if ('result' in completionResult) return completionResult.result;

		const builtinTool = this.registry.get(call.name);
		if (!builtinTool) return this.buildMissingToolResult(call);

		return await this.executeResolvedTool(
			call,
			definition,
			builtinTool,
			completionResult.args,
			completionResult.notes,
			options,
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

	private async executeResolvedTool(
		call: ToolCallRequest,
		definition: ToolDefinition,
		tool: BuiltinTool<unknown, unknown, unknown>,
		args: Record<string, unknown>,
		notes: readonly string[],
		options?: ToolExecutionOptions,
	): Promise<ToolCallResult> {
		try {
			const preparedResult = await this.prepareExecution(
				call,
				definition,
				tool,
				args,
				notes,
				options,
			);
			if ('result' in preparedResult) return preparedResult.result;

			return await this.executePreparedTool(call, tool, preparedResult, options);
		} catch (error) {
			if (error instanceof BuiltinToolUserInputError) {
				return this.createFailedResult(
					call,
					buildBuiltinToolUserInputErrorContext(tool.name, args, error, {
						notes,
					}),
				);
			}
			const message = error instanceof Error ? error.message : String(error);
			this.emitProgress(
				call,
				options,
				{ toolUseSummary: null, activityDescription: null },
				{
					phase: 'failed',
					message,
				},
			);
			return {
				toolCallId: call.id,
				name: call.name,
				content: `[工具执行错误] ${message}`,
				status: 'failed',
			};
		}
	}

	private async prepareExecution(
		call: ToolCallRequest,
		definition: ToolDefinition,
		tool: BuiltinTool<unknown, unknown, unknown>,
		args: Record<string, unknown>,
		notes: readonly string[],
		options?: ToolExecutionOptions,
	): Promise<
		| PreparedBuiltinToolExecution
		| { result: ToolCallResult }
	> {
		const parsedArgsResult = this.parseBuiltinArgs(call, definition, tool, args, notes);
		if ('result' in parsedArgsResult) return parsedArgsResult;

		const initialMeta = getBuiltinExecutionMeta(tool, parsedArgsResult.args);
		const initialContext = this.createExecutionContext(call, options, initialMeta);
		const validatedResult = await this.validateBuiltinArgs(
			call,
			tool,
			parsedArgsResult.args,
			initialContext,
			notes,
		);
		if ('result' in validatedResult) return validatedResult;

		const permissionResult = await this.resolvePermissions(
			call,
			tool,
			validatedResult.args,
			initialContext,
			options,
			notes,
		);
		if ('result' in permissionResult) return permissionResult;

		const finalMeta = getBuiltinExecutionMeta(tool, permissionResult.args);
		return {
			args: permissionResult.args,
			meta: finalMeta,
			context: this.createExecutionContext(call, options, finalMeta),
		};
	}

	private async executePreparedTool(
		call: ToolCallRequest,
		tool: BuiltinTool<unknown, unknown, unknown>,
		prepared: PreparedBuiltinToolExecution,
		options?: ToolExecutionOptions,
	): Promise<ToolCallResult> {
		this.emitProgress(call, options, prepared.meta, {
			phase: 'executing',
			message: prepared.meta.activityDescription ?? undefined,
		});

		const rawResult = await this.invokeTool(tool, prepared.args, prepared.context);
		const outputResult = this.validateOutput(call, tool, rawResult);
		if ('result' in outputResult) return outputResult.result;

		const normalized = normalizeBuiltinToolExecutionResult(
			tool,
			outputResult.resultValue,
			prepared.context,
		);
		this.emitProgress(call, options, prepared.meta, {
			phase: 'completed',
		});
		return {
			toolCallId: call.id,
			name: call.name,
			content: serializeMcpToolResult(normalized),
			status: 'completed',
		};
	}

	private parseBuiltinArgs(
		call: ToolCallRequest,
		definition: ToolDefinition,
		tool: BuiltinTool<unknown, unknown, unknown>,
		args: Record<string, unknown>,
		notes: readonly string[],
	):
		| { args: unknown }
		| { result: ToolCallResult } {
		try {
			return {
				args: tool.inputSchema.parse(args),
			};
		} catch {
			const errorContext = buildToolArgumentValidationErrorContext(definition, args, {
				notes,
			});
			return {
				result: this.createFailedResult(call, errorContext),
			};
		}
	}

	private async validateBuiltinArgs(
		call: ToolCallRequest,
		tool: BuiltinTool<unknown, unknown, unknown>,
		args: unknown,
		context: BuiltinToolExecutionContext<unknown>,
		notes: readonly string[],
	): Promise<
		| { args: unknown }
		| { result: ToolCallResult }
	> {
		const validation = await tool.validateInput?.(args, context);
		if (!validation || validation.ok) {
			return { args };
		}
		const errorContext = buildBuiltinToolValidationErrorContext(
			tool.name,
			args as Record<string, unknown>,
			validation,
			{ notes },
		);
		return {
			result: this.createFailedResult(call, errorContext),
		};
	}

	private async resolvePermissions(
		call: ToolCallRequest,
		tool: BuiltinTool<unknown, unknown, unknown>,
		args: unknown,
		context: BuiltinToolExecutionContext<unknown>,
		options: ToolExecutionOptions | undefined,
		notes: readonly string[],
	): Promise<
		| { args: unknown }
		| { result: ToolCallResult }
	> {
		const decision = await tool.checkPermissions?.(args, context);
		if (!decision || decision.behavior === 'allow') {
			return { args: decision?.updatedArgs ?? args };
		}
		if (decision.behavior === 'deny') {
			return {
				result: this.createFailedResult(
					call,
					buildBuiltinToolPermissionErrorContext(
						tool.name,
						args as Record<string, unknown>,
						decision,
						{ notes },
					),
				),
			};
		}
		this.emitProgress(call, options, getBuiltinExecutionMeta(tool, args), {
			phase: 'confirmation',
			message: decision.message,
		});
		return await this.handleConfirmationDecision(
			call,
			tool,
			args,
			decision,
			options,
			notes,
		);
	}

	private async handleConfirmationDecision(
		call: ToolCallRequest,
		tool: BuiltinTool<unknown, unknown, unknown>,
		args: unknown,
		decision: Extract<
			Awaited<ReturnType<NonNullable<BuiltinTool<unknown>['checkPermissions']>>>,
			{ behavior: 'ask' }
		>,
		options: ToolExecutionOptions | undefined,
		notes: readonly string[],
	): Promise<
		| { args: unknown }
		| { result: ToolCallResult }
	> {
		const confirmation = toToolConfirmationRequest(
			call,
			decision.confirmation ?? {
				title: `确认执行 ${call.name}`,
				body: decision.message,
			},
		);
		if (!options?.requestConfirmation) {
			return {
				result: this.createFailedResult(
					call,
					buildBuiltinToolPermissionErrorContext(
						tool.name,
						args as Record<string, unknown>,
						{
							message: `工具需要确认，但当前执行通道未提供确认能力：${decision.message}`,
						},
						{ notes },
					),
				),
			};
		}
		const response = await options.requestConfirmation(confirmation);
		if (response.decision === 'deny') {
			return {
				result: this.createFailedResult(
					call,
					buildBuiltinToolPermissionErrorContext(
						tool.name,
						args as Record<string, unknown>,
						{ message: `用户拒绝确认：${decision.message}` },
						{ notes },
					),
				),
			};
		}
		return {
			args: decision.updatedArgs ?? args,
		};
	}

	private validateOutput(
		call: ToolCallRequest,
		tool: BuiltinTool<unknown, unknown, unknown>,
		result: unknown,
	):
		| { resultValue: unknown }
		| { result: ToolCallResult } {
		if (!tool.outputSchema) {
			return { resultValue: result };
		}
		try {
			return {
				resultValue: tool.outputSchema.parse(result),
			};
		} catch (error) {
			const errorContext = buildToolOutputValidationErrorContext(
				tool.name,
				result,
				error,
			);
			return {
				result: this.createFailedResult(call, errorContext),
			};
		}
	}

	private createExecutionContext(
		call: ToolCallRequest,
		options: ToolExecutionOptions | undefined,
		meta: BuiltinExecutionMeta,
	): BuiltinToolExecutionContext<unknown> {
		return {
			...this.context,
			abortSignal: options?.abortSignal,
			activeFilePath: this.context.app.workspace.getActiveFile()?.path ?? null,
			selectedTextContext: {
				filePath: this.runtimeArgumentContext?.selectedTextFilePath ?? null,
				startLine: this.runtimeArgumentContext?.selectedTextRange?.startLine,
				endLine: this.runtimeArgumentContext?.selectedTextRange?.endLine,
			},
			reportProgress: (event) => {
				this.emitProgress(call, options, meta, event);
			},
			...createBuiltinInteractionHandlers(
				call,
				options,
				(event) => this.emitProgress(call, options, meta, event),
			),
		};
	}

	private emitProgress(
		call: ToolCallRequest,
		options: ToolExecutionOptions | undefined,
		meta: BuiltinExecutionMeta,
		event: {
			phase?: 'preflight' | 'confirmation' | 'user-input' | 'executing' | 'completed' | 'failed';
			message?: string;
			progress?: unknown;
		},
	): void {
		emitBuiltinToolProgress(call, options, meta, event);
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
