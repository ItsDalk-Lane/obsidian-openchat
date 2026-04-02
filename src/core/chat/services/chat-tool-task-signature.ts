import type { ChatSession } from '../types/chat';
import type {
	TaskSignature,
	ToolRoutingAction,
	ToolRoutingConfidence,
	ToolRoutingEnvironmentContext,
	ToolRoutingScope,
	ToolRoutingRuntimeContext,
	ToolRoutingTargetExplicitness,
	ToolRoutingTargetKind,
	ToolRoutingWriteIntent,
} from './chat-tool-selection-types';
import {
	buildToolRoutingEnvironment,
	queryMentionsCurrentResource,
	queryMentionsRecentResults,
	queryMentionsSelection,
} from './chat-tool-routing-context';

interface BuildTaskSignatureInput {
	readonly query: string;
	readonly session: ChatSession;
	readonly routingContext?: ToolRoutingRuntimeContext;
}

const FILE_PATH_PATTERN = /(?:^|\s)([\w./-]+\.[a-z0-9]{1,8})(?:$|\s)/iu;
const DIRECTORY_HINT_PATTERN = /([\w./-]+)\s*(?:目录|folder|directory)/iu;
const URL_PATTERN = /https?:\/\/\S+/iu;
const SKILL_TARGET_PATTERN = /(?:^|\s)(?:skill|技能)\s+([a-z0-9._/-]+)/iu;
const SKILL_KEYWORD_PATTERN = /(?:^|\s)(?:skills?|技能)(?:\s|$)/iu;
const SUB_AGENT_TARGET_PATTERN = /(?:^|\s)(?:sub-agent|sub agent|agent|代理|子代理)\s+([a-z0-9._/-]+)/iu;
const SLASH_COMMAND_PATTERN = /(?:^|\s)\/(\w[\w-]*)\b/u;

const WRITE_TERMS = ['write', 'edit', 'update', 'create', 'modify', 'patch', 'append', 'insert', 'fix', '写入', '编辑', '更新', '创建', '修改'];
const DESTRUCTIVE_TERMS = ['delete', 'remove', 'destroy', 'overwrite', 'move', 'rename', '删除', '移除', '覆盖', '移动', '重命名'];
const READ_TERMS = ['read', 'open', 'show', 'inspect', 'summarize', 'explain', '读取', '打开', '查看', '总结', '解释'];
const SEARCH_CONTENT_TERMS = ['search', 'grep', 'regex', 'content', 'text', 'search in', '搜索', '检索', '正文', '文本'];
const LOCATE_TERMS = ['find', 'which', 'where', 'what did i write', '有哪些', '我之前', '记过', '查找', '定位', '列出'];
const METADATA_TERMS = ['tag', 'tags', 'task', 'tasks', 'metadata', 'frontmatter', 'property', 'properties', '标签', '任务', '元数据', '属性'];
const WEB_SEARCH_TERMS = ['web', 'internet', 'online', 'bing', '联网', '在线', '网页搜索'];
const WEB_FETCH_TERMS = ['fetch', 'crawl', '抓取', '网页正文', '页面内容'];
const TIME_TERMS = ['time', 'timezone', 'date', 'today', 'convert', '现在时间', '当前时间', '时间', '时区', '日期', '换算', '转换'];

const normalizeQuery = (value: string): string => value.toLowerCase().replace(/\s+/gu, ' ').trim();

const includesAny = (query: string, keywords: readonly string[]): boolean =>
	keywords.some((keyword) => query.includes(keyword));

const resolveTargetKind = (
	query: string,
	environment: ReturnType<typeof buildToolRoutingEnvironment>,
): ToolRoutingTargetKind => {
	if (URL_PATTERN.test(query)) {
		return 'url';
	}
	if (FILE_PATH_PATTERN.test(query)) {
		return 'file';
	}
	if (DIRECTORY_HINT_PATTERN.test(query)) {
		return 'directory';
	}
	if (SLASH_COMMAND_PATTERN.test(query) || SKILL_TARGET_PATTERN.test(query) || SKILL_KEYWORD_PATTERN.test(query)) {
		return 'skill';
	}
	if (
		SUB_AGENT_TARGET_PATTERN.test(query)
		|| query.includes('sub-agent')
		|| query.includes('sub agent')
		|| query.includes('子代理')
		|| (query.includes('委托') && query.includes('代理'))
	) {
		return 'sub-agent';
	}
	if (
		queryMentionsSelection(query)
		|| (environment.selectionKind === 'text' && (query.includes('解释') || query.includes('改写')))
	) {
		return 'selection';
	}
	if (environment.recentDiscovery?.hasResults && queryMentionsRecentResults(query)) {
		if (
			environment.recentDiscovery.toolName === 'query_index'
			&& environment.recentDiscovery.dataSource
			&& environment.recentDiscovery.dataSource !== 'file'
		) {
			return 'vault';
		}
		return environment.recentDiscovery.targetKind === 'unknown'
			? 'file'
			: environment.recentDiscovery.targetKind;
	}
	if (environment.hasActiveFile && queryMentionsCurrentResource(query)) {
		return 'file';
	}
	if (environment.hasContextualTarget) {
		if (environment.hasSelectedFolders) {
			return 'directory';
		}
		if (environment.hasSelectedFiles) {
			return 'file';
		}
		if (environment.hasSelectedText) {
			return 'selection';
		}
		return 'file';
	}
	if (query.includes('vault') || query.includes('仓库') || query.includes('项目')) {
		return 'vault';
	}
	if (query.includes('笔记') || query.includes('记录') || query.includes('notes')) {
		return 'vault';
	}
	if (query.includes('workspace') || query.includes('工作区')) {
		return 'workspace';
	}
	return 'unknown';
};

