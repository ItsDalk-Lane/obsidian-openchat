import type { CapabilityDomainScore, ToolScoreCard } from './chat-tool-selection-types';

const PER_DOMAIN_TOOL_LIMIT = 2;
const SECONDARY_DOMAIN_GAP = 3;

export const buildCapabilityDomainScores = (
	scoreCards: readonly ToolScoreCard[],
): CapabilityDomainScore[] => {
	const byDomain = new Map<string, { score: number; toolNames: string[]; reasons: string[] }>();
	for (const card of scoreCards) {
		if (card.blockedReasons.length > 0 || card.score <= 0) {
			continue;
		}
		const current = byDomain.get(card.domainId) ?? { score: 0, toolNames: [], reasons: [] };
		if (current.toolNames.length < PER_DOMAIN_TOOL_LIMIT) {
			current.toolNames.push(card.toolName);
		}
		current.score += current.toolNames.length === 1 ? card.score : Math.max(0, Math.round(card.score / 2));
		current.reasons.push(`top-tool:${card.toolName}`);
		byDomain.set(card.domainId, current);
	}
	return [...byDomain.entries()]
		.map(([domainId, value]) => ({
			domainId,
			score: value.score,
			toolNames: value.toolNames,
			reasons: value.reasons,
		}))
		.sort((left, right) => right.score - left.score || left.domainId.localeCompare(right.domainId));
};

export const selectCapabilityDomains = (
	domainScores: readonly CapabilityDomainScore[],
): CapabilityDomainScore[] => {
	if (domainScores.length === 0) {
		return [];
	}
	if (domainScores.length === 1) {
		return [domainScores[0]!];
	}
	const [first, second] = domainScores;
	if (!first || !second) {
		return first ? [first] : [];
	}
	if (first.score - second.score <= SECONDARY_DOMAIN_GAP) {
		return [first, second];
	}
	return [first];
};