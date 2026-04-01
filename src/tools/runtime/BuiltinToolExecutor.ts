import type {
	ToolCallRequest,
	ToolCallResult,
	ToolDefinition,
	ToolExecutionOptions,
	ToolExecutor,
} from 'src/types/tool';
import type { BuiltinToolRegistry } from './tool-registry';
import type { ToolContext } from './types';
import {
	normalizeStructuredToolResult,
	serializeMcpToolResult,
} from './tool-result';
import { completeToolArguments } from 'src/core/agents/loop/tool-call-argument-completion';
import {
	buildToolArgumentParseErrorContext,
	formatToolErrorContext,
} from 'src/core/agents/loop/tool-call-validation';
import { DebugLogger } from 'src/utils/DebugLogger';

export class BuiltinToolExecutor implements ToolExecutor {
	private readonly callTool: (
		name: string,
		args: Record<string, unknown>
	) => Promise<unknown>;
	private readonly enableRuntimeArgumentCompletion: boolean;

	constructor(
		private readonly registry: BuiltinToolRegistry,
		private readonly context: ToolContext,
		callTool?: (
			name: string,
			args: Record<string, unknown>
		) => Promise<unknown>,
		options?: {
			readonly enableRuntimeArgumentCompletion?: boolean;
		},
	) {
		this.callTool = callTool ?? (async (name, args) =>
			await this.registry.call(name, args, this.context));
		this.enableRuntimeArgumentCompletion = options?.enableRuntimeArgumentCompletion ?? true;
	}

	canHandle(call: ToolCallRequest, tools: ToolDefinition[]): boolean {
		const tool = tools.find((item) => item.name === call.name);
		return tool?.source === 'builtin';
	}

	async execute(
		call: ToolCallRequest,
		tools: ToolDefinition[],
		_options?: ToolExecutionOptions,
	): Promise<ToolCallResult> {
		const tool = tools.find((item) => item.name === call.name);
		if (!tool) {
			return {
				toolCallId: call.id,
				name: call.name,
				content: `[工具参数错误] 未找到工具定义: ${call.name}`,
				status: 'failed',
			};
		}

		let rawArgs: Record<string, unknown>;
		try {
			rawArgs = JSON.parse(call.arguments) as Record<string, unknown>;
		} catch (error) {
			const errorContext = buildToolArgumentParseErrorContext(call.name, call.arguments, error);
			return {
				toolCallId: call.id,
				name: call.name,
				content: formatToolErrorContext(errorContext),
				status: 'failed',
				errorContext,
			};
		}

		try {
			const completion = completeToolArguments(tool, rawArgs, {
				activeFilePath: this.context.app.workspace.getActiveFile()?.path ?? null,
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
					toolCallId: call.id,
					name: call.name,
					content: formatToolErrorContext(completion.errorContext!),
					status: 'failed',
					errorContext: completion.errorContext,
				};
			}

			const result = await this.callTool(call.name, completion.args);
			const normalized = normalizeStructuredToolResult(result);
			return {
				toolCallId: call.id,
				name: call.name,
				content: serializeMcpToolResult(normalized),
				status: 'completed',
			};
		} catch (error) {
			return {
				toolCallId: call.id,
				name: call.name,
				content: `[工具执行错误] ${error instanceof Error ? error.message : String(error)}`,
				status: 'failed',
			};
		}
	}
}