const resolveTargetExplicitness = (
	query: string,
	targetKind: ToolRoutingTargetKind,
	environment: ReturnType<typeof buildToolRoutingEnvironment>,
): ToolRoutingTargetExplicitness => {
	if (SLASH_COMMAND_PATTERN.test(query) || SKILL_TARGET_PATTERN.test(query) || SUB_AGENT_TARGET_PATTERN.test(query)) {
		return 'explicit';
	}
	if (
		targetKind === 'url'
		|| FILE_PATH_PATTERN.test(query)
		|| DIRECTORY_HINT_PATTERN.test(query)
	) {
		return 'explicit';
	}
	if (environment.hasActiveFile && queryMentionsCurrentResource(query)) {
		return 'contextual';
	}
	if (environment.recentDiscovery?.hasResults && queryMentionsRecentResults(query)) {
		return 'contextual';
	}
	if (environment.selectionKind !== 'none' && queryMentionsSelection(query)) {
		return 'contextual';
	}
	if (environment.hasContextualTarget) {
		return 'contextual';
	}
	return 'unknown';
};

const resolveScope = (query: string, targetKind: ToolRoutingTargetKind): ToolRoutingScope => {
	if (targetKind === 'url') {
		return 'external';
	}
	if (query.includes('整个 vault') || query.includes('全库') || query.includes('仓库里') || query.includes('整个项目')) {
		return 'vault';
	}
	if (query.includes('workspace') || query.includes('工作区')) {
		return 'workspace';
	}
	if (query.includes('笔记') || query.includes('记录') || query.includes('notes')) {
		return 'vault';
	}
	if (targetKind === 'vault') {
		return 'vault';
	}
	if (query.includes('多个') || query.includes('批量') || query.includes('several')) {
		return 'multi';
	}
	if (['file', 'directory', 'selection', 'skill', 'sub-agent', 'url'].includes(targetKind)) {
		return 'single';
	}
	return 'unknown';
};

const resolveWriteIntent = (query: string): ToolRoutingWriteIntent => {
	if (includesAny(query, DESTRUCTIVE_TERMS)) {
		return 'destructive';
	}
	if (includesAny(query, WRITE_TERMS)) {
		return 'safe';
	}
	return 'none';
};

const resolveWorkflowTool = (query: string): string | undefined => {
	if (query.includes('run shell') || query.includes('shell 命令') || query.includes('终端里执行')) {
		return 'run_shell';
	}
	if (query.includes('write plan') || query.includes('任务计划') || query.includes('待办事项')) {
		return 'write_plan';
	}
	if (SKILL_TARGET_PATTERN.test(query) || SLASH_COMMAND_PATTERN.test(query)) {
		return 'invoke_skill';
	}
	if (SKILL_KEYWORD_PATTERN.test(query)) {
		return 'discover_skills';
	}
	if (SUB_AGENT_TARGET_PATTERN.test(query)) {
		return 'delegate_sub_agent';
	}
	if (query.includes('sub-agent') || query.includes('sub agent') || query.includes('子代理') || (query.includes('委托') && query.includes('代理'))) {
		return 'discover_sub_agents';
	}
	return undefined;
};

