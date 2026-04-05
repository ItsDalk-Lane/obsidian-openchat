import type { ToolDefinition } from 'src/types/tool';
import type { SubAgentDefinition } from './types';
import {
	DELEGATE_SUB_AGENT_TOOL_NAME,
	DISCOVER_SUB_AGENTS_TOOL_NAME,
	MAX_SUB_AGENT_NAME_LENGTH,
	MAX_SUB_AGENT_QUERY_LENGTH,
	MAX_SUB_AGENT_TASK_LENGTH,
	buildSubAgentToolName,
} from './types';

/**
 * Sub-Agent 工具刻意维持在 ToolDefinition + ToolExecutor 体系中，
 * 不参与 BuiltinTool 迁移主线。
 */
export const subAgentToToolDefinition = (definition: SubAgentDefinition): ToolDefinition => {
	return {
		name: buildSubAgentToolName(definition.metadata.name),
		title: definition.metadata.name,
		description: definition.metadata.description,
		inputSchema: {
			type: 'object',
			properties: {
				task: {
					type: 'string',
					minLength: 1,
					maxLength: MAX_SUB_AGENT_TASK_LENGTH,
					description: '需要 Sub Agent 完成的具体任务描述',
				},
			},
			required: ['task'],
			additionalProperties: false,
		},
		source: 'sub_agent',
		sourceId: definition.metadata.name,
		execution: {
			kind: 'sub-agent',
			target: definition.metadata.name,
		},
	};
};

export const createDiscoverSubAgentsToolDefinition = (): ToolDefinition => {
	return {
		name: DISCOVER_SUB_AGENTS_TOOL_NAME,
		title: DISCOVER_SUB_AGENTS_TOOL_NAME,
		description: '列出当前可用的 Sub-Agent，供后续选择合适的委托目标。',
		inputSchema: {
			type: 'object',
			properties: {
				query: {
					type: 'string',
					maxLength: MAX_SUB_AGENT_QUERY_LENGTH,
					description: '可选过滤词，用于缩小返回的 Sub-Agent 列表。',
				},
			},
			additionalProperties: false,
		},
		source: 'custom',
		sourceId: 'sub-agents',
		execution: {
			kind: 'custom',
			target: 'discover_sub_agents',
		},
	};
};

export const createDelegateSubAgentToolDefinition = (): ToolDefinition => {
	return {
		name: DELEGATE_SUB_AGENT_TOOL_NAME,
		title: DELEGATE_SUB_AGENT_TOOL_NAME,
		description: '把任务委托给一个已知的 Sub-Agent 执行。',
		inputSchema: {
			type: 'object',
			properties: {
				agent: {
					type: 'string',
					minLength: 1,
					maxLength: MAX_SUB_AGENT_NAME_LENGTH,
					description: '要委托的 Sub-Agent 名称，先用 discover_sub_agents 确认名称。',
				},
				task: {
					type: 'string',
					minLength: 1,
					maxLength: MAX_SUB_AGENT_TASK_LENGTH,
					description: '需要 Sub-Agent 完成的具体任务描述。',
				},
			},
			required: ['agent', 'task'],
			additionalProperties: false,
		},
		source: 'workflow',
		sourceId: 'sub-agents',
		execution: {
			kind: 'workflow',
			target: DELEGATE_SUB_AGENT_TOOL_NAME,
		},
	};
};
