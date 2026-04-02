import type { BuiltinValidationResult } from '../../runtime/types';
import {
	executeInvokeSkillBody,
	formatSkillToolError,
	formatSkillToolUnexpectedError,
} from '../_shared/service';
import type { SkillScannerService } from 'src/domains/skills/service';
import type { InvokeSkillArgs } from './schema';

export const validateInvokeSkillInput = (
	args: InvokeSkillArgs,
): BuiltinValidationResult => {
	if (!args.skill.trim()) {
		return {
			ok: false,
			summary: '缺少有效的 skill 参数。',
		};
	}
	return { ok: true };
};

export const summarizeInvokeSkill = (
	args: Partial<InvokeSkillArgs>,
): string | null => args.skill?.trim() || null;

export const describeInvokeSkillActivity = (
	args: Partial<InvokeSkillArgs>,
): string | null => {
	const skillName = args.skill?.trim();
	return skillName ? `加载 Skill: ${skillName}` : '加载 Skill workflow';
};

export const executeInvokeSkill = async (
	args: InvokeSkillArgs,
	scanner: SkillScannerService,
): Promise<string> => {
	const skillName = args.skill.trim();
	if (!skillName) {
		return formatSkillToolError('缺少有效的 skill 参数。');
	}
	try {
		return await executeInvokeSkillBody(scanner, skillName, args.args);
	} catch (error) {
		return formatSkillToolUnexpectedError(error);
	}
};
