import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpToolAnnotations } from 'src/services/mcp/types';
import { z } from 'zod';
import { buildBuiltinTool, type BuiltinToolInput } from './build-tool';
import { BuiltinToolRegistry } from './tool-registry';
import { normalizeBuiltinToolExecutionResult } from './tool-result';
import type {
	BuiltinTool,
	BuiltinToolExecutionContext,
	BuiltinToolRuntimePolicy,
	BuiltinToolSurfaceSpec,
} from './types';

const toErrorMessage = (error: unknown): string => {
	if (error instanceof Error) return error.message;
	return String(error);
};

interface RegisterBuiltinToolOptions {
	title?: string;
	description: string;
	inputSchema: z.ZodTypeAny;
	outputSchema?: z.ZodTypeAny;
	annotations?: McpToolAnnotations;
	prompt?: string;
	aliases?: readonly string[];
	surface?: BuiltinToolSurfaceSpec;
	runtimePolicy?: BuiltinToolRuntimePolicy;
}

interface McpServerWithRegisterTool {
	registerTool: (
		name: string,
		options: {
			title?: string;
			description: string;
			inputSchema: z.ZodTypeAny;
			outputSchema?: z.ZodTypeAny;
			annotations?: McpToolAnnotations;
		},
		handler: (args: Record<string, unknown>) => Promise<unknown>
	) => void;
}

const createMcpRegistrationContext = (): BuiltinToolExecutionContext => ({
	app: {} as never,
	callTool: async () => {
		throw new Error('MCP 注册入口不支持跨工具调用');
	},
});

function toBuiltinTool<TArgs extends Record<string, unknown>, TResult>(
	name: string,
	options: RegisterBuiltinToolOptions,
	handler: (args: TArgs) => Promise<TResult> | TResult
): BuiltinTool<TArgs, TResult> {
	return buildBuiltinTool<TArgs, TResult>({
		name,
		title: options.title,
		description: options.description,
		prompt: options.prompt,
		aliases: options.aliases,
		inputSchema: options.inputSchema,
		outputSchema: options.outputSchema,
		annotations: options.annotations,
		surface: options.surface,
		runtimePolicy: options.runtimePolicy,
		execute: async (args) => await handler(args),
	});
}

export function registerBuiltinTool<TArgs extends Record<string, unknown>, TResult>(
	server: McpServer,
	registry: BuiltinToolRegistry,
	tool: BuiltinToolInput<TArgs, TResult>
): void;

export function registerBuiltinTool<TArgs extends Record<string, unknown>>(
	server: McpServer,
	registry: BuiltinToolRegistry,
	name: string,
	options: RegisterBuiltinToolOptions,
	handler: (args: TArgs) => Promise<unknown> | unknown
): void;

export function registerBuiltinTool<TArgs extends Record<string, unknown>, TResult>(
	server: McpServer,
	registry: BuiltinToolRegistry,
	nameOrTool: string | BuiltinToolInput<TArgs, TResult>,
	options?: RegisterBuiltinToolOptions,
	handler?: (args: TArgs) => Promise<TResult> | TResult
): void {
	const tool = typeof nameOrTool === 'string'
		? toBuiltinTool(nameOrTool, options!, handler!)
		: buildBuiltinTool(nameOrTool);
	registry.register(tool);
	const registeredServer = server as unknown as McpServerWithRegisterTool;

	registeredServer.registerTool(
		tool.name,
		{
			title: tool.title,
			description: tool.description,
			inputSchema: tool.inputSchema,
			outputSchema: tool.outputSchema,
			annotations: tool.annotations,
		},
		async (args: Record<string, unknown>) => {
			try {
				const context = createMcpRegistrationContext();
				const result = await tool.execute(args as TArgs, context);
				return normalizeBuiltinToolExecutionResult(tool, result, context);
			} catch (error) {
				return {
					isError: true,
					content: [
						{
							type: 'text' as const,
							text: toErrorMessage(error),
						},
					],
				};
			}
		}
	);
}
