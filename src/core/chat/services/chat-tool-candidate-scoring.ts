import type {
	DiscoveryEntry,
	TaskSignature,
	ToolScoreBreakdown,
	ToolScoreCard,
} from './chat-tool-selection-types';
import {
	ACTION_DOMAIN_WEIGHTS,
	DISCOVERY_DOMAINS,
	inferDomainId,
	LEGACY_TOOL_NAMES,
	TARGET_DEPENDENT_DOMAINS,
} from './chat-tool-candidate-scoring-policy';

const includesKeyword = (query: string, value: string): boolean => query.includes(value.toLowerCase());

const getDomainMatch = (signature: TaskSignature, domainId: string): number =>
	ACTION_DOMAIN_WEIGHTS[signature.nextAction][domainId] ?? 0;

const getTargetFit = (signature: TaskSignature, entry: DiscoveryEntry, domainId: string): number => {
	if (domainId === 'time') {
		if (
			entry.toolName === 'convert_time'
			&& ['转换', 'convert', 'timezone', '到', 'from', 'to'].some((keyword) =>
				signature.normalizedQuery.includes(keyword.toLowerCase()),
			)
		) {
			return 4;
		}
		if (
			entry.toolName === 'get_current_time'
			&& ['现在', '当前', 'now', 'what time'].some((keyword) =>
				signature.normalizedQuery.includes(keyword.toLowerCase()),
			)
		) {
			return 4;
		}
		if (
			entry.toolName === 'calculate_time_range'
			&& ['昨天', '上周', '最近', 'range', '时间范围', 'last week'].some((keyword) =>
				signature.normalizedQuery.includes(keyword.toLowerCase()),
			)
		) {
			return 4;
		}
	}
	if (signature.nextAction === 'workflow' && signature.explicitToolName) {
		if (signature.explicitToolName === entry.toolName) {
			return 8;
		}
		if (signature.explicitToolName.startsWith('discover_') && domainId === 'workflow.discovery') {
			return 4;
		}
		return -6;
	}
	if (TARGET_DEPENDENT_DOMAINS.has(domainId)) {
		if (signature.targetExplicitness === 'explicit') {
			return 4;
		}
		if (signature.targetExplicitness === 'contextual') {
			return 3;
		}
		return -7;
	}
	if (
		DISCOVERY_DOMAINS.has(domainId)
		&& signature.targetExplicitness === 'unknown'
		&& ['locate', 'search-content', 'metadata', 'workflow'].includes(signature.nextAction)
	) {
		return 4;
	}
	if (signature.targetKind === 'directory' && ['list_directory_flat', 'list_directory_tree', 'list_vault_overview'].includes(entry.toolName)) {
		return 3;
	}
	if (signature.targetKind === 'url' && domainId === 'web.fetch') {
		return 4;
	}
	if (signature.scope === 'vault' && entry.toolName === 'list_vault_overview') {
		return 2;
	}
	return 0;
};

const getContextFit = (signature: TaskSignature, domainId: string): number => {
	let score = 0;
	if (signature.environment.hasSelectedFiles && TARGET_DEPENDENT_DOMAINS.has(domainId)) {
		score += 3;
	}
	if (signature.environment.hasSelectedFolders && domainId === 'vault.discovery') {
		score += 3;
	}
	if (signature.environment.hasSelectedText && domainId === 'vault.write') {
		score += 2;
	}
	if (signature.environment.hasActiveFile && domainId === 'vault.read' && signature.targetKind === 'file') {
		score += 2;
	}
	if (signature.environment.selectionKind === 'text' && signature.targetKind === 'selection') {
		if (domainId === 'vault.read') {
			score += 2;
		}
		if (domainId === 'vault.write') {
			score += 3;
		}
	}
	if (signature.environment.recentDiscovery?.hasResults) {
		if (
			signature.nextAction === 'read'
			&& domainId === 'vault.read'
			&& signature.environment.recentDiscovery.targetKind === 'file'
		) {
			score += 3;
		}
		if (
			signature.nextAction === 'web-fetch'
			&& domainId === 'web.fetch'
			&& signature.environment.recentDiscovery.targetKind === 'url'
		) {
			score += 3;
		}
		if (
			signature.nextAction === 'metadata'
			&& domainId === 'vault.search'
			&& signature.environment.recentDiscovery.toolName === 'query_index'
			&& signature.environment.recentDiscovery.dataSource
			&& signature.environment.recentDiscovery.dataSource !== 'file'
		) {
			score += 4;
		}
	}
	if (
		signature.environment.selectedTextFilePath
		&& signature.environment.selectedTextRange
		&& signature.targetKind === 'selection'
	) {
		if (domainId === 'vault.read') {
			score += 1;
		}
		if (domainId === 'vault.write') {
			score += 2;
		}
	}
	if (signature.environment.hasContextualTarget && TARGET_DEPENDENT_DOMAINS.has(domainId)) {
		score += 2;
	}
	if (!signature.environment.hasContextualTarget && signature.targetExplicitness === 'unknown' && TARGET_DEPENDENT_DOMAINS.has(domainId)) {
		score -= 4;
	}
	return score;
};

