import { z } from 'zod';
import type { BuiltinTool } from '../../runtime/types';
import { buildBuiltinTool } from '../../runtime/build-tool';
import { buildSkillToolDescription } from '../_shared/description';
import { skillReadOnlyAnnotations } from '../_shared/service';
import {
	describeInvokeSkillActivity,
	type ExecuteSkillExecution,
	executeInvokeSkill,
	type InvokeSkillResult,
	summarizeInvokeSkill,
	validateInvokeSkillInput,
} from './service';
import { invokeSkillToolSchema, type InvokeSkillArgs } from './schema';

export const INVOKE_SKILL_TOOL_NAME = 'invoke_skill';
export const LEGACY_INVOKE_SKILL_TOOL_NAME = 'Skill';

const skillReturnPacketSchema = z.object({
	invocationId: z.string(),
	skillId: z.string(),
	skillName: z.string(),
	status: z.enum(['completed', 'failed', 'cancelled']),
	content: z.string(),
	sessionId: z.string().nullable(),
	messageCount: z.number(),
	producedAt: z.number(),
	metadata: z.record(z.unknown()).optional(),
}).strict();

const invokeSkillResultSchema = z.object({
	status: z.enum(['completed', 'failed', 'cancelled']),
	message: z.string(),
	nextAction: z.string().nullable(),
	executionMode: z.string().nullable(),
	packet: skillReturnPacketSchema,
}).strict();

export const createInvokeSkillTool = (
	executeSkillExecution: ExecuteSkillExecution,
): BuiltinTool<InvokeSkillArgs, InvokeSkillResult> => buildBuiltinTool<
	InvokeSkillArgs,
	InvokeSkillResult
>({
	name: INVOKE_SKILL_TOOL_NAME,
	title: INVOKE_SKILL_TOOL_NAME,
	description: buildSkillToolDescription(),
	aliases: [LEGACY_INVOKE_SKILL_TOOL_NAME],
	inputSchema: invokeSkillToolSchema,
	outputSchema: invokeSkillResultSchema,
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
	execute: async (args) => await executeInvokeSkill(args, executeSkillExecution),
});
