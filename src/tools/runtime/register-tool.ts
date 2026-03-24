import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpToolAnnotations } from 'src/services/mcp/types';
import { z } from 'zod';
import { BuiltinToolRegistry } from './tool-registry';
import { normalizeStructuredToolResult } from './tool-result';
import type { BuiltinTool } from './types';

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
}

export function registerBuiltinTool(
	server: McpServer,
	registry: BuiltinToolRegistry,
	name: string,
	options: RegisterBuiltinToolOptions,
	handler: (args: any) => Promise<unknown> | unknown
): void {
	const tool: BuiltinTool<any> = {
		name,
		title: options.title,
		description: options.description,
		inputSchema: options.inputSchema,
		outputSchema: options.outputSchema,
		annotations: options.annotations,
		execute: async (args) => await handler(args),
	};
	registry.register(tool);

	(server as any).registerTool(
		name,
		{
			title: options.title,
			description: options.description,
			inputSchema: options.inputSchema,
			outputSchema: options.outputSchema,
			annotations: options.annotations,
		},
		async (args: Record<string, unknown>) => {
			try {
				const result = await handler(args);
				return normalizeStructuredToolResult(result);
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
