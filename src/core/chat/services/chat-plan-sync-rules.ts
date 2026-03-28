import type { PlanSnapshot } from 'src/tools/runtime/plan-state';

export const serializePlanSnapshot = (
	snapshot: PlanSnapshot | null | undefined,
): string => JSON.stringify(snapshot ?? null);

export const isTerminalPlanStatus = (
	status: PlanSnapshot['tasks'][number]['status'],
): boolean => status === 'done' || status === 'skipped';

export const createPlanSummary = (
	tasks: PlanSnapshot['tasks'],
): PlanSnapshot['summary'] => {
	const summary = {
		total: tasks.length,
		todo: 0,
		inProgress: 0,
		done: 0,
		skipped: 0,
	};
	for (const task of tasks) {
		if (task.status === 'todo') {
			summary.todo += 1;
		}
		if (task.status === 'in_progress') {
			summary.inProgress += 1;
		}
		if (task.status === 'done') {
			summary.done += 1;
		}
		if (task.status === 'skipped') {
			summary.skipped += 1;
		}
	}
	return summary;
};

export const isPlanRewriteRequest = (
	currentPlan: PlanSnapshot,
	args: Record<string, unknown>,
): boolean => {
	const nextTitle =
		typeof args.title === 'string' && args.title.trim()
			? args.title.trim()
			: currentPlan.title;
	if (nextTitle !== currentPlan.title) {
		return true;
	}
	const currentDescription = currentPlan.description?.trim() ?? '';
	const nextDescription =
		typeof args.description === 'string' && args.description.trim()
			? args.description.trim()
			: currentDescription;
	if (nextDescription !== currentDescription) {
		return true;
	}
	if (!Array.isArray(args.tasks) || args.tasks.length !== currentPlan.tasks.length) {
		return true;
	}
	return args.tasks.some((taskInput, index) => {
		if (!taskInput || typeof taskInput !== 'object') {
			return false;
		}
		const nextTaskInput = taskInput as Record<string, unknown>;
		const currentTask = currentPlan.tasks[index];
		const nextName = String(nextTaskInput.name ?? '').trim();
		if (nextName !== currentTask.name) {
			return true;
		}
		if (!Array.isArray(nextTaskInput.acceptance_criteria)) {
			return true;
		}
		const nextCriteria = nextTaskInput.acceptance_criteria
			.map((item) => String(item ?? '').trim())
			.filter(Boolean);
		return (
			nextCriteria.length !== currentTask.acceptance_criteria.length
			|| nextCriteria.some(
				(item, criteriaIndex) => item !== currentTask.acceptance_criteria[criteriaIndex],
			)
		);
	});
};

export const parsePlanSnapshotFromWritePlanResult = (
	result: string,
): PlanSnapshot | null => {
	try {
		const parsed = JSON.parse(result) as Record<string, unknown>;
		if (typeof parsed.title !== 'string' || !Array.isArray(parsed.tasks)) {
			return null;
		}
		const tasks = parsed.tasks.map((taskInput) => {
			if (!taskInput || typeof taskInput !== 'object') {
				throw new Error('invalid task');
			}
			const task = taskInput as Record<string, unknown>;
			const status = task.status as PlanSnapshot['tasks'][number]['status'];
			if (
				status !== 'todo'
				&& status !== 'in_progress'
				&& status !== 'done'
				&& status !== 'skipped'
			) {
				throw new Error('invalid status');
			}
			const acceptanceCriteria = Array.isArray(task.acceptance_criteria)
				? task.acceptance_criteria
					.map((item) => String(item ?? '').trim())
					.filter(Boolean)
				: [];
			const outcome = String(task.outcome ?? '').trim();
			return {
				name: String(task.name ?? '').trim(),
				status,
				acceptance_criteria: acceptanceCriteria,
				...(outcome ? { outcome } : {}),
			};
		});
		const description = String(parsed.description ?? '').trim();
		return {
			title: parsed.title.trim(),
			...(description ? { description } : {}),
			tasks,
			summary: createPlanSummary(tasks),
		};
	} catch {
		return null;
	}
};

