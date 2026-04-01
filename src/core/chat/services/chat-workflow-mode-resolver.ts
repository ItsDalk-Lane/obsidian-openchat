import type { CandidateScope, DiscoveryCatalog } from './chat-tool-selection-types';
import { matchesWorkflowIntent } from './chat-workflow-policy';
import { buildWorkflowToolCatalog } from './chat-workflow-tool-catalog';

export interface WorkflowModeResolutionInput {
	readonly query: string;
	readonly catalog: DiscoveryCatalog;
	readonly workflowModeV1: boolean;
}

export class WorkflowModeResolver {
	resolve(input: WorkflowModeResolutionInput): CandidateScope | null {
		if (!input.workflowModeV1) {
			return null;
		}

		const workflowCatalog = buildWorkflowToolCatalog(input.catalog);
		const candidateToolNames = workflowCatalog.entries
			.filter((entry) => matchesWorkflowIntent(input.query, entry))
			.map((entry) => entry.toolName);

		if (candidateToolNames.length === 0) {
			return null;
		}

		return {
			mode: 'workflow',
			candidateToolNames: Array.from(new Set(candidateToolNames)),
			candidateServerIds: [],
			reasons: ['explicit-workflow-intent'],
			query: input.query,
		};
	}
}