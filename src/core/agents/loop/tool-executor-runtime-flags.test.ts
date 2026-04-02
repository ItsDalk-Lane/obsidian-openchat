import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import { BuiltinToolExecutor } from 'src/tools/runtime/BuiltinToolExecutor';
import { McpToolExecutor } from 'src/services/mcp/McpToolExecutor';
import { buildBuiltinTool } from 'src/tools/runtime/build-tool';
import { BuiltinToolRegistry } from 'src/tools/runtime/tool-registry';
import type { ToolDefinition, ToolProgressEvent } from './types';

const createBuiltinTool = (): ToolDefinition => ({
	name: 'read_file',
	description: '读取文件',
	inputSchema: {
		type: 'object',
		properties: {
			file_path: { type: 'string' },
			response_format: { type: 'string', enum: ['json', 'text'] },
		},
		required: ['file_path'],
	},
	source: 'builtin',
	sourceId: 'builtin',
	runtimePolicy: {
		defaultArgs: { response_format: 'json' },
		contextDefaults: [{ field: 'file_path', source: 'active-file-path' }],
	},
});

const createMcpTool = (): ToolDefinition => ({
	name: 'list_directory',
	description: '列出目录',
	inputSchema: {
		type: 'object',
		properties: {
			directory_path: { type: 'string' },
			view: { type: 'string', enum: ['flat', 'tree'] },
		},
		required: ['directory_path'],
	},
	source: 'mcp',
	sourceId: 'mcp-server',
	runtimePolicy: {
		defaultArgs: { view: 'flat' },
	},
});

function createBuiltinRegistry(): BuiltinToolRegistry {
	return new BuiltinToolRegistry();
}

type WriteFileArgs = {
	file_path: string;
	content: string;
};

test('BuiltinToolExecutor 会根据 runtimeArgCompletionV2 开关决定是否补全默认参数', async () => {
	const tool = createBuiltinTool();
	const calledArgs: Record<string, unknown>[] = [];
	const enabledRegistry = createBuiltinRegistry();
	const disabledRegistry = createBuiltinRegistry();
	const builtinImpl = {
		name: 'read_file',
		description: '读取文件',
		inputSchema: z.object({
			file_path: z.string(),
			response_format: z.enum(['json', 'text']).optional(),
		}),
		execute: async (args: Record<string, unknown>) => {
			calledArgs.push(args);
			return args;
		},
	};
	enabledRegistry.register(builtinImpl);
	disabledRegistry.register(builtinImpl);
	const context = {
		app: {
			workspace: {
				getActiveFile: () => ({ path: 'notes/current.md' }),
			},
		},
	} as never;
	const enabledExecutor = new BuiltinToolExecutor(
		enabledRegistry,
		context,
		undefined,
		{ enableRuntimeArgumentCompletion: true },
	);
	const disabledExecutor = new BuiltinToolExecutor(
		disabledRegistry,
		context,
		undefined,
		{ enableRuntimeArgumentCompletion: false },
	);

	const enabledResult = await enabledExecutor.execute({
		id: 'call-1',
		name: 'read_file',
		arguments: '{}',
	}, [tool]);
	const disabledResult = await disabledExecutor.execute({
		id: 'call-2',
		name: 'read_file',
		arguments: '{}',
	}, [tool]);

	assert.equal(enabledResult.status, 'completed');
	assert.equal(calledArgs[0]?.file_path, 'notes/current.md');
	assert.equal(calledArgs[0]?.response_format, 'json');
	assert.equal(disabledResult.status, 'failed');
	assert.equal(disabledResult.errorContext?.kind, 'argument-validation');
	assert.equal(calledArgs.length, 1);
});

