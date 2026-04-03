import type {
	ToolCallRequest,
	ToolCallResult,
	ToolDefinition,
	ToolErrorContext,
	ToolExecutionOptions,
} from 'src/types/tool';
import {
	buildBuiltinToolPermissionErrorContext,
	buildBuiltinToolUserInputErrorContext,
	buildBuiltinToolValidationErrorContext,
	buildToolArgumentValidationErrorContext,
	buildToolOutputValidationErrorContext,
	formatToolErrorContext,
} from 'src/core/agents/loop/tool-call-validation';
import {
	createBuiltinInteractionHandlers,
	defaultBuiltinToolInvoker,
	emitBuiltinToolProgress,
	getBuiltinExecutionMeta,
	type BuiltinExecutionMeta,
	type BuiltinToolInvoker,
} from './builtin-tool-executor-support';
import {
	normalizeBuiltinToolExecutionResult,
	serializeMcpToolResult,
	type McpToolResultLike,
} from './tool-result';
import type {
	BuiltinTool,
	BuiltinToolExecutionContext,
} from './types';
import { BuiltinToolUserInputError } from './types';

export interface DirectBuiltinToolExecutionSuccess {
	readonly status: 'completed';
	readonly name: string;
	readonly rawResult: unknown;
	readonly publicResult: unknown;
	readonly normalizedResult: McpToolResultLike;
	readonly serializedResult: string;
}

export interface DirectBuiltinToolExecutionFailure {
	readonly status: 'failed';
	readonly name: string;
	readonly content: string;
	readonly errorContext?: ToolErrorContext;
}

export type DirectBuiltinToolExecutionResult =
	| DirectBuiltinToolExecutionSuccess
	| DirectBuiltinToolExecutionFailure;

interface ExecuteBuiltinToolLifecycleOptions {
	readonly call: ToolCallRequest;
	readonly definition: ToolDefinition;
	readonly tool: BuiltinTool<unknown, unknown, unknown>;
	readonly args: Record<string, unknown>;
	readonly context: BuiltinToolExecutionContext<unknown>;
	readonly options?: ToolExecutionOptions;
	readonly notes?: readonly string[];
	readonly invokeTool?: BuiltinToolInvoker;
}

interface InternalBuiltinToolExecutionContext extends BuiltinToolExecutionContext<unknown> {
	readonly __toolExecutionOptions?: ToolExecutionOptions;
}

const createFailedResult = (
	call: ToolCallRequest,
	errorContext: ToolErrorContext,
): ToolCallResult => ({
	toolCallId: call.id,
	name: call.name,
	content: formatToolErrorContext(errorContext),
	status: 'failed',
	errorContext,
});

const toFailureResult = (
	result: ToolCallResult,
): DirectBuiltinToolExecutionFailure => ({
	status: 'failed',
	name: result.name,
	content: result.content,
	errorContext: result.errorContext,
});

const resolveActiveFilePath = (
	context: BuiltinToolExecutionContext<unknown>,
): string | null => {
	if (typeof context.activeFilePath === 'string') {
		return context.activeFilePath;
	}

	const app = context.app as unknown as {
		workspace?: {
			getActiveFile?: () => { path?: string | null } | null;
		};
	};
	return app.workspace?.getActiveFile?.()?.path ?? null;
};

const emitProgress = (
	call: ToolCallRequest,
	options: ToolExecutionOptions | undefined,
	meta: BuiltinExecutionMeta,
	event: {
		phase?: 'preflight' | 'confirmation' | 'user-input' | 'executing' | 'completed' | 'failed';
		message?: string;
		progress?: unknown;
	},
): void => {
	emitBuiltinToolProgress(call, options, meta, event);
};

const resolveExecutionOptions = (
	context: BuiltinToolExecutionContext<unknown>,
	options: ToolExecutionOptions | undefined,
): ToolExecutionOptions | undefined => {
	return options ?? (context as InternalBuiltinToolExecutionContext).__toolExecutionOptions;
};

