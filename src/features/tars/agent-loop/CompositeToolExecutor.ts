import type {
	ToolCallRequest,
	ToolCallResult,
	ToolDefinition,
	ToolExecutionOptions,
	ToolExecutor,
} from './types';

export class CompositeToolExecutor implements ToolExecutor {
	constructor(private readonly executors: ToolExecutor[]) {}

	async execute(
		call: ToolCallRequest,
		tools: ToolDefinition[],
		options?: ToolExecutionOptions,
	): Promise<ToolCallResult> {
		const fallbackExecutor = this.executors[this.executors.length - 1];

		for (const executor of this.executors) {
			if (executor === fallbackExecutor) {
				break;
			}
			if (!executor.canHandle?.(call, tools)) {
				continue;
			}
			return await executor.execute(call, tools, options);
		}

		if (!fallbackExecutor) {
			throw new Error(`未找到工具执行器: ${call.name}`);
		}
		return await fallbackExecutor.execute(call, tools, options);
	}
}