test('BuiltinToolExecutor 会把当前轮选区上下文注入具体工具参数', async () => {
	const tool: ToolDefinition = {
		name: 'read_file',
		description: '读取文件',
		inputSchema: {
			type: 'object',
			properties: {
				file_path: { type: 'string' },
				start_line: { type: 'integer' },
				line_count: { type: 'integer' },
			},
			required: ['file_path'],
		},
		source: 'builtin',
		sourceId: 'builtin',
		runtimePolicy: {
			contextDefaults: [
				{ field: 'file_path', source: 'selected-text-file-path' },
				{ field: 'file_path', source: 'active-file-path' },
				{ field: 'start_line', source: 'selected-text-start-line' },
				{ field: 'line_count', source: 'selected-text-line-count' },
			],
		},
	};
	const calledArgs: Record<string, unknown>[] = [];
	const registry = createBuiltinRegistry();
	registry.register({
		name: 'read_file',
		description: '读取文件',
		inputSchema: z.object({
			file_path: z.string(),
			start_line: z.number().int().optional(),
			line_count: z.number().int().optional(),
		}),
		execute: async (args: Record<string, unknown>) => {
			calledArgs.push(args);
			return args;
		},
	});
	const context = {
		app: {
			workspace: {
				getActiveFile: () => ({ path: 'notes/current.md' }),
			},
		},
	} as never;
	const executor = new BuiltinToolExecutor(
		registry,
		context,
		undefined,
		{
			enableRuntimeArgumentCompletion: true,
			runtimeArgumentContext: {
				selectedTextFilePath: 'docs/spec.md',
				selectedTextRange: {
					from: 20,
					to: 60,
					startLine: 3,
					endLine: 6,
				},
			},
		},
	);

	const result = await executor.execute({
		id: 'call-3',
		name: 'read_file',
		arguments: '{}',
	}, [tool]);

	assert.equal(result.status, 'completed');
	assert.equal(calledArgs[0]?.file_path, 'docs/spec.md');
	assert.equal(calledArgs[0]?.start_line, 3);
	assert.equal(calledArgs[0]?.line_count, 4);
});

test('BuiltinToolExecutor 会消费 validateInput/checkPermissions/reportProgress/serializeResult', async () => {
	const tool = {
		name: 'write_file',
		description: '写入文件',
		inputSchema: {
			type: 'object',
			properties: {
				file_path: { type: 'string' },
				content: { type: 'string' },
			},
			required: ['file_path', 'content'],
		},
		source: 'builtin',
		sourceId: 'builtin',
	} satisfies ToolDefinition;
	const confirmations: Array<{ title: string; body?: string }> = [];
	const progressEvents: ToolProgressEvent[] = [];
	const registry = createBuiltinRegistry();
	registry.register(buildBuiltinTool<WriteFileArgs, { saved: boolean }, number>({
		name: 'write_file',
		description: '写入文件',
		inputSchema: z.object({
			file_path: z.string(),
			content: z.string(),
		}),
		outputSchema: z.object({
			saved: z.boolean(),
		}),
		validateInput: (args) => args.content.trim().length > 0
			? { ok: true }
			: { ok: false, summary: '内容不能为空' },
		checkPermissions: (args) => ({
			behavior: 'ask',
			message: '写入文件前需要确认',
			confirmation: {
				title: '确认写入',
				body: args.file_path,
				confirmLabel: '继续',
			},
		}),
		getToolUseSummary: (args) =>
			args.file_path ? `写入 ${args.file_path}` : null,
		getActivityDescription: (args) =>
			args.file_path ? `正在写入 ${args.file_path}` : null,
		serializeResult: (result: { saved: boolean }) => ({
			structuredContent: {
				saved: result.saved,
				target: 'vault',
			},
		}),
		execute: async (_args, context) => {
			context.reportProgress?.({
				message: '已完成一半',
				progress: 0.5,
			});
			return { saved: true };
		},
	}));
	const executor = new BuiltinToolExecutor(registry, {
		app: {
			workspace: {
				getActiveFile: () => ({ path: 'notes/current.md' }),
			},
		},
		callTool: async () => null,
	} as never);

	const result = await executor.execute({
		id: 'call-4',
		name: 'write_file',
		arguments: JSON.stringify({
			file_path: 'notes/out.md',
			content: 'hello',
		}),
	}, [tool], {
		requestConfirmation: async (request) => {
			confirmations.push({ title: request.title, body: request.body });
			return { decision: 'allow' };
		},
		reportProgress: (event) => {
			progressEvents.push(event);
		},
	});

	assert.equal(result.status, 'completed');
	assert.equal(confirmations[0]?.title, '确认写入');
	assert.equal(confirmations[0]?.body, 'notes/out.md');
	assert.match(result.content, /"saved": true/);
	assert.match(result.content, /"target": "vault"/);
	assert.ok(progressEvents.some((event) => event.phase === 'confirmation'));
	assert.ok(progressEvents.some((event) => event.phase === 'completed'));
	assert.ok(progressEvents.some((event) => event.message === '已完成一半'));
	assert.equal(progressEvents[0]?.toolUseSummary, '写入 notes/out.md');
});

