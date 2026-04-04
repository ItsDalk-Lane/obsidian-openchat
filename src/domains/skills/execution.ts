import { v4 as uuidv4 } from 'uuid';
import {
	DEFAULT_SKILL_EXECUTION_MODE,
} from './config';
import type { SkillScannerService } from './service';
import type {
	LoadedSkillContent,
	SkillDefinition,
	SkillExecutionMode,
	SkillQueryOptions,
} from './types';
import type {
	SkillInvocationFrame,
	SkillReturnPacket,
	SkillReturnStatus,
} from './session-state';

export type SkillExecutionTrigger =
	| 'slash_command'
	| 'invoke_skill'
	| 'manual_test';

export interface SkillExecutionRequest {
	readonly skillName: string;
	readonly args?: string;
	readonly executionMode?: SkillExecutionMode;
	readonly trigger?: SkillExecutionTrigger;
}

export interface SkillExecutionContext {
	readonly invocationId: string;
	readonly request: SkillExecutionRequest;
	readonly skill: SkillDefinition;
	readonly loadedSkill: LoadedSkillContent;
	readonly executionMode: SkillExecutionMode;
	readonly argsText: string;
	readonly invocationFrame?: SkillInvocationFrame;
}

export interface SkillExecutionRunResult {
	readonly content: string;
	readonly status?: SkillReturnStatus;
	readonly sessionId?: string | null;
	readonly messageCount?: number;
	readonly producedAt?: number;
	readonly metadata?: Record<string, unknown>;
}

export interface SkillExecutionSkillPort {
	findByName(name: string, options?: SkillQueryOptions): SkillDefinition | undefined;
	scan(): Promise<Awaited<ReturnType<SkillScannerService['scan']>>>;
	loadSkillContent(path: string): Promise<LoadedSkillContent>;
}

export interface SkillExecutionRuntimePort {
	executeInline(context: SkillExecutionContext): Promise<SkillExecutionRunResult>;
	executeIsolated(context: SkillExecutionContext): Promise<SkillExecutionRunResult>;
	freezeMainTask(input: {
		skillId: string;
		skillName: string;
		skillFilePath?: string;
		executionMode: SkillExecutionMode;
	}): SkillInvocationFrame;
	writeReturnPacket(input: {
		invocationId: string;
		status: SkillReturnStatus;
		content: string;
		sessionId?: string | null;
		messageCount?: number;
		producedAt?: number;
		metadata?: Record<string, unknown>;
	}): SkillInvocationFrame;
	restoreMainTask(): SkillReturnPacket | null;
}

const resolveSkill = async (
	skillPort: SkillExecutionSkillPort,
	skillName: string,
): Promise<{ skill?: SkillDefinition; disabledSkill?: SkillDefinition }> => {
	const trimmedName = skillName.trim();
	if (!trimmedName) {
		return {};
	}
	const matched = skillPort.findByName(trimmedName);
	if (matched) {
		return { skill: matched };
	}
	await skillPort.scan();
	const refreshed = skillPort.findByName(trimmedName);
	if (refreshed) {
		return { skill: refreshed };
	}
	const disabledSkill = skillPort.findByName(trimmedName, { includeDisabled: true });
	if (disabledSkill?.metadata.enabled === false) {
		return { disabledSkill };
	}
	return {};
};

const trimArgs = (args?: string): string => args?.trim() ?? '';

const ensureLoadedSkillHasBody = (
	skill: SkillDefinition,
	loadedSkill: LoadedSkillContent,
): string | null => {
	if (loadedSkill.bodyContent.trim()) {
		return null;
	}
	return `Skill "${skill.metadata.name}" 没有可用的内容。`;
};

const resolveExecutionMode = (
	request: SkillExecutionRequest,
	skill: SkillDefinition,
): SkillExecutionMode => {
	return request.executionMode
		?? skill.metadata.execution?.mode
		?? DEFAULT_SKILL_EXECUTION_MODE;
};

const buildPacket = (
	context: Pick<SkillExecutionContext, 'invocationId' | 'skill'>,
	runResult: SkillExecutionRunResult,
): SkillReturnPacket => ({
	invocationId: context.invocationId,
	skillId: context.skill.skillFilePath,
	skillName: context.skill.metadata.name,
	status: runResult.status ?? 'completed',
	content: runResult.content,
	sessionId: runResult.sessionId ?? null,
	messageCount: runResult.messageCount ?? 0,
	producedAt: runResult.producedAt ?? Date.now(),
	metadata: runResult.metadata,
});

