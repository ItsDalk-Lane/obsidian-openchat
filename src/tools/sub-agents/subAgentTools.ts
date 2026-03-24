import type { ToolDefinition } from 'src/types/tool';
import type { SubAgentDefinition } from './types';
import { buildSubAgentToolName } from './types';

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
					description: '需要 Sub Agent 完成的具体任务描述',
				},
			},
			required: ['task'],
			additionalProperties: false,
		},
		source: 'sub_agent',
		sourceId: definition.metadata.name,
	};
};

export const subAgentDefinitionsToTools = (definitions: SubAgentDefinition[]): ToolDefinition[] => {
	return definitions.map(subAgentToToolDefinition);
};
