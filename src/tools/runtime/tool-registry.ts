import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { McpToolAnnotations } from 'src/services/mcp/types';
import type { ToolExecutionOptions } from 'src/types/tool';
import { buildBuiltinTool, type BuiltinToolInput } from './build-tool';
import {
	buildDirectBuiltinToolDefinition,
	executeBuiltinToolLifecycle,
	type DirectBuiltinToolExecutionResult,
} from './builtin-tool-direct-execution';
import type {
	BuiltinTool,
	BuiltinToolExecutionContext,
	BuiltinToolRuntimePolicy,
	BuiltinToolSurfaceSpec,
} from './types';

export interface BuiltinToolInfo {
	name: string;
	title?: string;
	aliases?: readonly string[];
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
	private readonly aliases = new Map<string, string>();

	private normalizeAliases(aliases?: readonly string[]): readonly string[] {
		if (!aliases || aliases.length === 0) {
			return [];
		}

		return Array.from(new Set(
			aliases
				.map((alias) => String(alias ?? '').trim())
				.filter((alias) => alias.length > 0),
		));
	}

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
		const builtTool = buildBuiltinTool(tool as BuiltinToolInput<TArgs>);
		const aliases = this.normalizeAliases(builtTool.aliases)
			.filter((alias) => alias !== builtTool.name);
		const normalizedTool = aliases.length > 0
			? {
				...builtTool,
				aliases,
			}
			: builtTool;

		const existingCanonical = this.resolveName(normalizedTool.name);
		if (existingCanonical && existingCanonical !== normalizedTool.name) {
			throw new Error(`内置工具名称与已注册 alias 冲突: ${normalizedTool.name}`);
		}

		for (const alias of normalizedTool.aliases ?? []) {
			const existingAlias = this.aliases.get(alias);
			if (existingAlias && existingAlias !== normalizedTool.name) {
				throw new Error(`内置工具 alias 冲突: ${alias}`);
			}
			if (this.tools.has(alias) && alias !== normalizedTool.name) {
				throw new Error(`内置工具 alias 与 canonical 名称冲突: ${alias}`);
			}
		}

		this.tools.set(normalizedTool.name, normalizedTool as BuiltinTool<unknown>);
		for (const alias of normalizedTool.aliases ?? []) {
			this.aliases.set(alias, normalizedTool.name);
		}
	}

	registerAll(tools: BuiltinTool[]): void {
		for (const tool of tools) {
			this.register(tool);
		}
	}

	has(name: string): boolean {
		return this.resolveName(name) !== undefined;
	}

	get(name: string): BuiltinTool<unknown> | undefined {
		const canonicalName = this.resolveName(name);
		return canonicalName ? this.tools.get(canonicalName) : undefined;
	}

	getCanonicalName(name: string): string | undefined {
		return this.resolveName(name);
	}

	listToolNames(): string[] {
		return Array.from(this.tools.keys());
	}

	listTools(serverId: string): BuiltinToolInfo[] {
		return Array.from(this.tools.values()).map((tool) => ({
			name: tool.name,
			title: tool.title,
			aliases: tool.aliases,
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
		context: BuiltinToolExecutionContext<unknown>,
		options?: ToolExecutionOptions,
	): Promise<unknown> {
		const result = await this.execute(name, args, context, options);
		if (result.status === 'failed') {
			throw new Error(result.content);
		}
		return result.publicResult;
	}

	async execute(
		name: string,
		args: Record<string, unknown>,
		context: BuiltinToolExecutionContext<unknown>,
		options?: ToolExecutionOptions,
	): Promise<DirectBuiltinToolExecutionResult> {
		const canonicalName = this.resolveName(name);
		if (!canonicalName) {
			return {
				status: 'failed',
				name,
				content: `[工具参数错误] 未找到工具定义: ${name}`,
			};
		}

		const tool = this.tools.get(canonicalName);
		if (!tool) {
			return {
				status: 'failed',
				name: canonicalName,
				content: `[工具参数错误] 未找到工具定义: ${canonicalName}`,
			};
		}

		return await executeBuiltinToolLifecycle({
			call: {
				id: `builtin-direct:${canonicalName}`,
				name: canonicalName,
				arguments: JSON.stringify(args),
			},
			definition: buildDirectBuiltinToolDefinition(
				tool,
				this.zodSchemaToJsonSchema(tool.inputSchema),
			),
			tool,
			args,
			context,
			options,
		});
	}

	private resolveName(name: string): string | undefined {
		if (this.tools.has(name)) {
			return name;
		}
		return this.aliases.get(name);
	}

	clear(): void {
		this.tools.clear();
		this.aliases.clear();
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
