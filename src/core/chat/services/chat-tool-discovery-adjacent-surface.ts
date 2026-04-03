import type {
	ToolCompatibilityMetadata,
	ToolDiscoveryMetadata,
	ToolIdentity,
	ToolRuntimePolicy,
} from 'src/types/tool';
import type { SurfaceBlueprint } from './chat-tool-discovery-blueprint-presets';

type SurfaceSource = ToolIdentity['source'];

type AdjacentSurfaceMetadata = Partial<SurfaceBlueprint> & {
	readonly family?: string;
	readonly familyId?: string;
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

export const readAdjacentSurfaceMetadata = (
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

export const mergeAdjacentSurfaceBlueprint = (
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