test('BuiltinToolExecutor 会把业务校验与权限确认失败映射到结构化错误上下文', async () => {
	const tool = {
		name: 'write_file',
		description: '写入文件',
		inputSchema: {
			type: 'object',
			properties: {
				file_path: { type: 'string' },
				content: { type: 'string' },
			},
			required: ['file_path', 'content'],
		},
		source: 'builtin',
		sourceId: 'builtin',
	} satisfies ToolDefinition;
	const registry = createBuiltinRegistry();
	registry.register(buildBuiltinTool({
		name: 'write_file',
		description: '写入文件',
		inputSchema: z.object({
			file_path: z.string(),
			content: z.string(),
		}),
		validateInput: (args: { file_path: string }) =>
			args.file_path.startsWith('notes/')
				? { ok: true }
				: { ok: false, summary: '业务规则要求写入 notes/ 目录' },
		execute: async () => ({ ok: true }),
	}));
	registry.register(buildBuiltinTool({
		name: 'dangerous_delete',
		description: '危险删除',
		inputSchema: z.object({
			target_path: z.string(),
		}),
		checkPermissions: () => ({
			behavior: 'ask',
			message: '删除前需要确认',
			confirmation: {
				title: '确认删除',
			},
		}),
		execute: async () => ({ ok: true }),
	}));
	const executor = new BuiltinToolExecutor(registry, {
		app: {
			workspace: {
				getActiveFile: () => ({ path: 'notes/current.md' }),
			},
		},
		callTool: async () => null,
	} as never);

	const validationResult = await executor.execute({
		id: 'call-5',
		name: 'write_file',
		arguments: JSON.stringify({
			file_path: 'tmp/out.md',
			content: 'hello',
		}),
	}, [tool]);
	const permissionResult = await executor.execute({
		id: 'call-6',
		name: 'dangerous_delete',
		arguments: JSON.stringify({
			target_path: 'notes/out.md',
		}),
	}, [{
		name: 'dangerous_delete',
		description: '危险删除',
		inputSchema: {
			type: 'object',
			properties: {
				target_path: { type: 'string' },
			},
			required: ['target_path'],
		},
		source: 'builtin',
		sourceId: 'builtin',
	}], {
		requestConfirmation: async () => ({ decision: 'deny' }),
	});

	assert.equal(validationResult.status, 'failed');
	assert.equal(validationResult.errorContext?.kind, 'tool-validation');
	assert.match(validationResult.content, /业务规则要求写入 notes\/ 目录/);
	assert.equal(permissionResult.status, 'failed');
	assert.equal(permissionResult.errorContext?.kind, 'tool-permission');
	assert.match(permissionResult.content, /用户拒绝确认/);
});

test('BuiltinToolExecutor 会在 outputSchema 不匹配时返回 output-validation', async () => {
	const registry = createBuiltinRegistry();
	registry.register(buildBuiltinTool({
		name: 'write_file',
		description: '写入文件',
		inputSchema: z.object({
			file_path: z.string(),
		}),
		outputSchema: z.object({
			saved: z.boolean(),
		}),
		execute: async () => ({ saved: 'yes' }),
	}));
	const executor = new BuiltinToolExecutor(registry, {
		app: {
			workspace: {
				getActiveFile: () => ({ path: 'notes/current.md' }),
			},
		},
		callTool: async () => null,
	} as never);

	const result = await executor.execute({
		id: 'call-7',
		name: 'write_file',
		arguments: JSON.stringify({
			file_path: 'notes/out.md',
		}),
	}, [{
		name: 'write_file',
		description: '写入文件',
		inputSchema: {
			type: 'object',
			properties: {
				file_path: { type: 'string' },
			},
			required: ['file_path'],
		},
		source: 'builtin',
		sourceId: 'builtin',
	}]);

	assert.equal(result.status, 'failed');
	assert.equal(result.errorContext?.kind, 'output-validation');
	assert.match(result.content, /工具输出校验失败/);
});

test('McpToolExecutor 会在 runtimeArgCompletionV2 开启时注入默认参数', async () => {
	const tool = createMcpTool();
	const receivedArgs: Record<string, unknown>[] = [];
	const enabledExecutor = new McpToolExecutor(async (_serverId, _toolName, args) => {
		receivedArgs.push(args);
		return JSON.stringify(args);
	}, {
		enableRuntimeArgumentCompletion: true,
	});
	const disabledExecutor = new McpToolExecutor(async (_serverId, _toolName, args) => {
		receivedArgs.push(args);
		return JSON.stringify(args);
	}, {
		enableRuntimeArgumentCompletion: false,
	});

	await enabledExecutor.execute({
		id: 'call-1',
		name: 'list_directory',
		arguments: JSON.stringify({ directory_path: 'docs' }),
	}, [tool]);
	await disabledExecutor.execute({
		id: 'call-2',
		name: 'list_directory',
		arguments: JSON.stringify({ directoryPath: 'docs' }),
	}, [tool]);

	assert.equal(receivedArgs[0]?.view, 'flat');
	assert.equal(receivedArgs[1]?.directory_path, 'docs');
	assert.equal(receivedArgs[1]?.view, undefined);
});