export const assertContinuePlanProgression = (
	currentPlan: PlanSnapshot,
	nextPlan: PlanSnapshot,
): void => {
	let terminalTransitions = 0;
	let firstNonTerminalIndex = -1;
	let inProgressCount = 0;
	for (let index = 0; index < nextPlan.tasks.length; index += 1) {
		const currentTask = currentPlan.tasks[index];
		const nextTask = nextPlan.tasks[index];
		if (!isTerminalPlanStatus(currentTask.status) && isTerminalPlanStatus(nextTask.status)) {
			terminalTransitions += 1;
		}
		if (!isTerminalPlanStatus(nextTask.status) && firstNonTerminalIndex === -1) {
			firstNonTerminalIndex = index;
		}
		if (nextTask.status === 'in_progress') {
			inProgressCount += 1;
		}
	}
	if (terminalTransitions > 1) {
		throw new Error('沿用当前计划推进任务时，一次 write_plan 只能完成或跳过一个任务。');
	}
	if (inProgressCount > 1) {
		throw new Error('沿用当前计划推进任务时，同一时间只能保留一个 in_progress 任务。');
	}
	if (firstNonTerminalIndex === -1) {
		return;
	}
	for (let index = firstNonTerminalIndex + 1; index < nextPlan.tasks.length; index += 1) {
		if (nextPlan.tasks[index].status !== 'todo') {
			throw new Error('沿用当前计划推进任务时，后续任务必须按原顺序保留为 todo，不能提前完成、跳过或启动。');
		}
	}
};

export const validatePlanContinuationWritePlanArgs = (
	currentPlan: PlanSnapshot,
	args: Record<string, unknown>,
): PlanSnapshot => {
	const nextTitle =
		typeof args.title === 'string' && args.title.trim()
			? args.title.trim()
			: currentPlan.title;
	if (nextTitle !== currentPlan.title) {
		throw new Error('沿用当前计划推进任务时，write_plan 不允许改标题；如果要改计划，请直接提交新的完整计划。');
	}
	const currentDescription = currentPlan.description?.trim() ?? '';
	const nextDescription =
		typeof args.description === 'string' && args.description.trim()
			? args.description.trim()
			: currentDescription;
	if (nextDescription !== currentDescription) {
		throw new Error('沿用当前计划推进任务时，write_plan 不允许改写计划描述；如果要改计划，请直接提交新的完整计划。');
	}
	if (!Array.isArray(args.tasks) || args.tasks.length !== currentPlan.tasks.length) {
		throw new Error('沿用当前计划推进任务时，write_plan 必须保留原计划的任务数量。');
	}
	const nextTasks = args.tasks.map((taskInput, index) => {
		if (!taskInput || typeof taskInput !== 'object') {
			throw new Error(`沿用当前计划推进任务时，第 ${index + 1} 个任务必须是对象。`);
		}
		const nextTaskInput = taskInput as Record<string, unknown>;
		const currentTask = currentPlan.tasks[index];
		const nextName = String(nextTaskInput.name ?? '').trim();
		if (nextName !== currentTask.name) {
			throw new Error('沿用当前计划推进任务时，write_plan 不允许改任务名称或任务顺序。');
		}
		const nextStatus = nextTaskInput.status as PlanSnapshot['tasks'][number]['status'];
		if (
			nextStatus !== 'todo'
			&& nextStatus !== 'in_progress'
			&& nextStatus !== 'done'
			&& nextStatus !== 'skipped'
		) {
			throw new Error(`沿用当前计划推进任务时，第 ${index + 1} 个任务状态非法。`);
		}
		if (!Array.isArray(nextTaskInput.acceptance_criteria)) {
			throw new Error('沿用当前计划推进任务时，write_plan 必须完整保留每个任务的 acceptance_criteria。');
		}
		const nextCriteria = nextTaskInput.acceptance_criteria
			.map((item) => String(item ?? '').trim())
			.filter(Boolean);
		if (
			nextCriteria.length !== currentTask.acceptance_criteria.length
			|| nextCriteria.some(
				(item, criteriaIndex) => item !== currentTask.acceptance_criteria[criteriaIndex],
			)
		) {
			throw new Error('沿用当前计划推进任务时，write_plan 不允许改写任务验收标准。');
		}
		const nextOutcome = String(nextTaskInput.outcome ?? '').trim();
		if (isTerminalPlanStatus(nextStatus) && !nextOutcome) {
			throw new Error(`沿用当前计划推进任务时，第 ${index + 1} 个已完成/已跳过任务必须带 outcome。`);
		}
		if (isTerminalPlanStatus(currentTask.status)) {
			if (nextStatus !== currentTask.status) {
				throw new Error('沿用当前计划推进任务时，已完成或已跳过的任务不允许回退。');
			}
			if ((currentTask.outcome ?? '') !== nextOutcome) {
				throw new Error('沿用当前计划推进任务时，已完成或已跳过任务的 outcome 不允许改写。');
			}
		}
		return {
			name: currentTask.name,
			status: nextStatus,
			acceptance_criteria: nextCriteria,
			...(nextOutcome ? { outcome: nextOutcome } : {}),
		};
	});
	const nextPlan: PlanSnapshot = {
		title: currentPlan.title,
		...(currentDescription ? { description: currentDescription } : {}),
		tasks: nextTasks,
		summary: createPlanSummary(nextTasks),
	};
	assertContinuePlanProgression(currentPlan, nextPlan);
	return nextPlan;
};
