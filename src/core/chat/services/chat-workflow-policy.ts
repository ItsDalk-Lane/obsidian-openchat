import { SKILL_TOOL_NAME } from 'src/tools/skill/skill-tools';
import { SUB_AGENT_TOOL_PREFIX } from 'src/tools/sub-agents/types';
import type { DiscoveryEntry } from './chat-tool-selection-types';

interface WorkflowIntentMatcher {
	readonly toolName: string;
	readonly anyOf?: readonly string[];
	readonly requiresAll?: readonly (readonly string[])[];
}

const normalizeText = (value: string): string => value.toLowerCase();

const includesKeyword = (text: string, keyword: string): boolean => {
	return text.includes(normalizeText(keyword));
};

const includesAnyKeyword = (text: string, keywords: readonly string[]): boolean => {
	return keywords.some((keyword) => includesKeyword(text, keyword));
};

const matchesAllKeywordGroups = (
	text: string,
	groups: readonly (readonly string[])[],
): boolean => {
	return groups.every((group) => includesAnyKeyword(text, group));
};

const WORKFLOW_INTENT_MATCHERS: readonly WorkflowIntentMatcher[] = [
	{
		toolName: 'run_shell',
		requiresAll: [
			['run', 'execute', 'use', '调用', '执行', '运行', '打开'],
			['shell', 'terminal', 'bash', 'zsh', 'command', '终端', '命令行', '命令'],
		],
		anyOf: ['run_shell'],
	},
	{
		toolName: 'run_script',
		anyOf: ['run_script', 'orchestrate', 'workflow', '编排', '脚本工作流'],
	},
	{
		toolName: 'write_plan',
		anyOf: ['write_plan', 'todo', 'task plan', 'plan', '更新计划', '写计划', '任务计划'],
	},
	{
		toolName: SKILL_TOOL_NAME,
		anyOf: ['skill', 'skills', '技能'],
	},
];

const SUB_AGENT_INTENT_TERMS = [
	'sub-agent',
	'sub agent',
	'delegate',
	'delegation',
	'agent',
	'委托',
	'代理',
	'子代理',
];

const getEntryTerms = (entry: DiscoveryEntry): string[] => {
	return [entry.toolName, entry.displayName, ...entry.capabilityTags]
		.map((value) => normalizeText(value))
		.filter((value) => value.length > 0);
};

const getMatcherForEntry = (entry: DiscoveryEntry): WorkflowIntentMatcher | undefined => {
	return WORKFLOW_INTENT_MATCHERS.find((matcher) => matcher.toolName === entry.toolName);
};

export const isWorkflowDiscoveryEntry = (entry: DiscoveryEntry): boolean => {
	return entry.visibility === 'workflow-only'
		|| entry.source === 'workflow'
		|| entry.source === 'escape-hatch'
		|| entry.toolName.startsWith(SUB_AGENT_TOOL_PREFIX);
};

export const matchesWorkflowIntent = (query: string, entry: DiscoveryEntry): boolean => {
	const normalizedQuery = normalizeText(query);
	if (!normalizedQuery) {
		return false;
	}

	const matcher = getMatcherForEntry(entry);
	if (matcher?.anyOf && includesAnyKeyword(normalizedQuery, matcher.anyOf)) {
		return true;
	}
	if (matcher?.requiresAll && matchesAllKeywordGroups(normalizedQuery, matcher.requiresAll)) {
		return true;
	}

	if (entry.toolName.startsWith(SUB_AGENT_TOOL_PREFIX)) {
		return includesAnyKeyword(normalizedQuery, SUB_AGENT_INTENT_TERMS)
			|| getEntryTerms(entry).some((term) => normalizedQuery.includes(term));
	}

	return getEntryTerms(entry)
		.filter((term) => term.length >= 4)
		.some((term) => normalizedQuery.includes(term));
};