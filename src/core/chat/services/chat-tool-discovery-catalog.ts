import {
	DELEGATE_SUB_AGENT_TOOL_NAME,
	SUB_AGENT_TOOL_PREFIX,
	type SubAgentDefinition,
} from 'src/tools/sub-agents/types';
import type { McpToolDefinition } from 'src/domains/mcp/types';
import {
	summarizeDescriptionForUiFallback,
} from 'src/services/mcp/toolDescriptionSummary';
import {
	BUILTIN_SERVER_ID,
} from 'src/tools/runtime/constants';
import type { BuiltinToolInfo } from 'src/tools/runtime/tool-registry';
import type {
	ToolCompatibilityMetadata,
	ToolDefinition,
	ToolDiscoveryMetadata,
	ToolIdentity,
	ToolRuntimePolicy,
} from 'src/types/tool';
import type {
	DiscoveryCatalog,
	DiscoveryEntry,
	DiscoveryServerEntry,
} from './chat-tool-selection-types';
import {
	resolveSurfaceBlueprintBase,
	type SurfaceBlueprint,
} from './chat-tool-discovery-blueprints';
import type {
	ResolvedToolSurfaceSettings,
} from './chat-tool-feature-flags';
import {
	getBuiltinToolSurfaceOverride,
	getBuiltinToolVisibilityOverride,
} from './chat-tool-feature-flags';

type SurfaceSource = ToolIdentity['source'];
type AdjacentSurfaceMetadata = Partial<SurfaceBlueprint> & {
	readonly family?: string;
	readonly familyId?: string;
};

const mergeSurfaceBlueprint = (
	baseBlueprint: SurfaceBlueprint,
	override: ReturnType<typeof getBuiltinToolSurfaceOverride> | undefined,
): SurfaceBlueprint => {
	if (!override) {
		return baseBlueprint;
	}

	return {
		...baseBlueprint,
		...(override.visibility ? { visibility: override.visibility } : {}),
		...(override.oneLinePurpose ? { oneLinePurpose: override.oneLinePurpose } : {}),
		...(override.whenToUse ? { whenToUse: override.whenToUse } : {}),
		...(override.whenNotToUse ? { whenNotToUse: override.whenNotToUse } : {}),
		...(override.requiredArgsSummary
			? { requiredArgsSummary: override.requiredArgsSummary }
			: {}),
		...(override.capabilityTags ? { capabilityTags: override.capabilityTags } : {}),
		...(override.argumentComplexity
			? { argumentComplexity: override.argumentComplexity }
			: {}),
		runtimePolicy: {
			...(baseBlueprint.runtimePolicy ?? {}),
			...(override.runtimePolicy ?? {}),
		},
	};
};

const normalizeStableId = (value: string): string => {
	return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-');
};

const isSurfaceSource = (value: unknown): value is SurfaceSource => {
	return value === 'builtin'
		|| value === 'mcp'
		|| value === 'workflow'
		|| value === 'escape-hatch'
		|| value === 'custom';
};

const isVisibility = (
	value: unknown,
): value is ToolDiscoveryMetadata['discoveryVisibility'] => {
	return value === 'default'
		|| value === 'candidate-only'
		|| value === 'workflow-only'
		|| value === 'hidden';
};

const isArgumentComplexity = (
	value: unknown,
): value is ToolDiscoveryMetadata['argumentComplexity'] => {
	return value === 'low' || value === 'medium' || value === 'high';
};

const isRiskLevel = (value: unknown): value is ToolDiscoveryMetadata['riskLevel'] => {
	return value === 'read-only'
		|| value === 'mutating'
		|| value === 'destructive'
		|| value === 'escape-hatch';
};

const readStringArray = (value: unknown): readonly string[] | undefined => {
	return Array.isArray(value) && value.every((item) => typeof item === 'string')
		? value
		: undefined;
};

const readRecord = (value: unknown): Record<string, unknown> | undefined => {
	return value && typeof value === 'object' && !Array.isArray(value)
		? value as Record<string, unknown>
		: undefined;
};