const buildFailurePacket = (
	request: SkillExecutionRequest,
	content: string,
): SkillReturnPacket => ({
	invocationId: `skill-invocation-${uuidv4()}`,
	skillId: request.skillName.trim() || '__unknown__',
	skillName: request.skillName.trim() || '__unknown__',
	status: 'failed',
	content,
	sessionId: null,
	messageCount: 0,
	producedAt: Date.now(),
	metadata: {
		executionMode: request.executionMode ?? DEFAULT_SKILL_EXECUTION_MODE,
		trigger: request.trigger ?? 'manual_test',
	},
});

const buildDisabledSkillMessage = (skillName: string): string => {
	return `Skill "${skillName}" 当前已禁用，无法执行。`;
};

export class SkillExecutionService {
	constructor(
		private readonly skillPort: SkillExecutionSkillPort,
		private readonly runtimePort: SkillExecutionRuntimePort,
	) {}

	async execute(request: SkillExecutionRequest): Promise<SkillReturnPacket> {
		const trimmedName = request.skillName.trim();
		if (!trimmedName) {
			return buildFailurePacket(request, '缺少有效的 Skill 名称。');
		}
		try {
			const resolvedSkill = await resolveSkill(this.skillPort, trimmedName);
			if (!resolvedSkill.skill) {
				if (resolvedSkill.disabledSkill) {
					return buildFailurePacket(
						request,
						buildDisabledSkillMessage(resolvedSkill.disabledSkill.metadata.name),
					);
				}
				return buildFailurePacket(
					request,
					`未找到名为 "${trimmedName}" 的 Skill。`,
				);
			}
			const skill = resolvedSkill.skill;
			const loadedSkill = await this.skillPort.loadSkillContent(skill.skillFilePath);
			const emptyBodyMessage = ensureLoadedSkillHasBody(skill, loadedSkill);
			if (emptyBodyMessage) {
				return buildFailurePacket(request, emptyBodyMessage);
			}
			const executionMode = resolveExecutionMode(request, skill);
			const invocationId = `skill-invocation-${uuidv4()}`;
			const context: SkillExecutionContext = {
				invocationId,
				request,
				skill,
				loadedSkill,
				executionMode,
				argsText: trimArgs(request.args),
			};
			if (executionMode === 'inline') {
				return buildPacket(
					context,
					await this.runtimePort.executeInline(context),
				);
			}
			if (executionMode === 'isolated') {
				return buildPacket(
					context,
					await this.runtimePort.executeIsolated(context),
				);
			}
			return await this.executeIsolatedResume(context);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return buildFailurePacket(request, message);
		}
	}

	private async executeIsolatedResume(
		context: SkillExecutionContext,
	): Promise<SkillReturnPacket> {
		const invocationFrame = this.runtimePort.freezeMainTask({
			skillId: context.skill.skillFilePath,
			skillName: context.skill.metadata.name,
			skillFilePath: context.skill.skillFilePath,
			executionMode: context.executionMode,
		});
		try {
			const runResult = await this.runtimePort.executeIsolated({
				...context,
				invocationFrame,
			});
			const packet = buildPacket(context, runResult);
			this.runtimePort.writeReturnPacket({
				invocationId: invocationFrame.invocationId,
				status: packet.status,
				content: packet.content,
				sessionId: packet.sessionId,
				messageCount: packet.messageCount,
				producedAt: packet.producedAt,
				metadata: packet.metadata,
			});
			return this.runtimePort.restoreMainTask() ?? packet;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			const packet: SkillReturnPacket = {
				invocationId: invocationFrame.invocationId,
				skillId: context.skill.skillFilePath,
				skillName: context.skill.metadata.name,
				status: 'failed',
				content: message,
				sessionId: null,
				messageCount: 0,
				producedAt: Date.now(),
				metadata: {
					executionMode: context.executionMode,
					trigger: context.request.trigger ?? 'manual_test',
				},
			};
			this.runtimePort.writeReturnPacket({
				invocationId: invocationFrame.invocationId,
				status: packet.status,
				content: packet.content,
				sessionId: packet.sessionId,
				messageCount: packet.messageCount,
				producedAt: packet.producedAt,
				metadata: packet.metadata,
			});
			return this.runtimePort.restoreMainTask() ?? packet;
		}
	}
}