const getWorkflowPrior = (signature: TaskSignature, domainId: string): number => {
	if (signature.environment.workflowStage === 'post-discovery') {
		if (signature.nextAction === 'read' && domainId === 'vault.read') {
			return 4;
		}
		if (domainId === 'vault.discovery' || domainId === 'vault.search') {
			return -2;
		}
	}
	if (signature.environment.workflowStage === 'post-read') {
		if (signature.nextAction === 'write' && domainId === 'vault.write') {
			return 3;
		}
		if (signature.nextAction === 'metadata' && domainId === 'vault.search') {
			return 2;
		}
	}
	return 0;
};

const getLiteralRecall = (signature: TaskSignature, entry: DiscoveryEntry): number => {
	let score = 0;
	if (includesKeyword(signature.normalizedQuery, entry.toolName.toLowerCase())) {
		score += 4;
	}
	if (includesKeyword(signature.normalizedQuery, entry.displayName.toLowerCase())) {
		score += 2;
	}
	for (const tag of entry.capabilityTags) {
		if (includesKeyword(signature.normalizedQuery, tag.toLowerCase())) {
			score += 1;
		}
	}
	for (const arg of entry.requiredArgsSummary) {
		if (includesKeyword(signature.normalizedQuery, arg.toLowerCase())) {
			score += 1;
		}
	}
	return score;
};

const getRiskAdjustment = (signature: TaskSignature, entry: DiscoveryEntry): number => {
	let score = 0;
	if (entry.riskLevel === 'mutating') {
		score -= 4;
		if (signature.writeIntent === 'safe' || signature.writeIntent === 'destructive') {
			score += 5;
		}
	}
	if (entry.riskLevel === 'destructive') {
		score -= 12;
		if (signature.writeIntent === 'destructive') {
			score += 10;
		}
	}
	if (entry.riskLevel === 'escape-hatch') {
		score -= 8;
		if (signature.nextAction === 'workflow') {
			score += 6;
		}
	}
	if (entry.argumentComplexity === 'medium') {
		score -= 1;
	}
	if (entry.argumentComplexity === 'high') {
		score -= 2;
	}
	if (entry.visibility === 'candidate-only') {
		score -= 1;
	}
	if (LEGACY_TOOL_NAMES.has(entry.toolName) || entry.toolName.startsWith('sub_agent_')) {
		score -= 2;
	}
	return score;
};

const collectBlockedReasons = (
	signature: TaskSignature,
	domainId: string,
	entry: DiscoveryEntry,
): string[] => {
	const blockedReasons: string[] = [];
	if (entry.riskLevel === 'destructive' && signature.writeIntent !== 'destructive') {
		blockedReasons.push('destructive-first-exposure-blocked');
	}
	if (domainId === 'vault.write' && signature.writeIntent === 'none') {
		blockedReasons.push('write-intent-missing');
	}
	if (TARGET_DEPENDENT_DOMAINS.has(domainId) && signature.targetExplicitness === 'unknown') {
		if (!(signature.environment.workflowStage === 'post-discovery' && signature.nextAction === 'read')) {
			blockedReasons.push('missing-target');
		}
	}
	if (signature.nextAction !== 'workflow' && (domainId === 'workflow' || domainId === 'workflow.discovery') && entry.toolName !== signature.explicitToolName) {
		blockedReasons.push('not-current-workflow-step');
	}
	return blockedReasons;
};

export const scoreDiscoveryEntries = (params: {
	readonly signature: TaskSignature;
	readonly entries: readonly DiscoveryEntry[];
}): ToolScoreCard[] => {
	const scoreCards = params.entries.map((entry) => {
		const domainId = inferDomainId(entry);
		const domainMatch = getDomainMatch(params.signature, domainId);
		const targetFit = getTargetFit(params.signature, entry, domainId);
		const contextFit = getContextFit(params.signature, domainId);
		const workflowPrior = getWorkflowPrior(params.signature, domainId);
		const literalRecall = getLiteralRecall(params.signature, entry);
		const riskAdjustment = getRiskAdjustment(params.signature, entry);
		const total = domainMatch + targetFit + contextFit + workflowPrior + literalRecall + riskAdjustment;
		const breakdown: ToolScoreBreakdown = {
			domainMatch,
			targetFit,
			contextFit,
			workflowPrior,
			literalRecall,
			riskAdjustment,
			total,
		};
		return {
			toolName: entry.toolName,
			familyId: entry.familyId,
			sourceId: entry.sourceId,
			domainId,
			score: total,
			breakdown,
			blockedReasons: collectBlockedReasons(params.signature, domainId, entry),
		} satisfies ToolScoreCard;
	});
	return scoreCards.sort((left, right) =>
		right.score - left.score || left.toolName.localeCompare(right.toolName));
};