import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import { registerBuiltinTool } from './register-tool';
import { serializeMcpToolResult } from './tool-result';
import { BuiltinToolRegistry } from './tool-registry';

interface RegisteredToolCall {
	readonly name: string;
	readonly handler: (args: Record<string, unknown>) => Promise<unknown>;
}

function createServerStub() {
	const calls: RegisteredToolCall[] = [];
	return {
		server: {
			registerTool: (
				name: string,
				_options: Record<string, unknown>,
				handler: (args: Record<string, unknown>) => Promise<unknown>,
			) => {
				calls.push({ name, handler });
			},
		},
		calls,
	};
}

test('registerBuiltinTool 兼容旧 shape，并通过 buildBuiltinTool 补齐默认值', async () => {
	const { server, calls } = createServerStub();
	const registry = new BuiltinToolRegistry();

	registerBuiltinTool(
		server as never,
		registry,
		'legacy_tool',
		{
			title: 'Legacy Tool',
			description: 'legacy tool',
			inputSchema: z.object({
				value: z.string().optional(),
			}),
		},
		async (args: { value?: string }) => ({
			value: args.value ?? 'ok',
		}),
	);

	const registeredTool = registry.get('legacy_tool');
	assert.ok(registeredTool);
	assert.equal(registeredTool.isEnabled?.(), true);
	assert.equal(calls[0]?.name, 'legacy_tool');

	const result = await calls[0]!.handler({});
	assert.equal(
		serializeMcpToolResult(result as Parameters<typeof serializeMcpToolResult>[0]),
		'{\n  "value": "ok"\n}',
	);
});

test('registerBuiltinTool 新 shape 会保留 surface/runtimePolicy 邻近元数据', async () => {
	const { server, calls } = createServerStub();
	const registry = new BuiltinToolRegistry();

	registerBuiltinTool(
		server as never,
		registry,
		{
			name: 'adjacent_tool',
			title: 'Adjacent Tool',
			description: 'adjacent tool',
			inputSchema: z.object({
				query: z.string().optional(),
			}),
			surface: {
				family: 'builtin.test.adjacent',
				visibility: 'candidate-only',
				oneLinePurpose: '来自工具本体的 surface',
				capabilityTags: ['adjacent'],
			},
			runtimePolicy: {
				defaultArgs: {
					query: 'fallback',
				},
			},
			serializeResult: (result: { ok: boolean }) => ({
				structuredContent: result,
			}),
			execute: async () => ({ ok: true }),
		},
	);

	const toolInfo = registry.listTools('builtin').find((tool) => tool.name === 'adjacent_tool');
	assert.ok(toolInfo);
	assert.equal((toolInfo.surface as Record<string, unknown>)?.family, 'builtin.test.adjacent');
	assert.deepEqual(toolInfo.runtimePolicy?.defaultArgs, {
		query: 'fallback',
	});

	const result = await calls[0]!.handler({});
	assert.equal(
		serializeMcpToolResult(result as Parameters<typeof serializeMcpToolResult>[0]),
		'{\n  "ok": true\n}',
	);
});
