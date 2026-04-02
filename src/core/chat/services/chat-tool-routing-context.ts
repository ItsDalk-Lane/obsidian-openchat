import type { ChatMessage, ChatSession } from '../types/chat';
import type {
	ToolRoutingEnvironmentContext,
	ToolRoutingQueryIndexDataSource,
	ToolRoutingRecentDiscovery,
	ToolRoutingRuntimeContext,
	ToolRoutingSelectionKind,
	ToolRoutingSelectionRange,
	ToolRoutingTargetKind,
	ToolRoutingWorkflowStage,
} from './chat-tool-selection-types';

const POST_DISCOVERY_TOOL_NAMES = new Set([
	'find_paths',
	'search_content',
	'query_index',
	'list_directory_flat',
	'list_directory_tree',
	'list_vault_overview',
	'bing_search',
	'discover_skills',
	'discover_sub_agents',
]);
const POST_READ_TOOL_NAMES = new Set([
	'read_file',
	'read_files',
	'open_file',
	'read_media',
	'fetch_webpage',
	'fetch_webpages_batch',
]);
const POST_WRITE_TOOL_NAMES = new Set([
	'write_file',
	'edit_file',
	'create_directory',
	'move_path',
	'delete_path',
]);
const POST_WORKFLOW_TOOL_NAMES = new Set([
	'invoke_skill',
	'delegate_sub_agent',
	'run_shell',
	'write_plan',
]);
const DISCOVERY_RESULT_TOOL_NAMES = new Set([
	'find_paths',
	'search_content',
	'query_index',
	'bing_search',
	'list_directory_flat',
	'list_directory_tree',
	'list_vault_overview',
]);
const CURRENT_RESOURCE_TERMS = [
	'current file',
	'current note',
	'active note',
	'active file',
	'当前文件',
	'当前笔记',
	'当前活动笔记',
	'当前活动文件',
	'这篇',
	'这个文件',
];
const RECENT_RESULT_TERMS = [
	'first result',
	'first match',
	'candidate file',
	'candidate',
	'previous result',
	'previous search result',
	'上一轮搜索结果',
	'上一轮结果',
	'上一个结果',
	'第一个结果',
	'第一个候选',
	'第一个候选文件',
	'候选文件',
	'上述结果',
	'这些结果',
];
const SELECTION_REFERENCE_TERMS = [
	'selection',
	'selected text',
	'选中文本',
	'选区',
	'这段',
	'这一段',
	'这部分',
	'所选内容',
];

const includesAny = (query: string, keywords: readonly string[]): boolean =>
	keywords.some((keyword) => query.includes(keyword));

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const getArrayCount = (value: unknown): number | undefined => Array.isArray(value) ? value.length : undefined;

const getString = (value: unknown): string | undefined =>
	typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;

const getStringArray = (value: unknown): string[] =>
	Array.isArray(value)
		? value
			.map((item) => getString(item))
			.filter((item): item is string => Boolean(item))
		: [];

const QUERY_INDEX_DATA_SOURCES = new Set<ToolRoutingQueryIndexDataSource>([
	'file',
	'property',
	'tag',
	'task',
]);

const QUERY_INDEX_PATH_KEYS = [
	'path',
	'file',
	'file_path',
	'note',
	'note_path',
];

const resolveQueryIndexDataSource = (value: unknown): ToolRoutingQueryIndexDataSource | undefined => {
	if (typeof value !== 'string') {
		return undefined;
	}
	return QUERY_INDEX_DATA_SOURCES.has(value as ToolRoutingQueryIndexDataSource)
		? value as ToolRoutingQueryIndexDataSource
		: undefined;
};

const collectReferencePathsFromRows = (rows: readonly unknown[]): string[] => {
	const collected = new Set<string>();
	for (const row of rows) {
		if (!isRecord(row)) {
			continue;
		}
		for (const key of QUERY_INDEX_PATH_KEYS) {
			const value = getString(row[key]);
			if (!value) {
				continue;
			}
			collected.add(value);
			break;
		}
		if (collected.size >= 3) {
			break;
		}
	}
	return [...collected];
};

const collectReferenceUrls = (results: readonly unknown[]): string[] => {
	const collected = new Set<string>();
	for (const result of results) {
		if (!isRecord(result)) {
			continue;
		}
		const url = getString(result.url);
		if (!url) {
			continue;
		}
		collected.add(url);
		if (collected.size >= 3) {
			break;
		}
	}
	return [...collected];
};

