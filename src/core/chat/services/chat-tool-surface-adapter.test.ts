import assert from 'node:assert/strict';
import test from 'node:test';
import type { ToolDefinition } from 'src/types/tool';
import { resolveToolSurfaceSettings } from './chat-tool-feature-flags';
import {
	attachToolSurfaceMetadata,
	buildDiscoveryCatalog,
	compileExecutableToolDefinition,
} from './chat-tool-discovery-catalog';
import { createProviderToolSurfaceAdapter } from './chat-tool-surface-adapter';

const createTool = (name: string): ToolDefinition => {
	return compileExecutableToolDefinition(attachToolSurfaceMetadata({
		name,
		description: `${name} description`,
		inputSchema: {
			type: 'object',
			properties: {
				value: { type: 'string' },
			},
			required: ['value'],
		},
		source: 'builtin',
		sourceId: 'builtin',
	}));
};

const createScope = () => ({
	mode: 'atomic-tools' as const,
	candidateToolNames: ['read_file'],
	candidateServerIds: [],
	reasons: ['test'],
	query: 'read file',
});

test('current-loop adapter 返回可复用的 discovery 与 executable payload 契约', () => {
	const tool = createTool('read_file');
	const scope = createScope();
	const catalog = buildDiscoveryCatalog({
		tools: [tool],
		serverEntries: [],
	});
	const adapter = createProviderToolSurfaceAdapter(resolveToolSurfaceSettings({
		toolSurface: { nativeDeferredAdapter: false },
	}));

	const discoveryPayload = adapter.buildDiscoveryPayload({ catalog, scope });
	const executablePayload = adapter.buildExecutablePayload({
		scope,
		toolRuntime: {
			requestTools: [tool],
			getTools: async () => [tool],
			maxToolCallLoops: 10,
		},
	});

	assert.equal(discoveryPayload.surfaceMode, 'current-loop');
	assert.equal(discoveryPayload.capabilities.supportsNativeDeferredLoading, false);
	assert.equal(discoveryPayload.capabilities.usesCurrentLoopToolsApi, true);
	assert.equal(executablePayload.surfaceMode, 'current-loop');
	assert.deepEqual(executablePayload.toolSet.tools.map((item) => item.name), ['read_file']);
	const compiledToolSet = adapter.buildExecutableToolSet({
		scope,
		toolRuntime: {
			requestTools: [tool],
			getTools: async () => [tool],
			maxToolCallLoops: 10,
		},
	});
	assert.deepEqual(compiledToolSet.tools.map((item) => item.name), ['read_file']);
	assert.deepEqual(compiledToolSet.scope, executablePayload.toolSet.scope);
	assert.equal(compiledToolSet.maxToolCallLoops, executablePayload.toolSet.maxToolCallLoops);
});

test('native adapter 保持同一 payload 契约但切换 capability matrix', () => {
	const tool = createTool('read_file');
	const scope = createScope();
	const catalog = buildDiscoveryCatalog({
		tools: [tool],
		serverEntries: [],
	});
	const adapter = createProviderToolSurfaceAdapter(resolveToolSurfaceSettings({
		toolSurface: { nativeDeferredAdapter: true },
	}));

	const discoveryPayload = adapter.buildDiscoveryPayload({ catalog, scope });
	const executablePayload = adapter.buildExecutablePayload({
		scope,
		toolRuntime: {
			requestTools: [tool],
		},
	});

	assert.equal(discoveryPayload.surfaceMode, 'native-deferred');
	assert.equal(discoveryPayload.capabilities.supportsNativeDeferredLoading, true);
	assert.equal(discoveryPayload.capabilities.usesCurrentLoopToolsApi, false);
	assert.equal(executablePayload.surfaceMode, 'native-deferred');
	assert.deepEqual(executablePayload.toolSet.scope, scope);
	assert.equal(adapter.supportsNativeDeferredLoading(), true);
});