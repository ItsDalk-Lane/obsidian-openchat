import type { SkillDefinition } from 'src/domains/skills/types';
import type { SubAgentDefinition } from 'src/tools/sub-agents/types';

export type SlashCommandType = 'skill' | 'agent';

export interface SlashCommandItem {
	name: string;
	description: string;
	type: SlashCommandType;
	definition: SkillDefinition | SubAgentDefinition;
}
