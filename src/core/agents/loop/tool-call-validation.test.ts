import assert from 'node:assert/strict';
import test from 'node:test';
import { executeToolCalls } from './openAILoopUtils';
import type { ToolCallResult, ToolDefinition, ToolExecutor } from './types';
import {
	buildToolArgumentParseErrorContext,
	buildToolArgumentValidationErrorContext,
	formatToolErrorContext,
} from './tool-call-validation';

const createTool = (): ToolDefinition => ({
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
	},
});

test('buildToolArgumentValidationErrorContext 会生成结构化 issue 与 repair hints', () => {
	const tool = createTool();
	const context = buildToolArgumentValidationErrorContext(tool, {
		response_format: 'yaml',
	}, {
		notes: ['已将 path 映射为 file_path'],
	});

	assert.equal(context.kind, 'argument-validation');
	assert.equal(context.issues.length, 2);
	assert.equal(context.issues[0]?.code, 'missing-required');
	assert.equal(context.issues[0]?.field, 'file_path');
	assert.equal(context.issues[1]?.code, 'invalid-enum');
	assert.ok(context.repairHints.some((hint) => hint.kind === 'provide-parameter'));
	assert.ok(context.repairHints.some((hint) => hint.kind === 'adjust-value'));
	assert.ok(context.notes?.includes('已将 path 映射为 file_path'));
	assert.ok(formatToolErrorContext(context).includes('修复建议='));
});

test('buildToolArgumentParseErrorContext 会保留原始参数预览', () => {
	const context = buildToolArgumentParseErrorContext(
		'read_file',
		'{"file_path":',
		new Error('Unexpected end of JSON input'),
	);

	assert.equal(context.kind, 'argument-parse');
	assert.ok(context.summary.includes('JSON 解析失败'));
	assert.equal(context.argumentsPreview, '{"file_path":');
	assert.ok(formatToolErrorContext(context).includes('原始参数='));
});

test('executeToolCalls 会透传 failed 状态与 errorContext', async () => {
	const errorContext = buildToolArgumentValidationErrorContext(createTool(), {
		response_format: 'yaml',
	});
	const executor: ToolExecutor = {
		async execute() {
			return {
				toolCallId: 'tool-1',
				name: 'read_file',
				content: formatToolErrorContext(errorContext),
				status: 'failed',
				errorContext,
			} satisfies ToolCallResult;
		},
	};
	const records: Array<{
		status: 'pending' | 'completed' | 'failed';
		errorContext?: ToolCallResult['errorContext'];
	}> = [];

	const messages = await executeToolCalls([
		{
			id: 'tool-1',
			type: 'function',
			function: {
				name: 'read_file',
				arguments: JSON.stringify({ response_format: 'yaml' }),
			},
		},
	], [createTool()], executor, undefined, (record) => {
		records.push({
			status: record.status,
			errorContext: record.errorContext,
		});
	});

	assert.equal(messages[0]?.content, formatToolErrorContext(errorContext));
	assert.equal(records[0]?.status, 'failed');
	assert.equal(records[0]?.errorContext?.kind, 'argument-validation');
	assert.equal(records[0]?.errorContext?.issues[0]?.code, 'missing-required');
});