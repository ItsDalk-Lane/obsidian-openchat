import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { McpToolAnnotations } from 'src/services/mcp/types';
import type { BuiltinTool, ToolContext } from './types';

export interface BuiltinToolInfo {
	name: string;
	title?: string;
	description: string;
	inputSchema: Record<string, unknown>;
	outputSchema?: Record<string, unknown>;
	annotations?: McpToolAnnotations;
	serverId: string;
}

export class BuiltinToolRegistry {
	private readonly tools = new Map<string, BuiltinTool<unknown>>();

	register<TArgs>(tool: BuiltinTool<TArgs>): void {
		this.tools.set(tool.name, tool as BuiltinTool<unknown>);
	}

	registerAll(tools: BuiltinTool[]): void {
		for (const tool of tools) {
			this.register(tool);
		}
	}

	has(name: string): boolean {
		return this.tools.has(name);
	}

	get(name: string): BuiltinTool<unknown> | undefined {
		return this.tools.get(name);
	}

	listToolNames(): string[] {
		return Array.from(this.tools.keys());
	}

	listTools(serverId: string): BuiltinToolInfo[] {
		return Array.from(this.tools.values()).map((tool) => ({
			name: tool.name,
			title: tool.title,
			description: tool.description,
			inputSchema: this.zodSchemaToJsonSchema(tool.inputSchema),
			outputSchema: tool.outputSchema
				? this.zodSchemaToJsonSchema(tool.outputSchema)
				: undefined,
			annotations: tool.annotations,
			serverId,
		}));
	}

	async call(
		name: string,
		args: Record<string, unknown>,
		context: ToolContext
	): Promise<unknown> {
		const tool = this.tools.get(name);
		if (!tool) {
			throw new Error(`未找到内置工具: ${name}`);
		}

		const parsedArgs = tool.inputSchema.parse(args);
		return await tool.execute(parsedArgs, context);
	}

	clear(): void {
		this.tools.clear();
	}

	private zodSchemaToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
		return zodToJsonSchema(schema as any, {
			target: 'openApi3',
			$refStrategy: 'none',
		}) as Record<string, unknown>;
	}
}