const createExecutionContext = (
	call: ToolCallRequest,
	baseContext: BuiltinToolExecutionContext<unknown>,
	options: ToolExecutionOptions | undefined,
	meta: BuiltinExecutionMeta,
): BuiltinToolExecutionContext<unknown> => {
	const effectiveOptions = resolveExecutionOptions(baseContext, options);
	const interactionHandlers = createBuiltinInteractionHandlers(
		call,
		effectiveOptions,
		(event) => emitProgress(call, effectiveOptions, meta, event),
	);

	return {
		...baseContext,
		__toolExecutionOptions: effectiveOptions,
		abortSignal: effectiveOptions?.abortSignal ?? baseContext.abortSignal,
		activeFilePath: resolveActiveFilePath(baseContext),
		selectedTextContext: baseContext.selectedTextContext ?? null,
		reportProgress: (event) => {
			if (!effectiveOptions?.reportProgress) {
				baseContext.reportProgress?.(event);
			}
			emitProgress(call, effectiveOptions, meta, {
				message: event.message,
				progress: event.progress,
			});
		},
		requestConfirmation:
			effectiveOptions?.requestConfirmation
				? interactionHandlers.requestConfirmation
				: (baseContext.requestConfirmation
					?? interactionHandlers.requestConfirmation),
		requestUserInput:
			effectiveOptions?.requestUserInput
				? interactionHandlers.requestUserInput
				: (baseContext.requestUserInput
					?? interactionHandlers.requestUserInput),
	};
};

const validatePermissions = async (
	call: ToolCallRequest,
	tool: BuiltinTool<unknown, unknown, unknown>,
	args: unknown,
	context: BuiltinToolExecutionContext<unknown>,
	options: ToolExecutionOptions | undefined,
	notes: readonly string[],
): Promise<
	| { args: unknown }
	| { result: DirectBuiltinToolExecutionFailure }
> => {
	const decision = await tool.checkPermissions?.(args, context);
	if (!decision || decision.behavior === 'allow') {
		return {
			args: decision?.updatedArgs ?? args,
		};
	}

	if (decision.behavior === 'deny') {
		return {
			result: toFailureResult(createFailedResult(
				call,
				buildBuiltinToolPermissionErrorContext(
					tool.name,
					args as Record<string, unknown>,
					decision,
					{ notes },
				),
			)),
		};
	}

	emitProgress(call, options, getBuiltinExecutionMeta(tool, args), {
		phase: 'confirmation',
		message: decision.message,
	});

	if (!context.requestConfirmation) {
		return {
			result: toFailureResult(createFailedResult(
				call,
				buildBuiltinToolPermissionErrorContext(
					tool.name,
					args as Record<string, unknown>,
					{
						message: `工具需要确认，但当前执行通道未提供确认能力：${decision.message}`,
					},
					{ notes },
				),
			)),
		};
	}

	const response = await context.requestConfirmation(
		decision.confirmation ?? {
			title: `确认执行 ${call.name}`,
			body: decision.message,
		},
	);
	if (response.decision === 'deny') {
		return {
			result: toFailureResult(createFailedResult(
				call,
				buildBuiltinToolPermissionErrorContext(
					tool.name,
					args as Record<string, unknown>,
					{ message: `用户拒绝确认：${decision.message}` },
					{ notes },
				),
			)),
		};
	}

	return {
		args: decision.updatedArgs ?? args,
	};
};

const validateOutput = (
	call: ToolCallRequest,
	tool: BuiltinTool<unknown, unknown, unknown>,
	result: unknown,
):
	| { resultValue: unknown }
	| { result: DirectBuiltinToolExecutionFailure } => {
	if (!tool.outputSchema) {
		return { resultValue: result };
	}

	try {
		return {
			resultValue: tool.outputSchema.parse(result),
		};
	} catch (error) {
		return {
			result: toFailureResult(createFailedResult(
				call,
				buildToolOutputValidationErrorContext(tool.name, result, error),
			)),
		};
	}
};

const toPublicResult = (result: McpToolResultLike): unknown => {
	if (result.structuredContent && typeof result.structuredContent === 'object') {
		return result.structuredContent;
	}
	return serializeMcpToolResult({
		...result,
		isError: false,
	});
};