const resolveNextAction = (params: {
	readonly query: string;
	readonly targetKind: ToolRoutingTargetKind;
	readonly targetExplicitness: ToolRoutingTargetExplicitness;
	readonly scope: ToolRoutingScope;
	readonly writeIntent: ToolRoutingWriteIntent;
	readonly workflowToolName?: string;
	readonly environment: ToolRoutingEnvironmentContext;
}): ToolRoutingAction => {
	if (params.workflowToolName) {
		return 'workflow';
	}
	if (params.targetKind === 'url') {
		return includesAny(params.query, WEB_SEARCH_TERMS) && !includesAny(params.query, WEB_FETCH_TERMS)
			? 'web-search'
			: 'web-fetch';
	}
	if (includesAny(params.query, WEB_FETCH_TERMS)) {
		return 'web-fetch';
	}
	if (includesAny(params.query, TIME_TERMS)) {
		return 'time';
	}
	if (params.writeIntent !== 'none' && params.targetExplicitness !== 'unknown') {
		return 'write';
	}
	if (includesAny(params.query, METADATA_TERMS)) {
		return 'metadata';
	}
	if (includesAny(params.query, WEB_SEARCH_TERMS)) {
		return 'web-search';
	}
	if (includesAny(params.query, SEARCH_CONTENT_TERMS) && params.targetExplicitness === 'unknown') {
		return 'search-content';
	}
	if (
		params.targetExplicitness === 'unknown'
		&& (includesAny(params.query, LOCATE_TERMS) || params.scope === 'vault')
	) {
		return 'locate';
	}
	if (
		params.environment.workflowStage === 'post-discovery'
		&& params.environment.recentDiscovery?.toolName === 'query_index'
		&& params.environment.recentDiscovery.dataSource
		&& params.environment.recentDiscovery.dataSource !== 'file'
		&& includesAny(params.query, READ_TERMS)
	) {
		return 'metadata';
	}
	if (
		params.environment.workflowStage === 'post-discovery'
		&& includesAny(params.query, READ_TERMS)
	) {
		return 'read';
	}
	if (includesAny(params.query, READ_TERMS) && params.targetExplicitness !== 'unknown') {
		return 'read';
	}
	if (params.writeIntent !== 'none') {
		return 'write';
	}
	if (params.targetKind === 'workspace') {
		return 'workspace';
	}
	return 'unknown';
};

const resolveConfidence = (params: {
	readonly nextAction: ToolRoutingAction;
	readonly targetExplicitness: ToolRoutingTargetExplicitness;
	readonly workflowToolName?: string;
	readonly writeIntent: ToolRoutingWriteIntent;
}): ToolRoutingConfidence => {
	if (
		params.workflowToolName
		|| params.writeIntent === 'destructive'
		|| params.targetExplicitness === 'explicit'
	) {
		return 'high';
	}
	if (params.nextAction === 'unknown' || params.targetExplicitness === 'unknown') {
		return 'medium';
	}
	return 'high';
};

export const buildTaskSignature = (input: BuildTaskSignatureInput): TaskSignature => {
	const normalizedQuery = normalizeQuery(input.query);
	const environment = buildToolRoutingEnvironment({
		query: normalizedQuery,
		session: input.session,
		routingContext: input.routingContext,
	});
	const targetKind = resolveTargetKind(normalizedQuery, environment);
	const targetExplicitness = resolveTargetExplicitness(normalizedQuery, targetKind, environment);
	const scope = resolveScope(normalizedQuery, targetKind);
	const writeIntent = resolveWriteIntent(normalizedQuery);
	const workflowToolName = resolveWorkflowTool(normalizedQuery);
	const nextAction = resolveNextAction({
		query: normalizedQuery,
		targetKind,
		targetExplicitness,
		scope,
		writeIntent,
		workflowToolName,
		environment,
	});
	const confidence = resolveConfidence({
		nextAction,
		targetExplicitness,
		workflowToolName,
		writeIntent,
	});
	const reasons: string[] = [];
	if (targetExplicitness === 'unknown') {
		reasons.push('target-not-yet-resolved');
	}
	if (writeIntent === 'destructive') {
		reasons.push('destructive-intent');
	}
	if (workflowToolName === 'invoke_skill') {
		reasons.push('explicit-skill-target');
	}
	if (workflowToolName === 'discover_skills' || workflowToolName === 'discover_sub_agents') {
		reasons.push('workflow-target-unknown');
	}
	if (environment.hasActiveFile && queryMentionsCurrentResource(normalizedQuery)) {
		reasons.push('active-file-context');
	}
	if (environment.recentDiscovery?.hasResults && queryMentionsRecentResults(normalizedQuery)) {
		reasons.push(`recent-discovery:${environment.recentDiscovery.toolName}`);
	}
	if (environment.recentDiscovery?.toolName === 'query_index' && environment.recentDiscovery.dataSource) {
		reasons.push(`recent-query-index:${environment.recentDiscovery.dataSource}`);
	}
	if (environment.recentDiscovery?.toolName === 'bing_search' && environment.recentDiscovery.queryText) {
		reasons.push('recent-bing-query');
	}
	if (environment.selectionKind !== 'none' && queryMentionsSelection(normalizedQuery)) {
		reasons.push('selection-context');
	}
	if (environment.selectedTextFilePath) {
		reasons.push('selection-file-context');
	}
	if (environment.selectedTextRange) {
		reasons.push('selection-range-context');
	}
	reasons.push(`workflow-stage:${environment.workflowStage}`);
	return {
		normalizedQuery,
		nextAction,
		targetKind,
		targetExplicitness,
		scope,
		writeIntent,
		confidence,
		explicitToolName: workflowToolName,
		environment,
		reasons,
	};
};