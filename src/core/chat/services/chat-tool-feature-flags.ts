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
	list_directory_tree: 'vaultWrappersV1',
	list_vault_overview: 'vaultWrappersV1',
	fetch_webpage: 'fetchWrappersV1',
	fetch_webpages_batch: 'fetchWrappersV1',
};

const LEGACY_TOOL_WRAPPER_FLAGS: Record<string, WrapperSurfaceFlagName> = {
	get_time: 'timeWrappersV1',
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
	if (toolName !== 'list_directory' || !flags.vaultWrappersV1) {
		return undefined;
	}

	return {
		oneLinePurpose: '浏览一个已知目录的一层内容。',
		whenToUse: ['已经知道准确目录路径，只想看当前目录的直接子项'],
		whenNotToUse: ['需要树形递归时用 list_directory_tree', '需要全库总览时用 list_vault_overview'],
		requiredArgsSummary: ['directory_path'],
		capabilityTags: ['directory', 'folder', 'flat list', '目录浏览', '当前目录'],
		argumentComplexity: 'medium',
		runtimePolicy: {
			defaultArgs: {
				response_format: 'json',
				view: 'flat',
			},
			hiddenSchemaFields: [
				'response_format',
				'view',
				'exclude_patterns',
				'max_depth',
				'max_nodes',
				'file_extensions',
				'vault_limit',
			],
		},
	};
};