const resolveSelectedTextRange = (value: unknown): ToolRoutingSelectionRange | undefined => {
	if (!isRecord(value) || typeof value.from !== 'number' || typeof value.to !== 'number') {
		return undefined;
	}
	return {
		from: value.from,
		to: value.to,
	};
};

const inferTargetKindFromValue = (value: unknown): ToolRoutingTargetKind => {
	if (Array.isArray(value) && value.length > 0) {
		return inferTargetKindFromValue(value[0]);
	}
	if (!isRecord(value)) {
		return 'unknown';
	}
	if (typeof value.url === 'string') {
		return 'url';
	}
	if (value.type === 'directory') {
		return 'directory';
	}
	if (value.type === 'file' || typeof value.path === 'string') {
		return 'file';
	}
	return 'unknown';
};

const parseRecentDiscoveryResult = (
	toolName: string,
	resultText: string | undefined,
): ToolRoutingRecentDiscovery | undefined => {
	if (!resultText || !DISCOVERY_RESULT_TOOL_NAMES.has(toolName)) {
		return undefined;
	}
	const trimmedResult = resultText.trim();
	if (trimmedResult.length === 0) {
		return undefined;
	}
	try {
		const parsed = JSON.parse(trimmedResult) as unknown;
		if (toolName === 'query_index' && isRecord(parsed)) {
			const rows = Array.isArray(parsed.rows) ? parsed.rows : [];
			const columns = getStringArray(parsed.columns).slice(0, 8);
			const meta = isRecord(parsed.meta) ? parsed.meta : undefined;
			const dataSource = resolveQueryIndexDataSource(meta?.data_source);
			const resultReferencePaths = collectReferencePathsFromRows(rows);
			return {
				toolName,
				hasResults: rows.length > 0,
				resultCount: rows.length,
				targetKind: dataSource === 'file' || resultReferencePaths.length > 0
					? 'file'
					: 'vault',
				dataSource,
				resultFields: columns,
				resultReferencePaths,
			};
		}
		if (toolName === 'bing_search' && isRecord(parsed)) {
			const resultItems = Array.isArray(parsed.results)
				? parsed.results
				: Array.isArray(parsed.matches)
					? parsed.matches
					: [];
			const resultFields = resultItems.length > 0 && isRecord(resultItems[0])
				? Object.keys(resultItems[0]).slice(0, 8)
				: [];
			return {
				toolName,
				hasResults: resultItems.length > 0,
				resultCount: resultItems.length,
				targetKind: 'url',
				queryText: getString(parsed.query),
				resultFields,
				resultReferenceUrls: collectReferenceUrls(resultItems),
			};
		}
		if (isRecord(parsed)) {
			const matches = parsed.matches;
			const items = parsed.items;
			const results = getArrayCount(matches) ?? getArrayCount(items) ?? getArrayCount(parsed.results) ?? 0;
			const targetKind = inferTargetKindFromValue(matches ?? items ?? parsed.results);
			return {
				toolName,
				hasResults: results > 0,
				resultCount: results,
				targetKind,
			};
		}
		if (Array.isArray(parsed)) {
			return {
				toolName,
				hasResults: parsed.length > 0,
				resultCount: parsed.length,
				targetKind: inferTargetKindFromValue(parsed),
			};
		}
	} catch {
		return {
			toolName,
			hasResults: !['[]', '{}', 'null', 'undefined'].includes(trimmedResult),
			targetKind: toolName === 'bing_search' ? 'url' : 'unknown',
		};
	}
	return undefined;
};

const collectLatestToolNames = (messages: readonly ChatMessage[]): string[] => {
	const latestNames: string[] = [];
	for (const message of [...messages].reverse()) {
		for (const toolCall of [...(message.toolCalls ?? [])].reverse()) {
			if (!latestNames.includes(toolCall.name)) {
				latestNames.push(toolCall.name);
			}
			if (latestNames.length >= 6) {
				return latestNames;
			}
		}
		if (message.role === 'tool' && typeof message.metadata?.toolName === 'string') {
			const toolName = message.metadata.toolName;
			if (!latestNames.includes(toolName)) {
				latestNames.push(toolName);
			}
			if (latestNames.length >= 6) {
				return latestNames;
			}
		}
	}
	return latestNames;
};

