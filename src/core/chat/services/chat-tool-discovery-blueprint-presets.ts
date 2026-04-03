import {
	DELEGATE_SUB_AGENT_TOOL_NAME,
	DISCOVER_SUB_AGENTS_TOOL_NAME,
} from 'src/tools/sub-agents/types';
import type {
	ToolCompatibilityMetadata,
	ToolDiscoveryMetadata,
	ToolIdentity,
	ToolRuntimePolicy,
} from 'src/types/tool';

type SurfaceSource = ToolIdentity['source'];

export interface SurfaceBlueprint {
	readonly familyId: string;
	readonly source: SurfaceSource;
	readonly visibility: ToolDiscoveryMetadata['discoveryVisibility'];
	readonly argumentComplexity: ToolDiscoveryMetadata['argumentComplexity'];
	readonly riskLevel: ToolDiscoveryMetadata['riskLevel'];
	readonly oneLinePurpose?: string;
	readonly whenToUse?: readonly string[];
	readonly whenNotToUse?: readonly string[];
	readonly requiredArgsSummary?: readonly string[];
	readonly capabilityTags?: readonly string[];
	readonly runtimePolicy?: Partial<ToolRuntimePolicy>;
	readonly compatibility?: Partial<ToolCompatibilityMetadata>;
}

export const BUILTIN_TOOL_SURFACE_OVERRIDES: Record<string, SurfaceBlueprint> = {};

export const BUILTIN_TOOL_LEGACY_BRIDGES: Record<string, SurfaceBlueprint> = {};

export const NON_BUILTIN_SURFACE_OVERRIDES: Record<string, SurfaceBlueprint> = {
	[DISCOVER_SUB_AGENTS_TOOL_NAME]: {
		familyId: 'builtin.delegate.discovery',
		source: 'custom',
		visibility: 'candidate-only',
		argumentComplexity: 'low',
		riskLevel: 'read-only',
		oneLinePurpose: '列出当前可用的 Sub-Agent。',
		capabilityTags: ['sub-agent', 'delegate', 'discover agents', '子代理', '委托代理'],
		requiredArgsSummary: ['query'],
	},
	[DELEGATE_SUB_AGENT_TOOL_NAME]: {
		familyId: 'workflow.delegate',
		source: 'workflow',
		visibility: 'workflow-only',
		argumentComplexity: 'high',
		riskLevel: 'mutating',
		oneLinePurpose: '把任务委托给指定的 Sub-Agent。',
		capabilityTags: ['sub-agent', 'delegate', '委托', '子代理'],
		requiredArgsSummary: ['agent', 'task'],
	},
};
