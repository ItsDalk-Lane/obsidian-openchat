import type { SkillExecutionRequest } from 'src/domains/skills/execution';
import type {
	SkillReturnPacket,
	SkillReturnStatus,
} from 'src/domains/skills/session-state';
import type { BuiltinValidationResult } from '../../runtime/types';
import { formatSkillToolError } from '../_shared/service';
import type { InvokeSkillArgs } from './schema';

export interface InvokeSkillResult {
	readonly status: SkillReturnStatus;
	readonly message: string;
	readonly nextAction: string | null;
	readonly executionMode: string | null;
	readonly packet: SkillReturnPacket;
}

export type ExecuteSkillExecution = (
	request: SkillExecutionRequest,
) => Promise<SkillReturnPacket>;

const buildUnexpectedFailurePacket = (
	skillName: string,
	message: string,
): SkillReturnPacket => ({
	invocationId: 'invoke-skill-tool-unexpected',
	skillId: '__unknown__',
	skillName: skillName || '__unknown__',
	status: 'failed',
	content: message,
	sessionId: null,
	messageCount: 0,
	producedAt: Date.now(),
	metadata: {
		trigger: 'invoke_skill',
	},
});

const isMissingSkillFailure = (packet: SkillReturnPacket): boolean => {
	return packet.status === 'failed' && packet.content.includes('未找到名为');
};

const resolveExecutionMode = (packet: SkillReturnPacket): string | null => {
	const executionMode = packet.metadata?.executionMode;
	return typeof executionMode === 'string' ? executionMode : null;
};

const buildMessage = (packet: SkillReturnPacket): string => {
	if (packet.status === 'completed') {
		return `Skill "${packet.skillName}" 执行完成。`;
	}
	if (packet.status === 'cancelled') {
		return `Skill "${packet.skillName}" 已取消。`;
	}
	if (isMissingSkillFailure(packet)) {
		return formatSkillToolError(`${packet.content} 请先调用 discover_skills。`);
	}
	return formatSkillToolError(packet.content);
};

const buildNextAction = (packet: SkillReturnPacket): string | null => {
	return isMissingSkillFailure(packet) ? '请先调用 discover_skills。' : null;
};

const buildInvokeSkillResult = (packet: SkillReturnPacket): InvokeSkillResult => ({
	status: packet.status,
	message: buildMessage(packet),
	nextAction: buildNextAction(packet),
	executionMode: resolveExecutionMode(packet),
	packet,
});

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
	executeSkillExecution: ExecuteSkillExecution,
): Promise<InvokeSkillResult> => {
	const skillName = args.skill.trim();
	try {
		return buildInvokeSkillResult(await executeSkillExecution({
			skillName,
			args: args.args,
			trigger: 'invoke_skill',
		}));
	} catch (error) {
		return buildInvokeSkillResult(
			buildUnexpectedFailurePacket(
				skillName,
				error instanceof Error ? error.message : String(error),
			),
		);
	}
};
