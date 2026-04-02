import {
	SUB_AGENT_TOOL_PREFIX,
} from 'src/tools/sub-agents/types';
import {
	summarizeDescriptionForUiFallback,
} from 'src/services/mcp/toolDescriptionSummary';
import type { ToolDefinition } from 'src/types/tool';
import {
	BUILTIN_TOOL_LEGACY_BRIDGES,
	BUILTIN_TOOL_SURFACE_OVERRIDES,
	NON_BUILTIN_SURFACE_OVERRIDES,
	type SurfaceBlueprint,
} from './chat-tool-discovery-blueprint-presets';

export type { SurfaceBlueprint } from './chat-tool-discovery-blueprint-presets';

export const createBuiltinFallbackBlueprint = (
	tool: Pick<ToolDefinition, 'name' | 'description' | 'sourceId'>,
): SurfaceBlueprint => {
	void tool;
	return {
		familyId: 'builtin.misc',
		source: 'builtin',
		visibility: 'default',
		argumentComplexity: 'medium',
		riskLevel: 'read-only',
		oneLinePurpose: summarizeDescriptionForUiFallback(tool.description),
		capabilityTags: [],
	};
};

export const createFallbackBlueprint = (
	tool: Pick<ToolDefinition, 'name' | 'description' | 'source' | 'sourceId'>,
): SurfaceBlueprint => {
	if (tool.name.startsWith(SUB_AGENT_TOOL_PREFIX)) {
		return {
			familyId: 'workflow.delegate',
			source: 'workflow',
			visibility: 'hidden',
			argumentComplexity: 'high',
			riskLevel: 'mutating',
			oneLinePurpose: '把任务委托给子代理处理。',
			capabilityTags: ['sub-agent', 'delegate', '委托', '子代理'],
			compatibility: {
				deprecationStatus: 'legacy',
			},
		};
	}

	if (tool.source === 'mcp') {
		const nameTokens = tool.name
			.toLowerCase()
			.split(/[^a-z0-9]+/u)
			.filter((token) => token.length > 1);
		return {
			familyId: `mcp.${tool.sourceId}`,
			source: 'mcp',
			visibility: 'default',
			argumentComplexity: 'medium',
			riskLevel: 'read-only',
			oneLinePurpose: summarizeDescriptionForUiFallback(tool.description),
			capabilityTags: [tool.sourceId.toLowerCase(), ...nameTokens],
		};
	}

	return {
		familyId: 'builtin.misc',
		source: 'custom',
		visibility: 'default',
		argumentComplexity: 'medium',
		riskLevel: 'read-only',
		oneLinePurpose: summarizeDescriptionForUiFallback(tool.description),
		capabilityTags: [],
	};
};

export const resolveSurfaceBlueprintBase = (
	tool: Pick<ToolDefinition, 'name' | 'description' | 'source' | 'sourceId'>,
	hasAdjacentSurface = false,
): SurfaceBlueprint => {
	if (tool.source === 'builtin') {
		if (hasAdjacentSurface) {
			return createBuiltinFallbackBlueprint(tool);
		}
		return BUILTIN_TOOL_LEGACY_BRIDGES[tool.name]
			?? BUILTIN_TOOL_SURFACE_OVERRIDES[tool.name]
			?? createBuiltinFallbackBlueprint(tool);
	}

	return NON_BUILTIN_SURFACE_OVERRIDES[tool.name]
		?? createFallbackBlueprint(tool);
};

export const SURFACE_BLUEPRINT_ARCHITECTURE_NOTE = [
	'已迁移的 BuiltinTool 默认以工具邻近 surface/runtimePolicy 为事实来源。',
	'本文件只保留三类内容：未迁移内置工具 override、legacy bridge，以及非 BuiltinTool 例外。',
].join(' ');
