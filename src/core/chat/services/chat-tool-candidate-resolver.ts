import type {
	CandidateResolutionInput,
	CandidateScope,
	DiscoveryCatalog,
	DiscoveryEntry,
} from './chat-tool-selection-types';
import { WorkflowModeResolver } from './chat-workflow-mode-resolver';

const DEFAULT_ATOMIC_FAMILIES = [
	'builtin.vault.discovery',
	'builtin.vault.read',
	'builtin.vault.search',
];

const FAMILY_KEYWORDS: Record<string, string[]> = {
	'builtin.vault.discovery': [
		'find', 'path', 'paths', 'directory', 'folder', 'tree', 'list', 'browse',
		'查找', '路径', '目录', '文件夹', '树形', '浏览',
	],
	'builtin.vault.read': [
		'read', 'open', 'content', 'file', 'lines', 'summary', 'inspect',
		'读取', '打开', '内容', '文件', '查看', '代码',
	],
	'builtin.vault.write': [
		'write', 'edit', 'update', 'create', 'modify', 'patch', 'rename', 'move', 'delete',
		'写入', '编辑', '更新', '创建', '修改', '重命名', '移动', '删除',
	],
	'builtin.vault.search': [
		'search', 'grep', 'regex', 'query', 'index', 'tag', 'tags', 'task', 'metadata',
		'搜索', '检索', '正则', '标签', '任务', '元数据', '属性',
	],
	'builtin.web.fetch': [
		'url', 'urls', 'website', 'webpage', 'fetch', 'crawl', 'html', 'http', 'batch',
		'网页', '网站', '链接', '抓取',
	],
	'builtin.web.search': [
		'web search', 'internet', 'online', 'bing', '联网', '搜索网络', '在线信息',
	],
	'builtin.time': [
		'time', 'timezone', 'date', 'now', 'today', 'calendar', 'convert', 'range',
		'时间', '时区', '日期', '今天', '转换', '换算', '范围',
	],
};

const normalizeText = (value: string): string => value.toLowerCase();

const includesAnyKeyword = (text: string, keywords: readonly string[]): boolean => {
	return keywords.some((keyword) => includesKeyword(text, keyword));
};

const includesKeyword = (text: string, keyword: string): boolean => {
	return text.includes(normalizeText(keyword));
};

const buildQuery = (value: string): string => normalizeText(value.replace(/\s+/g, ' ').trim());

const scoreEntry = (query: string, entry: DiscoveryEntry, familyScore: number): number => {
	let score = familyScore;
	if (includesKeyword(query, entry.toolName.toLowerCase())) {
		score += 5;
	}
	for (const tag of entry.capabilityTags) {
		if (includesKeyword(query, tag)) {
			score += 2;
		}
	}
	for (const arg of entry.requiredArgsSummary) {
		if (includesKeyword(query, arg.toLowerCase())) {
			score += 1;
		}
	}
	return score;
};

const collectFamilyScores = (query: string, entries: readonly DiscoveryEntry[]): Map<string, number> => {
	const scores = new Map<string, number>();
	for (const entry of entries) {
		const keywords = FAMILY_KEYWORDS[entry.familyId] ?? [];
		const familyScore = keywords.reduce(
			(sum, keyword) => sum + (includesKeyword(query, keyword) ? 2 : 0),
			0,
		);
		if (familyScore > 0) {
			scores.set(entry.familyId, Math.max(scores.get(entry.familyId) ?? 0, familyScore));
		}
	}
	return scores;
};

const pickAtomicTools = (query: string, catalog: DiscoveryCatalog): CandidateScope => {
	const familyScores = collectFamilyScores(query, catalog.entries);
	const selectedFamilies = new Set(
		[...familyScores.entries()]
			.filter(([, score]) => score > 0)
			.map(([familyId]) => familyId),
	);

	if (selectedFamilies.size === 0) {
		for (const familyId of DEFAULT_ATOMIC_FAMILIES) {
			selectedFamilies.add(familyId);
		}
	}

	const selectedTools: Array<{ toolName: string; score: number }> = [];
	for (const entry of catalog.entries) {
		const familyScore = familyScores.get(entry.familyId) ?? (selectedFamilies.has(entry.familyId) ? 1 : 0);
		const score = scoreEntry(query, entry, familyScore);
		if (score <= 0) {
			continue;
		}
		if (entry.visibility === 'candidate-only' && score < 3) {
			continue;
		}
		selectedTools.push({ toolName: entry.toolName, score });
	}

	selectedTools.sort((left, right) => right.score - left.score || left.toolName.localeCompare(right.toolName));

	const candidateToolNames = Array.from(new Set(selectedTools.map((entry) => entry.toolName)));
	const preferredCandidateToolNames = candidateToolNames.filter((toolName) => {
		if (
			toolName === 'list_directory'
			&& candidateToolNames.includes('list_vault_overview')
			&& includesAnyKeyword(query, ['vault', 'overview', '总览', '全库'])
		) {
			return false;
		}
		if (
			toolName === 'list_directory'
			&& candidateToolNames.includes('list_directory_tree')
			&& includesAnyKeyword(query, ['tree', '树形', '递归'])
		) {
			return false;
		}
		if (
			toolName === 'get_time'
			&& candidateToolNames.some((candidate) => [
				'get_current_time',
				'convert_time',
				'calculate_time_range',
			].includes(candidate))
		) {
			return false;
		}
		return true;
	});
	const candidateServerIds = catalog.serverEntries
		.filter((server) => server.capabilityTags.some((tag) => includesKeyword(query, tag)))
		.map((server) => server.serverId);

	if (preferredCandidateToolNames.length === 0 && candidateServerIds.length === 0 && catalog.serverEntries.length > 0) {
		return {
			mode: 'atomic-tools',
			candidateToolNames: [],
			candidateServerIds: catalog.serverEntries.map((server) => server.serverId),
			reasons: ['fallback-to-external-mcp'],
			query,
		};
	}

	return {
		mode: 'atomic-tools',
		candidateToolNames: preferredCandidateToolNames,
		candidateServerIds,
		reasons: [...selectedFamilies],
		query,
	};
};

const inputWorkflowEntries = (
	catalog: DiscoveryCatalog,
	workflowToolsDefaultHidden: boolean,
): readonly DiscoveryEntry[] => {
	return workflowToolsDefaultHidden
		? catalog.entries
		: [...catalog.entries, ...catalog.workflowEntries];
};

export const buildToolSelectionQuery = (parts: Array<string | undefined>): string => {
	return buildQuery(parts.filter((part): part is string => typeof part === 'string' && part.trim().length > 0).join('\n'));
};

export class DeterministicCandidateScopeResolver {
	private readonly workflowModeResolver = new WorkflowModeResolver();

	resolve(input: CandidateResolutionInput): CandidateScope {
		const query = buildQuery(input.query);
		if (!query) {
			return {
				mode: 'no-tool',
				candidateToolNames: [],
				candidateServerIds: [],
				reasons: ['empty-query'],
				query,
			};
		}

		const workflowScope = this.workflowModeResolver.resolve({
			query,
			catalog: input.catalog,
			workflowModeV1: input.workflowModeV1,
		});
		if (workflowScope) {
			return workflowScope;
		}

		return pickAtomicTools(
			query,
			{
				...input.catalog,
				entries: [...inputWorkflowEntries(input.catalog, input.workflowToolsDefaultHidden)],
			},
		);
	}
}
