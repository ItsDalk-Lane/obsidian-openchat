import type {
	CandidateResolutionInput,
	CandidateScope,
} from './chat-tool-selection-types';
import { scoreDiscoveryEntries } from './chat-tool-candidate-scoring';
import { buildTaskSignature } from './chat-tool-task-signature';
import {
	buildCapabilityDomainScores,
	selectCapabilityDomains,
} from './chat-tool-routing-domain-selection';
import { applySafetyConvergence } from './chat-tool-routing-safety-policy';

const normalizeQuery = (value: string): string => value.toLowerCase().replace(/\s+/gu, ' ').trim();

const buildAtomicScope = (input: CandidateResolutionInput): CandidateScope => {
	const signature = buildTaskSignature({
		query: input.query,
		session: input.session,
		routingContext: input.routingContext,
	});
	const scoringEntries = Array.from(new Map(
		(
			signature.nextAction === 'workflow'
				? [...input.catalog.entries, ...input.catalog.workflowEntries]
				: (input.workflowToolsDefaultHidden
					? input.catalog.entries
					: [...input.catalog.entries, ...input.catalog.workflowEntries])
		)
			.map((entry) => [`${entry.source}:${entry.sourceId}:${entry.toolName}`, entry]),
	).values());
	const scoreCards = scoreDiscoveryEntries({
		signature,
		entries: scoringEntries,
	});
	const domainScores = buildCapabilityDomainScores(scoreCards);
	const selectedDomains = selectCapabilityDomains(domainScores);
	const selectedDomainIds = selectedDomains.map((domain) => domain.domainId);
	const { candidateToolNames, fallbackMode } = applySafetyConvergence({
		query: input.query,
		signature,
		selectedDomains,
		catalog: {
			...input.catalog,
			entries: scoringEntries,
		},
	});
	const candidateEntries = scoringEntries.filter((entry) => candidateToolNames.includes(entry.toolName));
	const candidateServerIds = Array.from(new Set(candidateEntries
		.filter((entry) => entry.source === 'mcp')
		.map((entry) => entry.sourceId)));
	const mode = candidateToolNames.length === 0
		? 'no-tool'
		: candidateEntries.some((entry) =>
			entry.source === 'workflow'
			|| entry.source === 'escape-hatch'
			|| entry.visibility === 'workflow-only',
		)
			? 'workflow'
			: 'atomic-tools';
	return {
		mode,
		candidateToolNames,
		candidateServerIds,
		reasons: selectedDomains.length > 0
			? selectedDomains.map((domain) => domain.domainId)
			: [fallbackMode === 'conservative' ? 'conservative-fallback' : 'no-tool-match'],
		query: signature.normalizedQuery,
		selectedDomainIds,
		fallbackMode,
		routingTrace: {
			taskSignature: signature,
			selectedDomains,
			scoreCards,
		},
	};
};

export const buildToolSelectionQuery = (parts: Array<string | undefined>): string => {
	return normalizeQuery(parts.filter((part): part is string => typeof part === 'string' && part.trim().length > 0).join('\n'));
};

export class DeterministicCandidateScopeResolver {
	resolve(input: CandidateResolutionInput): CandidateScope {
		const query = normalizeQuery(input.query);
		if (!query) {
			return {
				mode: 'no-tool',
				candidateToolNames: [],
				candidateServerIds: [],
				reasons: ['empty-query'],
				query,
				fallbackMode: 'no-tool',
			};
		}
		return buildAtomicScope({
			...input,
			query,
			catalog: input.catalog,
		});
	}
}
