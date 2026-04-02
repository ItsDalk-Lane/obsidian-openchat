import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { McpToolAnnotations } from 'src/services/mcp/types';
import { buildBuiltinTool, type BuiltinToolInput } from './build-tool';
import type {
	BuiltinTool,
	BuiltinToolRuntimePolicy,
	BuiltinToolSurfaceSpec,
	ToolContext,
} from './types';

export interface BuiltinToolInfo {
	name: string;
	title?: string;
	description: string;
	inputSchema: Record<string, unknown>;
	outputSchema?: Record<string, unknown>;
	annotations?: McpToolAnnotations;
	surface?: BuiltinToolSurfaceSpec;
	runtimePolicy?: BuiltinToolRuntimePolicy;
	serverId: string;
}

export class BuiltinToolRegistry {
	private readonly tools = new Map<string, BuiltinTool<unknown>>();

	private normalizeJsonSchema(value: unknown): unknown {
		if (Array.isArray(value)) {
			return value.map((item) => this.normalizeJsonSchema(item));
		}
		if (!value || typeof value !== 'object') {
			return value;
		}

		const record = value as Record<string, unknown>;
		const next: Record<string, unknown> = {};
		for (const [key, child] of Object.entries(record)) {
			next[key] = this.normalizeJsonSchema(child);
		}

		if (next.exclusiveMinimum === true && typeof next.minimum === 'number') {
			next.exclusiveMinimum = next.minimum;
			delete next.minimum;
		}

		if (next.exclusiveMaximum === true && typeof next.maximum === 'number') {
			next.exclusiveMaximum = next.maximum;
			delete next.maximum;
		}

		return next;
	}

	register<TArgs>(tool: BuiltinTool<TArgs>): void {
		const normalizedTool = buildBuiltinTool(tool as BuiltinToolInput<TArgs>);
		this.tools.set(normalizedTool.name, normalizedTool as BuiltinTool<unknown>);
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
			surface: tool.surface,
			runtimePolicy: tool.runtimePolicy,
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
		return this.normalizeJsonSchema(
			zodToJsonSchema(schema as unknown as Parameters<typeof zodToJsonSchema>[0], {
			target: 'openApi3',
			$refStrategy: 'none',
			}) as Record<string, unknown>
		) as Record<string, unknown>;
	}
}
