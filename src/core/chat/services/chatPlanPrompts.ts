import type { PlanSnapshot } from 'src/tools/runtime/plan-state';

const formatPlanTaskForPrompt = (
	task: PlanSnapshot['tasks'][number],
	index: number
): string => {
	const criteria =
		task.acceptance_criteria.length > 0
			? task.acceptance_criteria.join('；')
			: '无';
	const outcome = task.outcome ? `；outcome=${task.outcome}` : '';
	return `${index + 1}. [${task.status}] ${task.name}；acceptance=${criteria}${outcome}`;
};

export const buildLivePlanGuidance = (
	livePlan: PlanSnapshot | null | undefined
): string | null => {
	if (!livePlan || livePlan.summary.total === 0) {
		return null;
	}

	return [
		'当前会话存在一个 livePlan。',
		'你需要根据最新用户消息自行判断：用户是要继续执行当前计划、先调整计划，还是暂时不处理这个计划。',
		'如果用户要继续执行：沿用当前计划，保持计划身份不变，并按顺序逐项推进。',
		'如果用户要调整计划：先调用 write_plan 提交调整后的完整计划，再按新计划执行。',
		'如果用户当前并不是在处理这个计划：不要擅自推进或改写它。',
		'无论是调整计划还是宣称某个任务已完成/已跳过，都必须先用 write_plan 同步计划状态，再输出正文说明。',
	].join('\n');
};

export const buildLivePlanUserContext = (
	livePlan: PlanSnapshot | null | undefined
): string | null => {
	if (!livePlan || livePlan.summary.total === 0) {
		return null;
	}

	const prioritizedTask =
		livePlan.tasks.find((task) => task.status === 'in_progress')
		?? livePlan.tasks.find((task) => task.status === 'todo')
		?? null;

	return [
		'当前会话已有 livePlan。请结合最新用户消息自己判断：是继续原计划、先调整计划，还是忽略这个计划。',
		`计划标题：${livePlan.title}`,
		...(livePlan.description ? [`计划说明：${livePlan.description}`] : []),
		'当前计划任务：',
		...livePlan.tasks.map((task, index) => formatPlanTaskForPrompt(task, index)),
		`当前优先任务：${prioritizedTask?.name ?? '无'}`,
		'如果你决定继续原计划：保持标题、任务名、任务顺序和任务数量不变，并逐项推进。',
		'如果你决定调整计划：先调用 write_plan 提交新的完整计划，再继续执行。',
		'如果你决定暂时不处理这个计划：不要调用 write_plan 去推进它。',
	].join('\n');
};
