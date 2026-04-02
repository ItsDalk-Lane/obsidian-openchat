import type { App } from 'obsidian';
import { buildBuiltinTool } from '../../runtime/build-tool';
import { QUERY_INDEX_DESCRIPTION } from './description';
import {
	executeQueryIndex,
	validateQueryIndexInput,
} from './service';
import {
	queryIndexAnnotations,
	queryIndexOutputSchema,
	queryIndexSchema,
	type QueryIndexArgs,
} from './schema';

export const QUERY_INDEX_TOOL_NAME = 'query_index';

const summarizeQueryIndexTarget = (
	args: Partial<QueryIndexArgs>,
): string | null => {
	if (!args.data_source) {
		return null;
	}
	const select = args.select;
	const fieldCount = (select?.fields?.length ?? 0) + (select?.aggregates?.length ?? 0);
	return fieldCount > 0 ? `${args.data_source} (${fieldCount} selects)` : args.data_source;
};

export const createQueryIndexTool = (app: App) => buildBuiltinTool<QueryIndexArgs>({
	name: QUERY_INDEX_TOOL_NAME,
	title: '查询结构化索引',
	description: QUERY_INDEX_DESCRIPTION,
	inputSchema: queryIndexSchema,
	outputSchema: queryIndexOutputSchema,
	annotations: queryIndexAnnotations,
	surface: {
		family: 'builtin.vault.search',
		visibility: 'candidate-only',
		argumentComplexity: 'high',
		riskLevel: 'read-only',
		oneLinePurpose: '查询 Vault 的结构化索引、标签和任务数据。',
		whenToUse: ['需要按字段、标签、属性或任务做结构化筛选和聚合时'],
		whenNotToUse: [
			'要全文搜索正文时改用 search_content',
			'要定位未知路径时改用 find_paths',
		],
		capabilityTags: ['index', 'metadata', 'tag', 'tags', 'task', 'tasks', 'property', 'frontmatter'],
		requiredArgsSummary: ['data_source', 'select'],
	},
	runtimePolicy: {
		defaultArgs: {
			response_format: 'json',
		},
		hiddenSchemaFields: ['response_format'],
	},
	isReadOnly: () => true,
	isConcurrencySafe: () => true,
	validateInput: (args) => validateQueryIndexInput(args),
	getToolUseSummary: summarizeQueryIndexTarget,
	getActivityDescription: (args) =>
		args.data_source ? `查询索引 ${summarizeQueryIndexTarget(args)}` : null,
	execute: async (args) => await executeQueryIndex(app, args),
});