const readAdjacentSurfaceMetadata = (
	surface: unknown,
): AdjacentSurfaceMetadata | undefined => {
	const record = readRecord(surface);
	if (!record) {
		return undefined;
	}

	const whenToUse = readStringArray(record.whenToUse);
	const whenNotToUse = readStringArray(record.whenNotToUse);
	const requiredArgsSummary = readStringArray(record.requiredArgsSummary);
	const capabilityTags = readStringArray(record.capabilityTags);

	return {
		...(typeof record.family === 'string' ? { family: record.family } : {}),
		...(typeof record.familyId === 'string' ? { familyId: record.familyId } : {}),
		...(isSurfaceSource(record.source) ? { source: record.source } : {}),
		...(isVisibility(record.visibility) ? { visibility: record.visibility } : {}),
		...(isArgumentComplexity(record.argumentComplexity)
			? { argumentComplexity: record.argumentComplexity }
			: {}),
		...(isRiskLevel(record.riskLevel) ? { riskLevel: record.riskLevel } : {}),
		...(typeof record.oneLinePurpose === 'string'
			? { oneLinePurpose: record.oneLinePurpose }
			: {}),
		...(whenToUse ? { whenToUse } : {}),
		...(whenNotToUse ? { whenNotToUse } : {}),
		...(requiredArgsSummary ? { requiredArgsSummary } : {}),
		...(capabilityTags ? { capabilityTags } : {}),
		...(readRecord(record.runtimePolicy)
			? { runtimePolicy: record.runtimePolicy as Partial<ToolRuntimePolicy> }
			: {}),
		...(readRecord(record.compatibility)
			? { compatibility: record.compatibility as Partial<ToolCompatibilityMetadata> }
			: {}),
	};
};

const mergeAdjacentSurfaceBlueprint = (
	baseBlueprint: SurfaceBlueprint,
	surface: unknown,
): SurfaceBlueprint => {
	const metadata = readAdjacentSurfaceMetadata(surface);
	if (!metadata) {
		return baseBlueprint;
	}

	return {
		...baseBlueprint,
		...(metadata.family || metadata.familyId
			? { familyId: metadata.familyId ?? metadata.family! }
			: {}),
		...(metadata.source ? { source: metadata.source } : {}),
		...(metadata.visibility ? { visibility: metadata.visibility } : {}),
		...(metadata.argumentComplexity
			? { argumentComplexity: metadata.argumentComplexity }
			: {}),
		...(metadata.riskLevel ? { riskLevel: metadata.riskLevel } : {}),
		...(metadata.oneLinePurpose ? { oneLinePurpose: metadata.oneLinePurpose } : {}),
		...(metadata.whenToUse ? { whenToUse: metadata.whenToUse } : {}),
		...(metadata.whenNotToUse ? { whenNotToUse: metadata.whenNotToUse } : {}),
		...(metadata.requiredArgsSummary
			? { requiredArgsSummary: metadata.requiredArgsSummary }
			: {}),
		...(metadata.capabilityTags ? { capabilityTags: metadata.capabilityTags } : {}),
		runtimePolicy: {
			...(baseBlueprint.runtimePolicy ?? {}),
			...(metadata.runtimePolicy ?? {}),
		},
		compatibility: {
			...(baseBlueprint.compatibility ?? {}),
			...(metadata.compatibility ?? {}),
		},
	};
};

const createDiscoveryMetadata = (
	tool: Pick<ToolDefinition, 'name' | 'title' | 'description' | 'sourceId'>,
	blueprint: SurfaceBlueprint,
	serverHint?: string,
): ToolDiscoveryMetadata => {
	return {
		displayName: tool.title ?? tool.name,
		oneLinePurpose: blueprint.oneLinePurpose ?? summarizeDescriptionForUiFallback(tool.description),
		whenToUse: blueprint.whenToUse ?? [],
		whenNotToUse: blueprint.whenNotToUse ?? [],
		requiredArgsSummary: blueprint.requiredArgsSummary ?? [],
		riskLevel: blueprint.riskLevel,
		argumentComplexity: blueprint.argumentComplexity,
		discoveryVisibility: blueprint.visibility,
		capabilityTags: blueprint.capabilityTags ?? [],
		serverHint,
	};
};

const createIdentity = (
	tool: Pick<ToolDefinition, 'name' | 'sourceId'>,
	blueprint: SurfaceBlueprint,
): ToolIdentity => {
	return {
		stableId: normalizeStableId(`${blueprint.familyId}.${tool.name}`),
		familyId: blueprint.familyId,
		source: blueprint.source,
		sourceId: tool.sourceId,
		providerCallName: tool.name,
	};
};

const createCompatibilityMetadata = (
	tool: Pick<ToolDefinition, 'name' | 'sourceId'>,
	blueprint: SurfaceBlueprint,
): ToolCompatibilityMetadata => {
	return {
		version: 1,
		legacyCallNames: [tool.name, ...(blueprint.compatibility?.legacyCallNames ?? [])],
		legacyServerIds: [tool.sourceId, ...(blueprint.compatibility?.legacyServerIds ?? [])],
		nativeNamespaceHint: blueprint.familyId,
		nativeToolNameHint: tool.name,
		supportsDeferredSchema: true,
		supportsToolSearch: blueprint.visibility !== 'workflow-only',
		deprecationStatus: blueprint.compatibility?.deprecationStatus ?? 'active',
	};
};