export const buildDirectBuiltinToolDefinition = (
	tool: BuiltinTool<unknown, unknown, unknown>,
	inputSchema: Record<string, unknown>,
): ToolDefinition => ({
	name: tool.name,
	title: tool.title,
	description: tool.description,
	inputSchema,
	outputSchema: undefined,
	annotations: tool.annotations,
	source: 'builtin',
	sourceId: 'builtin',
	runtimePolicy: tool.runtimePolicy,
	compatibility: {
		version: 1,
		legacyCallNames: [tool.name, ...(tool.aliases ?? [])],
		nativeToolNameHint: tool.name,
		nativeNamespaceHint: 'builtin',
		supportsDeferredSchema: true,
		supportsToolSearch: true,
		deprecationStatus: 'active',
	},
});

export async function executeBuiltinToolLifecycle(
	input: ExecuteBuiltinToolLifecycleOptions,
): Promise<DirectBuiltinToolExecutionResult> {
	const notes = input.notes ?? [];
	const invokeTool = input.invokeTool ?? defaultBuiltinToolInvoker;
	const effectiveOptions = resolveExecutionOptions(input.context, input.options);

	try {
		let parsedArgs: unknown;
		try {
			parsedArgs = input.tool.inputSchema.parse(input.args);
		} catch {
			return toFailureResult(createFailedResult(
				input.call,
				buildToolArgumentValidationErrorContext(
					input.definition,
					input.args,
					{ notes },
				),
			));
		}

		const initialMeta = getBuiltinExecutionMeta(input.tool, parsedArgs);
		const initialContext = createExecutionContext(
			input.call,
			input.context,
			effectiveOptions,
			initialMeta,
		);
		const validation = await input.tool.validateInput?.(parsedArgs, initialContext);
		if (validation && !validation.ok) {
			return toFailureResult(createFailedResult(
				input.call,
				buildBuiltinToolValidationErrorContext(
					input.tool.name,
					parsedArgs as Record<string, unknown>,
					validation,
					{ notes },
				),
			));
		}

		const permissionResult = await validatePermissions(
			input.call,
			input.tool,
			parsedArgs,
			initialContext,
			effectiveOptions,
			notes,
		);
		if ('result' in permissionResult) {
			return permissionResult.result;
		}

		const finalMeta = getBuiltinExecutionMeta(input.tool, permissionResult.args);
		const executionContext = createExecutionContext(
			input.call,
			input.context,
			effectiveOptions,
			finalMeta,
		);

		emitProgress(input.call, effectiveOptions, finalMeta, {
			phase: 'executing',
			message: finalMeta.activityDescription ?? undefined,
		});

		const rawResult = await invokeTool(input.tool, permissionResult.args, executionContext);
		const outputResult = validateOutput(input.call, input.tool, rawResult);
		if ('result' in outputResult) {
			return outputResult.result;
		}

		const normalizedResult = normalizeBuiltinToolExecutionResult(
			input.tool,
			outputResult.resultValue,
			executionContext,
		);
		emitProgress(input.call, effectiveOptions, finalMeta, {
			phase: 'completed',
		});
		return {
			status: 'completed',
			name: input.tool.name,
			rawResult: outputResult.resultValue,
			publicResult: toPublicResult(normalizedResult),
			normalizedResult,
			serializedResult: serializeMcpToolResult(normalizedResult),
		};
	} catch (error) {
		if (error instanceof BuiltinToolUserInputError) {
			return toFailureResult(createFailedResult(
				input.call,
				buildBuiltinToolUserInputErrorContext(
					input.tool.name,
					input.args,
					error,
					{ notes },
				),
			));
		}

		const message = error instanceof Error ? error.message : String(error);
		emitProgress(input.call, effectiveOptions, getBuiltinExecutionMeta(input.tool, input.args), {
			phase: 'failed',
			message,
		});
		return {
			status: 'failed',
			name: input.tool.name,
			content: `[工具执行错误] ${message}`,
		};
	}
}