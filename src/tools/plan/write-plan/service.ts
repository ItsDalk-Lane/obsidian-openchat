import type { BuiltinValidationResult } from '../../runtime/types';
import { PlanState, type PlanUpdateInput } from '../../runtime/plan-state';
import type { WritePlanArgs, WritePlanResult } from './schema';

const countInProgressTasks = (tasks: readonly { status: string }[]): number => {
	return tasks.filter((task) => task.status === 'in_progress').length;
};

export const validateWritePlanInput = (
	args: WritePlanArgs,
): BuiltinValidationResult => {
	if (countInProgressTasks(args.tasks) > 1) {
		return {
			ok: false,
			summary: '同一时间只能有一个 in_progress 任务。',
		};
	}

	for (const [index, task] of args.tasks.entries()) {
		const needsOutcome = task.status === 'done' || task.status === 'skipped';
		if (!needsOutcome) {
			continue;
		}
		if (!task.outcome?.trim()) {
			return {
				ok: false,
				summary: `第 ${index + 1} 个任务在状态为 ${task.status} 时必须填写 outcome。`,
			};
		}
	}

	return { ok: true };
};

export const summarizeWritePlan = (
	args: Partial<WritePlanArgs>,
): string | null => {
	if (typeof args.title === 'string' && args.title.trim()) {
		return args.title.trim();
	}
	if (!Array.isArray(args.tasks) || args.tasks.length === 0) {
		return null;
	}
	return `${args.tasks.length} 个任务`;
};

export const describeWritePlanActivity = (
	args: Partial<WritePlanArgs>,
): string | null => {
	const summary = summarizeWritePlan(args);
	return summary ? `更新计划: ${summary}` : '更新当前会话计划';
};

export const executeWritePlan = (
	args: WritePlanArgs,
	planState: PlanState,
): WritePlanResult => {
	const update: PlanUpdateInput = {
		title: args.title,
		description: args.description,
		tasks: args.tasks,
	};
	return planState.update(update);
};