const resolveWorkflowStage = (toolNames: readonly string[]): ToolRoutingWorkflowStage => {
	if (toolNames.some((toolName) => POST_DISCOVERY_TOOL_NAMES.has(toolName))) {
		return 'post-discovery';
	}
	if (toolNames.some((toolName) => POST_READ_TOOL_NAMES.has(toolName))) {
		return 'post-read';
	}
	if (toolNames.some((toolName) => POST_WRITE_TOOL_NAMES.has(toolName))) {
		return 'post-write';
	}
	if (toolNames.some((toolName) => POST_WORKFLOW_TOOL_NAMES.has(toolName))) {
		return 'post-workflow';
	}
	return 'initial';
};

const resolveSelectionKind = (params: {
	readonly hasSelectedText: boolean;
	readonly hasSelectedFiles: boolean;
	readonly hasSelectedFolders: boolean;
}): ToolRoutingSelectionKind => {
	const selectionSignals = [params.hasSelectedText, params.hasSelectedFiles, params.hasSelectedFolders]
		.filter(Boolean)
		.length;
	if (selectionSignals > 1) {
		return 'mixed';
	}
	if (params.hasSelectedText) {
		return 'text';
	}
	if (params.hasSelectedFiles) {
		return 'file';
	}
	if (params.hasSelectedFolders) {
		return 'folder';
	}
	return 'none';
};

const collectRecentDiscovery = (messages: readonly ChatMessage[]): ToolRoutingRecentDiscovery | undefined => {
	for (const message of [...messages].reverse()) {
		for (const toolCall of [...(message.toolCalls ?? [])].reverse()) {
			if (toolCall.status !== 'completed') {
				continue;
			}
			const summary = parseRecentDiscoveryResult(toolCall.name, toolCall.result);
			if (summary) {
				return summary;
			}
		}
		if (message.role === 'tool' && typeof message.metadata?.toolName === 'string') {
			const summary = parseRecentDiscoveryResult(message.metadata.toolName, message.content);
			if (summary) {
				return summary;
			}
		}
	}
	return undefined;
};

export const queryMentionsCurrentResource = (query: string): boolean => includesAny(query, CURRENT_RESOURCE_TERMS);

export const queryMentionsRecentResults = (query: string): boolean => includesAny(query, RECENT_RESULT_TERMS);

export const queryMentionsSelection = (query: string): boolean => includesAny(query, SELECTION_REFERENCE_TERMS);

export const buildToolRoutingEnvironment = (params: {
	readonly query: string;
	readonly session: ChatSession;
	readonly routingContext?: ToolRoutingRuntimeContext;
}): ToolRoutingEnvironmentContext => {
	const latestUserMessage = [...params.session.messages].reverse()
		.find((message) => message.role === 'user');
	const hasSelectedText = Boolean(latestUserMessage?.metadata?.selectedText);
	const selectedTextContext = isRecord(latestUserMessage?.metadata?.selectedTextContext)
		? latestUserMessage.metadata.selectedTextContext
		: undefined;
	const selectedTextFilePath = getString(selectedTextContext?.filePath);
	const selectedTextRange = resolveSelectedTextRange(selectedTextContext?.range);
	const hasSelectedFiles = (params.session.selectedFiles?.length ?? 0) > 0;
	const hasSelectedFolders = (params.session.selectedFolders?.length ?? 0) > 0;
	const selectionKind = resolveSelectionKind({
		hasSelectedText,
		hasSelectedFiles,
		hasSelectedFolders,
	});
	const latestToolNames = collectLatestToolNames(params.session.messages);
	const recentDiscovery = collectRecentDiscovery(params.session.messages);
	const contextualFilePath = selectedTextFilePath ?? params.routingContext?.activeFilePath?.trim();
	const activeFilePath = contextualFilePath || undefined;
	const hasActiveFile = Boolean(activeFilePath);
	const hasContextualTarget = hasSelectedText
		|| hasSelectedFiles
		|| hasSelectedFolders
		|| (hasActiveFile && queryMentionsCurrentResource(params.query))
		|| Boolean(recentDiscovery?.hasResults && queryMentionsRecentResults(params.query));
	return {
		hasSelectedText,
		hasSelectedFiles,
		hasSelectedFolders,
		hasContextualTarget,
		hasActiveFile,
		activeFilePath,
		selectedTextFilePath,
		selectedTextRange,
		selectionKind,
		recentDiscovery,
		latestToolNames,
		workflowStage: resolveWorkflowStage(latestToolNames),
	};
};