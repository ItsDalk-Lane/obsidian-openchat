import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import { BuiltinToolRegistry } from './tool-registry';
import { buildBuiltinTool } from './build-tool';
import {
	normalizeBuiltinToolExecutionResult,
	serializeMcpToolResult,
} from './tool-result';
import type { BuiltinTool, BuiltinToolExecutionContext } from './types';

function createContext(): BuiltinToolExecutionContext {
	return {
		app: {} as never,
		callTool: async () => null,
	};
}

test('buildBuiltinTool 会补齐 fail-closed 默认值', async () => {
	const tool = buildBuiltinTool({
		name: 'test_tool',
		description: '测试工具',
		inputSchema: z.object({
			value: z.string().optional(),
		}),
		execute: async (args: { value?: string }) => args.value ?? 'ok',
	});
	const context = createContext();

	assert.equal(tool.isEnabled?.(), true);
	assert.equal(tool.isReadOnly?.({ value: 'a' }), false);
	assert.equal(tool.isDestructive?.({ value: 'a' }), false);
	assert.equal(tool.isConcurrencySafe?.({ value: 'a' }), false);
	assert.equal(tool.interruptBehavior?.({ value: 'a' }), 'block');
	assert.deepEqual(await tool.validateInput?.({ value: 'a' }, context), { ok: true });
	assert.deepEqual(await tool.checkPermissions?.({ value: 'a' }, context), {
		behavior: 'allow',
	});
	assert.equal(tool.getToolUseSummary?.({ value: 'a' }), null);
	assert.equal(tool.getActivityDescription?.({ value: 'a' }), null);
});

test('buildBuiltinTool 会保留覆盖项，并允许结果走自定义序列化', () => {
	const tool = buildBuiltinTool({
		name: 'custom_tool',
		description: '自定义工具',
		inputSchema: z.object({
			query: z.string(),
		}),
		isReadOnly: () => true,
		getToolUseSummary: (args: Partial<{ query: string }>) => args.query ?? null,
		serializeResult: (result: { ok: boolean }) => ({
			structuredContent: {
				status: result.ok ? 'ok' : 'failed',
			},
		}),
		execute: () => ({ ok: true }),
	});
	const normalized = normalizeBuiltinToolExecutionResult(
		tool,
		{ ok: true },
		createContext(),
	);

	assert.equal(tool.isReadOnly?.({ query: 'hello' }), true);
	assert.equal(tool.getToolUseSummary?.({ query: 'hello' }), 'hello');
	assert.equal(
		serializeMcpToolResult(normalized),
		'{\n  "status": "ok"\n}',
	);
});

test('旧 shape 的 BuiltinTool 仍可直接注册', () => {
	const registry = new BuiltinToolRegistry();
	const legacyTool: BuiltinTool<{ file_path: string }> = {
		name: 'legacy_read_file',
		description: 'legacy',
		inputSchema: z.object({
			file_path: z.string(),
		}),
		execute: (args) => args.file_path,
	};

	registry.register(legacyTool);

	assert.deepEqual(registry.listToolNames(), ['legacy_read_file']);
});
