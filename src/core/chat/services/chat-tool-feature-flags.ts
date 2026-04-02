import {
	DEFAULT_TOOL_SURFACE_SETTINGS,
} from 'src/domains/settings/config-ai-runtime';
import type {
	AiRuntimeSettings,
	ToolSurfaceSettings,
} from 'src/domains/settings/types-ai-runtime';
import type {
	ToolArgumentComplexity,
	ToolRuntimePolicy,
	ToolDiscoveryVisibility,
} from 'src/types/tool';

export type ResolvedToolSurfaceSettings = Required<ToolSurfaceSettings>;

type WrapperSurfaceFlagName = 'timeWrappersV1' | 'vaultWrappersV1' | 'fetchWrappersV1';

export interface BuiltinToolSurfaceOverride {
	readonly visibility?: ToolDiscoveryVisibility;
	readonly oneLinePurpose?: string;
	readonly whenToUse?: readonly string[];
	readonly whenNotToUse?: readonly string[];
	readonly requiredArgsSummary?: readonly string[];
	readonly capabilityTags?: readonly string[];
	readonly argumentComplexity?: ToolArgumentComplexity;
	readonly runtimePolicy?: Partial<ToolRuntimePolicy>;
}

const WRAPPER_TOOL_FLAGS: Record<string, WrapperSurfaceFlagName> = {
	get_current_time: 'timeWrappersV1',
	convert_time: 'timeWrappersV1',
	calculate_time_range: 'timeWrappersV1',
	list_directory_flat: 'vaultWrappersV1',
	list_directory_tree: 'vaultWrappersV1',
	list_vault_overview: 'vaultWrappersV1',
	fetch_webpage: 'fetchWrappersV1',
	fetch_webpages_batch: 'fetchWrappersV1',
};

const LEGACY_TOOL_WRAPPER_FLAGS: Record<string, WrapperSurfaceFlagName> = {
	get_time: 'timeWrappersV1',
	list_directory: 'vaultWrappersV1',
	fetch: 'fetchWrappersV1',
};

export const resolveToolSurfaceSettings = (
	settings?: Pick<AiRuntimeSettings, 'toolSurface'> | null,
): ResolvedToolSurfaceSettings => {
	return {
		...DEFAULT_TOOL_SURFACE_SETTINGS,
		...(settings?.toolSurface ?? {}),
	};
};

export const isBuiltinToolEnabledForDefaultSurface = (
	toolName: string,
	flags: ResolvedToolSurfaceSettings,
): boolean => {
	const wrapperFlag = WRAPPER_TOOL_FLAGS[toolName];
	if (wrapperFlag) {
		return flags[wrapperFlag];
	}

	const legacyFlag = LEGACY_TOOL_WRAPPER_FLAGS[toolName];
	if (legacyFlag) {
		return !flags[legacyFlag];
	}

	return true;
};

export const getBuiltinToolVisibilityOverride = (
	toolName: string,
	flags: ResolvedToolSurfaceSettings,
): ToolDiscoveryVisibility | undefined => {
	const legacyFlag = LEGACY_TOOL_WRAPPER_FLAGS[toolName];
	if (legacyFlag && flags[legacyFlag]) {
		return 'hidden';
	}

	return undefined;
};

export const getBuiltinToolSurfaceOverride = (
	toolName: string,
	flags: ResolvedToolSurfaceSettings,
): BuiltinToolSurfaceOverride | undefined => {
	void toolName;
	void flags;
	return undefined;
};
