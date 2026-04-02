import assert from 'node:assert/strict';
import test from 'node:test';
import {
	createDelegateSubAgentToolDefinition,
	createDiscoverSubAgentsToolDefinition,
	subAgentToToolDefinition,
} from 'src/tools/sub-agents/subAgentTools';
import type { SubAgentDefinition } from 'src/tools/sub-agents/types';
import {
	attachToolSurfaceMetadata,
	createSubAgentDiscoveryTool,
} from './chat-tool-discovery-catalog';
import {
	resolveSurfaceBlueprintBase,
	SURFACE_BLUEPRINT_ARCHITECTURE_NOTE,
} from './chat-tool-discovery-blueprints';
import {
	BUILTIN_TOOL_SURFACE_OVERRIDES,
} from './chat-tool-discovery-blueprint-presets';

const MINIMAL_SCHEMA = {
	type: 'object',
	properties: {},
	additionalProperties: false,
} as const;

test('Step 14 已迁移 builtin tool 默认回到邻近 surface 作为事实来源', () => {
	assert.equal('write_plan' in BUILTIN_TOOL_SURFACE_OVERRIDES, false);
	assert.match(SURFACE_BLUEPRINT_ARCHITECTURE_NOTE, /邻近 surface/);

	const tool = attachToolSurfaceMetadata({
		name: 'write_plan',
		description: 'legacy fallback should not win',
		inputSchema: MINIMAL_SCHEMA,
		source: 'builtin',
		sourceId: 'builtin',
		surface: {
			family: 'workflow.plan',
			source: 'workflow',
			visibility: 'workflow-only',
			argumentComplexity: 'medium',
			riskLevel: 'mutating',
			oneLinePurpose: '维护当前会话的任务计划状态。',
			capabilityTags: ['plan'],
			requiredArgsSummary: ['tasks'],
		},
	});

	assert.equal(tool.identity?.familyId, 'workflow.plan');
	assert.equal(tool.identity?.source, 'workflow');
	assert.equal(tool.discovery?.discoveryVisibility, 'workflow-only');
	assert.equal(tool.discovery?.oneLinePurpose, '维护当前会话的任务计划状态。');
});

test('Step 14 legacy bridge 仍为未迁 wrapper 入口提供兼容 surface', () => {
	const tool = attachToolSurfaceMetadata({
		name: 'list_directory',
		description: '列出目录内容',
		inputSchema: MINIMAL_SCHEMA,
		source: 'builtin',
		sourceId: 'builtin',
	});

	assert.equal(tool.identity?.familyId, 'builtin.vault.discovery');
	assert.equal(tool.compatibility?.deprecationStatus, 'legacy');
	assert.match(tool.discovery?.oneLinePurpose ?? '', /list_directory_flat/);
});

test('Step 14 sub-agents 继续保持独立 ToolDefinition 体系', () => {
	const agentDefinition: SubAgentDefinition = {
		metadata: {
			name: 'reviewer',
			description: '审查当前改动并标记风险。',
		},
		agentFilePath: 'System/AI Data/sub-agents/reviewer.md',
		systemPrompt: 'You are reviewer.',
	};

	const dynamicTool = subAgentToToolDefinition(agentDefinition);
	const discoverTool = createDiscoverSubAgentsToolDefinition();
	const delegateTool = createDelegateSubAgentToolDefinition();

	assert.equal(dynamicTool.source, 'sub_agent');
	assert.equal(discoverTool.source, 'custom');
	assert.equal(delegateTool.source, 'workflow');

	const surfacedDiscover = createSubAgentDiscoveryTool(discoverTool);
	const surfacedDelegate = createSubAgentDiscoveryTool(delegateTool);
	assert.equal(surfacedDiscover.identity?.source, 'custom');
	assert.equal(surfacedDelegate.identity?.source, 'workflow');
	assert.equal(
		resolveSurfaceBlueprintBase(discoverTool).familyId,
		'builtin.delegate.discovery',
	);
});
