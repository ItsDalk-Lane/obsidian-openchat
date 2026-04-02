import type { SkillScannerService } from 'src/domains/skills/service';
import { z } from 'zod';
import type { BuiltinTool } from '../../runtime/types';
import { buildBuiltinTool } from '../../runtime/build-tool';
import { buildSkillToolDescription } from '../_shared/description';
import { skillReadOnlyAnnotations } from '../_shared/service';
import {
	describeInvokeSkillActivity,
	executeInvokeSkill,
	summarizeInvokeSkill,
	validateInvokeSkillInput,
} from './service';
import { invokeSkillToolSchema, type InvokeSkillArgs } from './schema';

export const INVOKE_SKILL_TOOL_NAME = 'invoke_skill';
export const LEGACY_INVOKE_SKILL_TOOL_NAME = 'Skill';

export const createInvokeSkillTool = (
	scanner: SkillScannerService,
): BuiltinTool<InvokeSkillArgs, string> => buildBuiltinTool<InvokeSkillArgs, string>({
	name: INVOKE_SKILL_TOOL_NAME,
	title: INVOKE_SKILL_TOOL_NAME,
	description: buildSkillToolDescription(),
	aliases: [LEGACY_INVOKE_SKILL_TOOL_NAME],
	inputSchema: invokeSkillToolSchema,
	outputSchema: z.string(),
	annotations: skillReadOnlyAnnotations,
	surface: {
		family: 'workflow.skill',
		source: 'workflow',
		visibility: 'workflow-only',
		argumentComplexity: 'high',
		riskLevel: 'mutating',
		oneLinePurpose: '加载并执行复杂 Skill 工作流。',
		whenNotToUse: [
			'不知道 skill 名称时先用 discover_skills',
			'内置 slash 命令如 /help、/clear 不要用 invoke_skill',
		],
		capabilityTags: ['skill', 'workflow', '技能'],
		requiredArgsSummary: ['skill'],
	},
	isReadOnly: () => true,
	validateInput: (args) => validateInvokeSkillInput(args),
	getToolUseSummary: summarizeInvokeSkill,
	getActivityDescription: describeInvokeSkillActivity,
	execute: async (args) => await executeInvokeSkill(args, scanner),
});
