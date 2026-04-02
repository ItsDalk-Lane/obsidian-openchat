import assert from 'node:assert/strict';
import test from 'node:test';
import { BuiltinToolExecutor } from 'src/tools/runtime/BuiltinToolExecutor';
import { McpToolExecutor } from 'src/services/mcp/McpToolExecutor';
import type { ToolDefinition } from './types';

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

test('BuiltinToolExecutor 会根据 runtimeArgCompletionV2 开关决定是否补全默认参数', async () => {
	const tool = createBuiltinTool();
	const calledArgs: Record<string, unknown>[] = [];
	const context = {
		app: {
			workspace: {
				getActiveFile: () => ({ path: 'notes/current.md' }),
			},
		},
	} as never;
	const enabledExecutor = new BuiltinToolExecutor(
		{} as never,
		context,
		async (_name, args) => {
			calledArgs.push(args);
			return args;
		},
		{ enableRuntimeArgumentCompletion: true },
	);
	const disabledExecutor = new BuiltinToolExecutor(
		{} as never,
		context,
		async (_name, args) => {
			calledArgs.push(args);
			return args;
		},
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
	const context = {
		app: {
			workspace: {
				getActiveFile: () => ({ path: 'notes/current.md' }),
			},
		},
	} as never;
	const executor = new BuiltinToolExecutor(
		{} as never,
		context,
		async (_name, args) => {
			calledArgs.push(args);
			return args;
		},
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