import type { SkillScannerService } from 'src/domains/skills/service';
import type { BuiltinTool } from '../../runtime/types';
import { buildBuiltinTool } from '../../runtime/build-tool';
import { DISCOVER_SKILLS_TOOL_DESCRIPTION } from '../_shared/description';
import { skillReadOnlyAnnotations } from '../_shared/service';
import {
	describeDiscoverSkillsActivity,
	executeDiscoverSkills,
	summarizeDiscoverSkills,
} from './service';
import {
	discoverSkillsToolSchema,
	type DiscoverSkillsArgs,
	type DiscoverSkillsResult,
} from './schema';

export const DISCOVER_SKILLS_TOOL_NAME = 'discover_skills';

export const createDiscoverSkillsTool = (
	scanner: SkillScannerService,
): BuiltinTool<DiscoverSkillsArgs, DiscoverSkillsResult | string> => buildBuiltinTool<
	DiscoverSkillsArgs,
	DiscoverSkillsResult | string
>({
	name: DISCOVER_SKILLS_TOOL_NAME,
	title: DISCOVER_SKILLS_TOOL_NAME,
	description: DISCOVER_SKILLS_TOOL_DESCRIPTION,
	inputSchema: discoverSkillsToolSchema,
	annotations: skillReadOnlyAnnotations,
	surface: {
		family: 'builtin.skill.discovery',
		visibility: 'candidate-only',
		argumentComplexity: 'low',
		riskLevel: 'read-only',
		oneLinePurpose: '列出当前可用的 Skill。',
		whenNotToUse: [
			'已经知道 skill 名称时直接用 invoke_skill',
		],
		capabilityTags: ['skill', 'skills', 'discover skills', '技能', '可用技能'],
		requiredArgsSummary: ['query'],
	},
	isReadOnly: () => true,
	getToolUseSummary: summarizeDiscoverSkills,
	getActivityDescription: describeDiscoverSkillsActivity,
	execute: async (args) => await executeDiscoverSkills(args, scanner),
});
