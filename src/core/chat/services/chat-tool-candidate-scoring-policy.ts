import type { DiscoveryEntry, TaskSignature } from './chat-tool-selection-types';

export const LEGACY_TOOL_NAMES = new Set(['get_time', 'fetch', 'list_directory', 'Skill']);
export const TARGET_DEPENDENT_DOMAINS = new Set(['vault.read', 'vault.write']);
export const DISCOVERY_DOMAINS = new Set(['vault.discovery', 'vault.search', 'workflow.discovery']);

export const inferDomainId = (entry: DiscoveryEntry): string => {
	if (entry.source === 'mcp' || entry.familyId.startsWith('mcp.')) {
		return 'external.mcp';
	}
	if (entry.familyId === 'builtin.vault.discovery') {
		return 'vault.discovery';
	}
	if (entry.familyId === 'builtin.vault.read') {
		return 'vault.read';
	}
	if (entry.familyId === 'builtin.vault.write') {
		return 'vault.write';
	}
	if (entry.familyId === 'builtin.vault.search') {
		return 'vault.search';
	}
	if (entry.familyId === 'builtin.web.fetch') {
		return 'web.fetch';
	}
	if (entry.familyId === 'builtin.web.search') {
		return 'web.search';
	}
	if (entry.familyId === 'builtin.time') {
		return 'time';
	}
	if (entry.familyId === 'builtin.skill.discovery' || entry.familyId === 'builtin.delegate.discovery') {
		return 'workflow.discovery';
	}
	if (entry.familyId.startsWith('workflow.') || entry.familyId.startsWith('escape.')) {
		return 'workflow';
	}
	return 'misc';
};

export const ACTION_DOMAIN_WEIGHTS: Record<TaskSignature['nextAction'], Partial<Record<string, number>>> = {
	locate: { 'vault.discovery': 9, 'vault.search': 5, 'workflow.discovery': 4, 'external.mcp': 3 },
	'search-content': { 'vault.search': 10, 'vault.discovery': 4, 'external.mcp': 2 },
	read: { 'vault.read': 10, 'vault.discovery': 2, 'vault.search': 1 },
	write: { 'vault.write': 10, 'vault.read': 2 },
	metadata: { 'vault.search': 10, 'vault.discovery': 3 },
	workspace: { workflow: 8, 'vault.discovery': 3 },
	'web-fetch': { 'web.fetch': 10, 'web.search': 2 },
	'web-search': { 'web.search': 10, 'web.fetch': 2 },
	time: { time: 10 },
	workflow: { workflow: 11, 'workflow.discovery': 9 },
	unknown: { 'vault.discovery': 4, 'vault.search': 3 },
};