import type { DiscoveryCatalog, DiscoveryEntry } from './chat-tool-selection-types';
import { isWorkflowDiscoveryEntry } from './chat-workflow-policy';

export interface WorkflowToolCatalog {
	readonly entries: DiscoveryEntry[];
	readonly byToolName: ReadonlyMap<string, DiscoveryEntry>;
}

export const buildWorkflowToolCatalog = (
	catalog: DiscoveryCatalog,
): WorkflowToolCatalog => {
	const byToolName = new Map<string, DiscoveryEntry>();
	const entries: DiscoveryEntry[] = [];

	for (const entry of [...catalog.workflowEntries, ...catalog.entries]) {
		if (!isWorkflowDiscoveryEntry(entry)) {
			continue;
		}
		entries.push(entry);
		if (!byToolName.has(entry.toolName)) {
			byToolName.set(entry.toolName, entry);
		}
	}

	return {
		entries,
		byToolName,
	};
};