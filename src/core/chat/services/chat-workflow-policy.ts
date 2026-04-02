import { INVOKE_SKILL_TOOL_NAME } from 'src/tools/skill/skill-tools';
import {
	DELEGATE_SUB_AGENT_TOOL_NAME,
	SUB_AGENT_TOOL_PREFIX,
} from 'src/tools/sub-agents/types';
import type { DiscoveryEntry } from './chat-tool-selection-types';

interface WorkflowIntentMatcher {
	readonly toolName: string;
	readonly anyOf?: readonly string[];
	readonly requiresAll?: readonly (readonly string[])[];
}

const normalizeText = (value: string): string => value.toLowerCase();

const escapeRegex = (value: string): string => {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

const isStandaloneIdentifier = (keyword: string): boolean => {
	return /[_-]/.test(keyword);
};

const isAsciiWord = (keyword: string): boolean => {
	return /^[a-z][a-z\s]+$/.test(keyword);
};

const includesKeyword = (text: string, keyword: string): boolean => {
	const normalizedKeyword = normalizeText(keyword).trim();
	if (!normalizedKeyword) {
		return false;
	}
	if (isStandaloneIdentifier(normalizedKeyword)) {
		const pattern = new RegExp(
			`(^|[^a-z0-9_.-])${escapeRegex(normalizedKeyword)}($|[^a-z0-9_.-])`,
		);
		return pattern.test(text);
	}
	if (isAsciiWord(normalizedKeyword)) {
		const pattern = new RegExp(
			`(^|[^a-z0-9_.-])${escapeRegex(normalizedKeyword)}($|[^a-z0-9_.-])`,
		);
		return pattern.test(text);
	}
	return text.includes(normalizedKeyword);
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
			['run', 'execute', 'use', '调用', '使用', '执行', '运行', '打开'],
			['shell', 'terminal', 'bash', 'zsh', 'command', '终端', '命令行', '命令'],
		],
		anyOf: ['run_shell'],
	},
	{
		toolName: 'run_script',
		requiresAll: [
			['run', 'execute', 'use', '调用', '使用', '执行', '运行'],
				['script', 'workflow', 'orchestrate', '脚本', '编排'],
		],
		anyOf: ['run_script'],
	},
	{
		toolName: 'write_plan',
		requiresAll: [
			['write', 'update', 'maintain', '调用', '使用', '写', '更新', '维护'],
			['todo', 'task plan', 'plan', '待办', '计划'],
		],
		anyOf: ['write_plan'],
	},
	{
		toolName: INVOKE_SKILL_TOOL_NAME,
		requiresAll: [
			['run', 'invoke', 'use', '调用', '使用', '运行', '执行'],
			['skill', 'skills', '技能'],
		],
		anyOf: [INVOKE_SKILL_TOOL_NAME],
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
		|| entry.toolName === DELEGATE_SUB_AGENT_TOOL_NAME
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
	if (matcher) {
		return false;
	}

	if (
		entry.toolName === DELEGATE_SUB_AGENT_TOOL_NAME
		|| entry.toolName.startsWith(SUB_AGENT_TOOL_PREFIX)
	) {
		return includesAnyKeyword(normalizedQuery, SUB_AGENT_INTENT_TERMS)
			|| getEntryTerms(entry).some((term) => normalizedQuery.includes(term));
	}

	return getEntryTerms(entry)
		.filter((term) => term.length >= 4)
		.some((term) => normalizedQuery.includes(term));
};