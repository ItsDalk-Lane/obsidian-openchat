import type { ToolDefinition } from 'src/types/tool';
import type {
	DiscoveryEntry,
	ProviderToolDiscoveryPayload,
	ProviderToolExecutablePayload,
} from './chat-tool-selection-types';

const MAX_EXECUTABLE_TOOLS = 8;
const MAX_WORKFLOW_ENTRIES = 6;
const MAX_SERVER_ENTRIES = 4;
const MAX_PROMPT_BLOCK_CHARS = 1600;
const DEFAULT_SUMMARY_LENGTH = 96;

const takeWithOverflow = <T>(items: readonly T[], max: number): {
	items: T[];
	overflow: number;
} => {
	const nextItems = items.slice(0, max);
	return {
		items: nextItems,
		overflow: Math.max(0, items.length - nextItems.length),
	};
};

const dedupeEntries = (entries: readonly DiscoveryEntry[]): DiscoveryEntry[] => {
	const seen = new Set<string>();
	const results: DiscoveryEntry[] = [];
	for (const entry of entries) {
		const key = `${entry.toolName}:${entry.displayName}`;
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		results.push(entry);
	}
	return results;
};

const escapeXml = (value: string): string => value
	.replace(/&/gu, '&amp;')
	.replace(/</gu, '&lt;')
	.replace(/>/gu, '&gt;')
	.replace(/"/gu, '&quot;')
	.replace(/'/gu, '&apos;');

const summarizeText = (value: string, max = DEFAULT_SUMMARY_LENGTH): string => {
	const normalized = String(value).trim().replace(/\s+/gu, ' ');
	if (normalized.length <= max) {
		return normalized;
	}
	return `${normalized.slice(0, max - 3)}...`;
};

const sanitizeInlineText = (value: string, max = DEFAULT_SUMMARY_LENGTH): string =>
	escapeXml(summarizeText(value, max));

const formatExecutableTool = (tool: ToolDefinition): string => {
	const purpose = sanitizeInlineText(tool.discovery?.oneLinePurpose ?? tool.description);
	const args = tool.discovery?.requiredArgsSummary?.map((value) => sanitizeInlineText(value, 48)).join(', ');
	const risk = sanitizeInlineText(tool.discovery?.riskLevel ?? 'unknown', 24);
	const toolName = sanitizeInlineText(tool.name, 48);
	return args
		? `- ${toolName}: ${purpose} | risk=${risk} | args=${args}`
		: `- ${toolName}: ${purpose} | risk=${risk}`;
};

const formatWorkflowEntry = (entry: DiscoveryEntry): string => {
	const args = entry.requiredArgsSummary.map((value) => sanitizeInlineText(value, 48)).join(', ');
	const displayName = sanitizeInlineText(entry.displayName, 48);
	const purpose = sanitizeInlineText(entry.oneLinePurpose);
	const toolName = sanitizeInlineText(entry.toolName, 48);
	return args
		? `- ${displayName}: ${purpose} | tool=${toolName} | args=${args}`
		: `- ${displayName}: ${purpose} | tool=${toolName}`;
};

const buildBudgetFallbackBlock = (params: {
	discoveryPayload: ProviderToolDiscoveryPayload;
	executableCount: number;
	workflowCount: number;
	serverCount: number;
}): string => {
	return [
		'<tool-surface>',
		`surface_mode=${sanitizeInlineText(params.discoveryPayload.surfaceMode, 24)}`,
		`selection_mode=${sanitizeInlineText(params.discoveryPayload.scope.mode, 24)}`,
		`executable_count=${params.executableCount}`,
		`workflow_option_count=${params.workflowCount}`,
		`external_server_count=${params.serverCount}`,
		'tool_surface_summary=omitted_for_budget',
		'</tool-surface>',
	].join('\n');
};

export const buildToolSurfacePromptBlock = (params: {
	providerDiscoveryPayload?: ProviderToolDiscoveryPayload;
	providerExecutablePayload?: ProviderToolExecutablePayload;
}): string | undefined => {
	const discoveryPayload = params.providerDiscoveryPayload;
	if (!discoveryPayload?.capabilities.supportsDiscoveryPayload) {
		return undefined;
	}
	const executableTools = params.providerExecutablePayload?.toolSet.tools ?? [];
	const workflowEntries = dedupeEntries(
		discoveryPayload.catalog.workflowEntries.filter((entry) =>
			discoveryPayload.scope.candidateToolNames.includes(entry.toolName),
		),
	);
	const selectedServers = discoveryPayload.catalog.serverEntries.filter((server) =>
		discoveryPayload.scope.candidateServerIds.includes(server.serverId),
	);

	const lines = [
		'<tool-surface>',
		`surface_mode=${sanitizeInlineText(discoveryPayload.surfaceMode, 24)}`,
		`selection_mode=${sanitizeInlineText(discoveryPayload.scope.mode, 24)}`,
	];

	if (executableTools.length > 0) {
		const { items, overflow } = takeWithOverflow(executableTools, MAX_EXECUTABLE_TOOLS);
		lines.push('<executable-tools>');
		lines.push(...items.map(formatExecutableTool));
		if (overflow > 0) {
			lines.push(`- ... ${overflow} more executable tools omitted`);
		}
		lines.push('</executable-tools>');
	}

	if (workflowEntries.length > 0) {
		const { items, overflow } = takeWithOverflow(workflowEntries, MAX_WORKFLOW_ENTRIES);
		lines.push('<workflow-options>');
		lines.push(...items.map(formatWorkflowEntry));
		if (overflow > 0) {
			lines.push(`- ... ${overflow} more workflow options omitted`);
		}
		lines.push('</workflow-options>');
	}

	if (selectedServers.length > 0) {
		const { items, overflow } = takeWithOverflow(selectedServers, MAX_SERVER_ENTRIES);
		lines.push('<external-servers>');
		for (const server of items) {
			lines.push(
				`- ${sanitizeInlineText(server.displayName, 48)}: ${sanitizeInlineText(server.oneLinePurpose)} | server=${sanitizeInlineText(server.serverId, 48)}`,
			);
		}
		if (overflow > 0) {
			lines.push(`- ... ${overflow} more external servers omitted`);
		}
		lines.push('</external-servers>');
	}

	lines.push('</tool-surface>');
	const block = lines.join('\n');
	if (block.length <= MAX_PROMPT_BLOCK_CHARS) {
		return block;
	}
	return buildBudgetFallbackBlock({
		discoveryPayload,
		executableCount: executableTools.length,
		workflowCount: workflowEntries.length,
		serverCount: selectedServers.length,
	});
};