const omitSchemaFields = (
	schema: Record<string, unknown>,
	hiddenFields: readonly string[],
): Record<string, unknown> => {
	if (hiddenFields.length === 0) {
		return schema;
	}

	const properties =
		typeof schema.properties === 'object' && schema.properties !== null
			? { ...(schema.properties as Record<string, unknown>) }
			: undefined;
	if (!properties) {
		return schema;
	}

	for (const field of hiddenFields) {
		delete properties[field];
	}

	const required = Array.isArray(schema.required)
		? schema.required.filter((field) => typeof field === 'string' && !hiddenFields.includes(field))
		: undefined;

	return {
		...schema,
		properties,
		...(required ? { required } : {}),
	};
};

const buildExecutableDescription = (tool: ToolDefinition): string => {
	const discovery = tool.discovery;
	if (!discovery) {
		return tool.description;
	}

	const lines = [discovery.oneLinePurpose];
	if (discovery.whenToUse && discovery.whenToUse.length > 0) {
		lines.push(`优先使用: ${discovery.whenToUse.join('；')}`);
	}
	if (discovery.whenNotToUse && discovery.whenNotToUse.length > 0) {
		lines.push(`避免用于: ${discovery.whenNotToUse.join('；')}`);
	}
	if (discovery.requiredArgsSummary && discovery.requiredArgsSummary.length > 0) {
		lines.push(`关键参数: ${discovery.requiredArgsSummary.join('，')}`);
	}
	const defaultArgNames = Object.keys(tool.runtimePolicy?.defaultArgs ?? {});
	if (defaultArgNames.length > 0) {
		lines.push(`系统补全: ${defaultArgNames.join('，')}`);
	}
	return lines.join('\n');
};

const toDiscoveryEntry = (tool: ToolDefinition): DiscoveryEntry | null => {
	if (!tool.identity || !tool.discovery) {
		return null;
	}

	return {
		stableId: tool.identity.stableId,
		toolName: tool.name,
		familyId: tool.identity.familyId,
		displayName: tool.discovery.displayName,
		oneLinePurpose: tool.discovery.oneLinePurpose,
		visibility: tool.discovery.discoveryVisibility,
		capabilityTags: [...tool.discovery.capabilityTags],
		source: tool.identity.source,
		sourceId: tool.sourceId,
		riskLevel: tool.discovery.riskLevel,
		argumentComplexity: tool.discovery.argumentComplexity,
		requiredArgsSummary: [...(tool.discovery.requiredArgsSummary ?? [])],
		whenToUse: [...(tool.discovery.whenToUse ?? [])],
		whenNotToUse: [...(tool.discovery.whenNotToUse ?? [])],
	};
};

export const attachToolSurfaceMetadata = (
	tool: ToolDefinition & {
		readonly surface?: unknown;
	},
	serverHint?: string,
	options?: {
		readonly surfaceFlags?: ResolvedToolSurfaceSettings;
	},
): ToolDefinition => {
	const hasAdjacentSurface = tool.source === 'builtin'
		&& !!readAdjacentSurfaceMetadata(tool.surface);
	const baseBlueprint = resolveSurfaceBlueprintBase(tool, hasAdjacentSurface);
	const adjacentBlueprint = hasAdjacentSurface
		? mergeAdjacentSurfaceBlueprint(baseBlueprint, tool.surface)
		: baseBlueprint;
	const surfaceOverride = tool.source === 'builtin' && options?.surfaceFlags
		? getBuiltinToolSurfaceOverride(tool.name, options.surfaceFlags)
		: undefined;
	const visibilityOverride = tool.source === 'builtin' && options?.surfaceFlags
		? getBuiltinToolVisibilityOverride(tool.name, options.surfaceFlags)
		: undefined;
	const blueprintWithSurfaceOverride = mergeSurfaceBlueprint(
		adjacentBlueprint,
		surfaceOverride,
	);
	const blueprint: SurfaceBlueprint = visibilityOverride
		? {
			...blueprintWithSurfaceOverride,
			visibility: visibilityOverride,
		}
		: blueprintWithSurfaceOverride;
	const identity = createIdentity(tool, blueprint);
	const discovery = createDiscoveryMetadata(tool, blueprint, serverHint);
	const runtimePolicy: ToolRuntimePolicy = {
		...(blueprint.runtimePolicy ?? {}),
		...(tool.runtimePolicy ?? {}),
		validationSchema: tool.runtimePolicy?.validationSchema ?? tool.inputSchema,
	};

	return {
		...tool,
		identity,
		discovery,
		runtimePolicy,
		compatibility: createCompatibilityMetadata(tool, blueprint),
	};
};

