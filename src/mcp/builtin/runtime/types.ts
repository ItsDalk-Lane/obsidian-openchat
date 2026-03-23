import type { App } from 'obsidian';
import type { McpToolAnnotations } from 'src/mcp/client/types';
import { z } from 'zod';

export interface ToolContext {
	readonly app: App;
	readonly callTool: (
		name: string,
		args: Record<string, unknown>
	) => Promise<unknown>;
}

export interface BuiltinTool<TArgs = unknown> {
	readonly name: string;
	readonly title?: string;
	readonly description: string;
	readonly inputSchema: z.ZodType<TArgs>;
	readonly outputSchema?: z.ZodTypeAny;
	readonly annotations?: McpToolAnnotations;
	execute(args: TArgs, context: ToolContext): Promise<unknown> | unknown;
}
