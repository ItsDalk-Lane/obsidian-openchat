import type {
	CandidateScope,
	CapabilityDomainScore,
	DiscoveryCatalog,
	TaskSignature,
} from './chat-tool-selection-types';

const TOTAL_TOOL_LIMIT = 4;

const DIRECTORY_CURRENT_LEVEL_CANDIDATE_TOOL_NAMES = [
	'list_directory',
	'list_directory_flat',
] as const;
const DIRECTORY_FLAT_CANDIDATE_TOOL_NAMES = ['list_directory_flat'] as const;
const DIRECTORY_TREE_CANDIDATE_TOOL_NAMES = ['list_directory_tree'] as const;
const DIRECTORY_VAULT_OVERVIEW_CANDIDATE_TOOL_NAMES = ['list_vault_overview'] as const;
const LEGACY_TIME_CANDIDATE_TOOL_NAMES = ['get_time'] as const;
const CANONICAL_TIME_CANDIDATE_TOOL_NAMES = [
	'get_current_time',
	'convert_time',
	'calculate_time_range',
] as const;
const GENERIC_TOOL_NAMES = new Set(['find_paths', 'bing_search', 'search_content', 'query_index']);

const includesToolName = (toolName: string, toolNames: readonly string[]): boolean => toolNames.includes(toolName);

const candidateIncludesAnyToolName = (
	candidateToolNames: readonly string[],
	toolNames: readonly string[],
): boolean => candidateToolNames.some((candidateToolName) => includesToolName(candidateToolName, toolNames));

const includesKeyword = (text: string, keyword: string): boolean => text.includes(keyword.toLowerCase());

const applyCanonicalToolPreference = (
	query: string,
	candidateToolNames: readonly string[],
): string[] => candidateToolNames.filter((toolName) => {
		if (
			includesToolName(toolName, DIRECTORY_CURRENT_LEVEL_CANDIDATE_TOOL_NAMES)
			&& candidateIncludesAnyToolName(candidateToolNames, DIRECTORY_VAULT_OVERVIEW_CANDIDATE_TOOL_NAMES)
			&& ['vault', 'overview', '总览', '全库'].some((keyword) => includesKeyword(query, keyword))
		) {
			return false;
		}
		if (
			includesToolName(toolName, DIRECTORY_VAULT_OVERVIEW_CANDIDATE_TOOL_NAMES)
			&& candidateIncludesAnyToolName(candidateToolNames, DIRECTORY_FLAT_CANDIDATE_TOOL_NAMES)
			&& ['一层', '单层', '当前一层', 'direct children', 'one level'].some((keyword) => includesKeyword(query, keyword))
		) {
			return false;
		}
		if (
			includesToolName(toolName, DIRECTORY_CURRENT_LEVEL_CANDIDATE_TOOL_NAMES)
			&& candidateIncludesAnyToolName(candidateToolNames, DIRECTORY_TREE_CANDIDATE_TOOL_NAMES)
			&& ['tree', '树形', '递归'].some((keyword) => includesKeyword(query, keyword))
		) {
			return false;
		}
		if (
			includesToolName(toolName, DIRECTORY_TREE_CANDIDATE_TOOL_NAMES)
			&& candidateIncludesAnyToolName(candidateToolNames, DIRECTORY_FLAT_CANDIDATE_TOOL_NAMES)
			&& ['一层', '单层', '当前一层', 'direct children', 'one level'].some((keyword) => includesKeyword(query, keyword))
		) {
			return false;
		}
		if (
			includesToolName(toolName, LEGACY_TIME_CANDIDATE_TOOL_NAMES)
			&& candidateIncludesAnyToolName(candidateToolNames, CANONICAL_TIME_CANDIDATE_TOOL_NAMES)
		) {
			return false;
		}
		return true;
	});

const buildConservativeFallback = (params: {
	readonly signature: TaskSignature;
	readonly catalog: DiscoveryCatalog;
}): { toolNames: string[]; fallbackMode: CandidateScope['fallbackMode'] } => {
	const preferredOrder = params.signature.explicitToolName
		? [params.signature.explicitToolName]
		: params.signature.nextAction === 'web-search'
			? ['bing_search']
			: params.signature.nextAction === 'search-content'
				? ['search_content']
				: params.signature.nextAction === 'metadata'
					? ['query_index']
					: ['find_paths'];
	for (const toolName of preferredOrder) {
		if (params.catalog.entries.some((entry) => entry.toolName === toolName)) {
			return { toolNames: [toolName], fallbackMode: 'conservative' };
		}
	}
	return { toolNames: [], fallbackMode: 'no-tool' };
};

const shouldUseConservativeMode = (params: {
	readonly signature: TaskSignature;
	readonly selectedDomains: readonly CapabilityDomainScore[];
	readonly candidateToolNames: readonly string[];
}): boolean => {
	if (params.candidateToolNames.length !== 1) {
		return false;
	}
	if (!GENERIC_TOOL_NAMES.has(params.candidateToolNames[0]!)) {
		return false;
	}
	return params.signature.confidence !== 'high' && (params.selectedDomains[0]?.score ?? 0) <= 5;
};

export const applySafetyConvergence = (params: {
	readonly query: string;
	readonly signature: TaskSignature;
	readonly selectedDomains: readonly CapabilityDomainScore[];
	readonly catalog: DiscoveryCatalog;
}): { candidateToolNames: string[]; fallbackMode: CandidateScope['fallbackMode'] } => {
	const selectedToolNames = params.selectedDomains
		.flatMap((domain) => domain.toolNames)
		.slice(0, TOTAL_TOOL_LIMIT);
	let candidateToolNames = applyCanonicalToolPreference(params.query, selectedToolNames);
	let fallbackMode: CandidateScope['fallbackMode'] = 'none';
	if (candidateToolNames.length > 0 && shouldUseConservativeMode({
		signature: params.signature,
		selectedDomains: params.selectedDomains,
		candidateToolNames,
	})) {
		fallbackMode = 'conservative';
	}
	if (candidateToolNames.length === 0) {
		const fallback = buildConservativeFallback({
			signature: params.signature,
			catalog: params.catalog,
		});
		candidateToolNames = fallback.toolNames;
		fallbackMode = fallback.fallbackMode;
	}
	return {
		candidateToolNames,
		fallbackMode,
	};
};