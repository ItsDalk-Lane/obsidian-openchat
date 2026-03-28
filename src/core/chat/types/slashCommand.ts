import type { SkillDefinition } from 'src/domains/skills/types';
import type { SubAgentDefinition } from 'src/tools/sub-agents';

export type SlashCommandType = 'skill' | 'agent';

export interface SlashCommandItem {
	name: string;
	description: string;
	type: SlashCommandType;
	definition: SkillDefinition | SubAgentDefinition;
}

export interface SlashCommandMenuProps {
	items: SlashCommandItem[];
	filterText: string;
	visible: boolean;
	selectedIndex: number;
	menuPosition: { top: number; left: number };
	onSelect: (item: SlashCommandItem) => void;
	onClose: () => void;
	maxHeight?: number;
}
