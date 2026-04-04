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
import {
	resolveSurfaceBlueprintBase,
	type SurfaceBlueprint,
} from './chat-tool-discovery-blueprints';
import {
	mergeAdjacentSurfaceBlueprint,
	readAdjacentSurfaceMetadata,
} from './chat-tool-discovery-adjacent-surface';

const normalizeStableId = (value: string): string => {
	return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-');
};

const createDiscoveryMetadata = (
	tool: Pick<ToolDefinition, 'name' | 'title' | 'description' | 'sourceId'>,
	blueprint: SurfaceBlueprint,
	serverHint?: string,
): ToolDiscoveryMetadata => {
	return {
		displayName: tool.title ?? tool.name,
		oneLinePurpose:
			blueprint.oneLinePurpose ?? summarizeDescriptionForUiFallback(tool.description),
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
	const legacyCallNames = Array.from(new Set([
		tool.name,
		...(blueprint.compatibility?.legacyCallNames ?? []),
	]));
	const legacyServerIds = Array.from(new Set([
		tool.sourceId,
		...(blueprint.compatibility?.legacyServerIds ?? []),
	]));

	return {
		version: 1,
		legacyCallNames,
		legacyServerIds,
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

export const attachToolSurfaceMetadata = (
	tool: ToolDefinition & {
		readonly surface?: unknown;
	},
	serverHint?: string,
): ToolDefinition => {
	const hasAdjacentSurface = tool.source === 'builtin'
		&& !!readAdjacentSurfaceMetadata(tool.surface);
	const baseBlueprint = resolveSurfaceBlueprintBase(tool, hasAdjacentSurface);
	const blueprint = hasAdjacentSurface
		? mergeAdjacentSurfaceBlueprint(baseBlueprint, tool.surface)
		: baseBlueprint;
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
): ToolDefinition => {
	const definition = attachToolSurfaceMetadata({
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
		execution: {
			kind: 'builtin',
			canonicalName: builtinTool.name,
		},
	});

	if (!builtinTool.aliases || builtinTool.aliases.length === 0) {
		return definition;
	}

	return {
		...definition,
		compatibility: {
			version: definition.compatibility?.version ?? 1,
			...definition.compatibility,
			legacyCallNames: Array.from(new Set([
				...(definition.compatibility?.legacyCallNames ?? [definition.name]),
				...builtinTool.aliases,
			])),
		},
	};
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
		execution: {
			kind: 'mcp',
			serverId: mcpTool.serverId,
		},
	}, serverHint);
};

export const createSubAgentToolDefinition = (
	tool: ToolDefinition,
): ToolDefinition => {
	return attachToolSurfaceMetadata({
		...tool,
		execution: tool.execution ?? {
			kind: tool.source === 'workflow' ? 'workflow' : 'sub-agent',
			target: tool.name,
		},
	});
};
