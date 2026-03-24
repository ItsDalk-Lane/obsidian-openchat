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

export class BuiltinToolExecutor implements ToolExecutor {
	private readonly callTool: (
		name: string,
		args: Record<string, unknown>
	) => Promise<unknown>;

	constructor(
		private readonly registry: BuiltinToolRegistry,
		private readonly context: ToolContext,
		callTool?: (
			name: string,
			args: Record<string, unknown>
		) => Promise<unknown>,
	) {
		this.callTool = callTool ?? (async (name, args) =>
			await this.registry.call(name, args, this.context));
	}

	canHandle(call: ToolCallRequest, tools: ToolDefinition[]): boolean {
		const tool = tools.find((item) => item.name === call.name);
		return tool?.source === 'builtin';
	}

	async execute(
		call: ToolCallRequest,
		_tools: ToolDefinition[],
		_options?: ToolExecutionOptions,
	): Promise<ToolCallResult> {
		try {
			const args = JSON.parse(call.arguments) as Record<string, unknown>;
			const result = await this.callTool(call.name, args);
			const normalized = normalizeStructuredToolResult(result);
			return {
				toolCallId: call.id,
				name: call.name,
				content: serializeMcpToolResult(normalized),
			};
		} catch (error) {
			return {
				toolCallId: call.id,
				name: call.name,
				content: `[工具执行错误] ${error instanceof Error ? error.message : String(error)}`,
			};
		}
	}
}