export const compileExecutableToolDefinition = (
	tool: ToolDefinition,
): ToolDefinition => {
	const runtimePolicy: ToolRuntimePolicy = {
		...(tool.runtimePolicy ?? {}),
		validationSchema: tool.runtimePolicy?.validationSchema ?? tool.inputSchema,
	};
	const inputSchema = omitSchemaFields(
		tool.inputSchema,
		runtimePolicy.hiddenSchemaFields ?? [],
	);

	return {
		...tool,
		description: buildExecutableDescription(tool),
		inputSchema,
		runtimePolicy,
	};
};

export const createBuiltinToolDefinition = (
	builtinTool: BuiltinToolInfo,
	options?: {
		readonly surfaceFlags?: ResolvedToolSurfaceSettings;
	},
): ToolDefinition => {
	return attachToolSurfaceMetadata({
		name: builtinTool.name,
		title: builtinTool.title,
		description: builtinTool.description,
		inputSchema: builtinTool.inputSchema,
		outputSchema: builtinTool.outputSchema,
		annotations: builtinTool.annotations,
		surface: builtinTool.surface,
		source: 'builtin',
		sourceId: BUILTIN_SERVER_ID,
		runtimePolicy: builtinTool.runtimePolicy,
	}, undefined, options);
};

export const createMcpToolDefinition = (
	mcpTool: McpToolDefinition,
	serverHint?: string,
): ToolDefinition => {
	return attachToolSurfaceMetadata({
		name: mcpTool.name,
		title: mcpTool.title,
		description: mcpTool.description,
		inputSchema: mcpTool.inputSchema,
		outputSchema: mcpTool.outputSchema,
		annotations: mcpTool.annotations,
		source: 'mcp',
		sourceId: mcpTool.serverId,
	}, serverHint);
};

export const createSubAgentDiscoveryTool = (
	tool: ToolDefinition,
): ToolDefinition => {
	return attachToolSurfaceMetadata(tool);
};

export const buildDiscoveryCatalog = (params: {
	readonly tools: ToolDefinition[];
	readonly serverEntries: Array<{ id: string; name: string }>;
	readonly subAgents?: readonly SubAgentDefinition[];
}): DiscoveryCatalog => {
	const atomicEntries: DiscoveryEntry[] = [];
	const workflowEntries: DiscoveryEntry[] = [];

	for (const tool of params.tools) {
		const entry = toDiscoveryEntry(tool);
		if (!entry) {
			continue;
		}
		const isWorkflowEntry = entry.visibility === 'workflow-only'
			|| entry.source === 'workflow'
			|| entry.source === 'escape-hatch'
			|| entry.toolName === DELEGATE_SUB_AGENT_TOOL_NAME
			|| entry.toolName.startsWith(SUB_AGENT_TOOL_PREFIX);
		if (isWorkflowEntry) {
			workflowEntries.push(entry);
			continue;
		}
		if (entry.visibility === 'hidden') {
			continue;
		}
		atomicEntries.push(entry);
	}

	for (const subAgent of params.subAgents ?? []) {
		workflowEntries.push({
			stableId: normalizeStableId(`workflow.delegate.${subAgent.metadata.name}`),
			toolName: DELEGATE_SUB_AGENT_TOOL_NAME,
			familyId: 'workflow.delegate',
			displayName: subAgent.metadata.name,
			oneLinePurpose: subAgent.metadata.description.trim(),
			visibility: 'workflow-only',
			capabilityTags: [
				'sub-agent',
				'delegate',
				'委托',
				subAgent.metadata.name.toLowerCase(),
			],
			source: 'workflow',
			sourceId: 'sub-agents',
			riskLevel: 'mutating',
			argumentComplexity: 'high',
			requiredArgsSummary: ['task'],
			whenToUse: [],
			whenNotToUse: [],
		});
	}

	const serverEntries: DiscoveryServerEntry[] = params.serverEntries.map((server) => ({
		serverId: server.id,
		displayName: server.name,
		oneLinePurpose: `外部 MCP 服务器 ${server.name}`,
		capabilityTags: [server.id.toLowerCase(), server.name.toLowerCase()],
	}));

	return {
		version: 1,
		entries: atomicEntries,
		workflowEntries,
		serverEntries,
	};
};
