import assert from 'node:assert/strict';
import test from 'node:test';
import { completeToolArguments } from './tool-call-argument-completion';
import type { ToolDefinition } from './types';

function createToolDefinition(overrides: Partial<ToolDefinition> = {}): ToolDefinition {
	return {
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
		...overrides,
	};
}

test('completeToolArguments 会补全隐藏默认参数与活动文件路径', () => {
	const validationSchema = {
		type: 'object',
		properties: {
			file_path: { type: 'string' },
			response_format: { type: 'string', enum: ['json', 'text'] },
		},
		required: ['file_path'],
	};
	const tool = createToolDefinition({
		inputSchema: {
			type: 'object',
			properties: {
				file_path: { type: 'string' },
			},
			required: ['file_path'],
		},
		runtimePolicy: {
			validationSchema,
			defaultArgs: { response_format: 'json' },
			contextDefaults: [{ field: 'file_path', source: 'active-file-path' }],
		},
	});

	const result = completeToolArguments(tool, {}, {
		activeFilePath: 'notes/current.md',
	});

	assert.deepEqual(result.errors, []);
	assert.equal(result.args.file_path, 'notes/current.md');
	assert.equal(result.args.response_format, 'json');
	assert.ok(result.notes.some((note) => note.includes('活动文件')));
	assert.ok(result.notes.some((note) => note.includes('response_format')));
});

test('completeToolArguments 会复用 builtin hint 做别名映射与类型转换', () => {
	const schema = {
		type: 'object',
		properties: {
			pattern: { type: 'string' },
			file_types: { type: 'array', items: { type: 'string' } },
			max_results: { type: 'integer' },
		},
		required: ['pattern'],
	};
	const tool = createToolDefinition({
		name: 'search_content',
		description: '搜索内容',
		inputSchema: schema,
		runtimePolicy: {
			validationSchema: schema,
		},
	});

	const result = completeToolArguments(tool, {
		pattern: 'TODO',
		fileType: 'md,txt',
		maxResults: '5',
	});

	assert.deepEqual(result.errors, []);
	assert.deepEqual(result.args.file_types, ['md', 'txt']);
	assert.equal(result.args.max_results, 5);
	assert.ok(result.notes.some((note) => note.includes('fileType')));
	assert.ok(result.notes.some((note) => note.includes('max_results')));
});

test('completeToolArguments 在关闭 runtime completion 时保留原始参数并跳过默认补全', () => {
	const validationSchema = {
		type: 'object',
		properties: {
			file_path: { type: 'string' },
			response_format: { type: 'string', enum: ['json', 'text'] },
		},
		required: ['file_path'],
	};
	const tool = createToolDefinition({
		inputSchema: {
			type: 'object',
			properties: {
				file_path: { type: 'string' },
			},
			required: ['file_path'],
		},
		runtimePolicy: {
			validationSchema,
			defaultArgs: { response_format: 'json' },
			contextDefaults: [{ field: 'file_path', source: 'active-file-path' }],
		},
	});

	const result = completeToolArguments(tool, {
		filePath: 'notes/current.md',
	}, {
		activeFilePath: 'notes/current.md',
	}, {
		enableRuntimeCompletion: false,
	});

	assert.notEqual(result.args.file_path, 'notes/current.md');
	assert.equal(result.args.response_format, undefined);
	assert.equal(result.args.filePath, 'notes/current.md');
	assert.ok(result.errors.some((error) => error.includes('file_path')));
	assert.deepEqual(result.notes, []);
});
