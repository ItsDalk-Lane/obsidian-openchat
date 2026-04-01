import type { DiscoveryCatalog, DiscoveryEntry } from './chat-tool-selection-types';
import { isWorkflowDiscoveryEntry } from './chat-workflow-policy';

export interface WorkflowToolCatalog {
	readonly entries: DiscoveryEntry[];
	readonly byToolName: ReadonlyMap<string, DiscoveryEntry>;
}

export const buildWorkflowToolCatalog = (
	catalog: DiscoveryCatalog,
): WorkflowToolCatalog => {
	const dedupedEntries = new Map<string, DiscoveryEntry>();

	for (const entry of [...catalog.workflowEntries, ...catalog.entries]) {
		if (!isWorkflowDiscoveryEntry(entry) || dedupedEntries.has(entry.toolName)) {
			continue;
		}
		dedupedEntries.set(entry.toolName, entry);
	}

	return {
		entries: [...dedupedEntries.values()],
		byToolName: dedupedEntries,
	};
};