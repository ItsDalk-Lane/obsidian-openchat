import {
	clonePlanSnapshot,
	type PlanSnapshot,
	type PlanTaskStatus,
} from 'src/tools/runtime/plan-state';
import type { ChatMessage } from '../types/chat';

const PLAN_PROGRESS_RANK: Record<PlanTaskStatus, number> = {
	todo: 0,
	in_progress: 1,
	done: 2,
	skipped: 2,
};

/**
 * Plan 快照解析器：负责 Plan 数据的解析、比较和合并逻辑。
 * 无状态，所有方法均为纯函数。
 */
export class PlanSnapshotResolver {
	private isPlanTaskStatus(value: unknown): value is PlanTaskStatus {
		return (
			value === 'todo'
			|| value === 'in_progress'
			|| value === 'done'
			|| value === 'skipped'
		);
	}

	parsePlanSnapshot(value: unknown): PlanSnapshot | null {
		if (!value || typeof value !== 'object') {
			return null;
		}

		const candidate = value as Record<string, unknown>;
		if (typeof candidate.title !== 'string' || !candidate.title.trim()) {
			return null;
		}

		if (!Array.isArray(candidate.tasks) || !candidate.summary || typeof candidate.summary !== 'object') {
			return null;
		}

		const tasks = candidate.tasks
			.map((task) => {
				if (!task || typeof task !== 'object') {
					return null;
				}

				const item = task as Record<string, unknown>;
				if (typeof item.name !== 'string' || !this.isPlanTaskStatus(item.status)) {
					return null;
				}

				return {
					name: item.name,
					status: item.status,
					acceptance_criteria: Array.isArray(item.acceptance_criteria)
						? item.acceptance_criteria
							.filter((criteria): criteria is string => typeof criteria === 'string')
						: [],
					...(typeof item.outcome === 'string' ? { outcome: item.outcome } : {}),
				};
			})
			.filter((task): task is PlanSnapshot['tasks'][number] => task !== null);

		const summary = candidate.summary as Record<string, unknown>;
		const summaryValues = {
			total: Number(summary.total),
			todo: Number(summary.todo),
			inProgress: Number(summary.inProgress),
			done: Number(summary.done),
			skipped: Number(summary.skipped),
		};

		if (Object.values(summaryValues).some((item) => !Number.isFinite(item))) {
			return null;
		}

		return clonePlanSnapshot({
			title: candidate.title.trim(),
			...(typeof candidate.description === 'string' && candidate.description.trim()
				? { description: candidate.description.trim() }
				: {}),
			tasks,
			summary: summaryValues,
		});
	}

	extractLatestPlanSnapshot(messages: ChatMessage[]): PlanSnapshot | null {
		for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
			const toolCalls = messages[messageIndex].toolCalls ?? [];
			for (let toolIndex = toolCalls.length - 1; toolIndex >= 0; toolIndex -= 1) {
				const call = toolCalls[toolIndex];
				if (call.name !== 'write_plan' || typeof call.result !== 'string' || !call.result.trim()) {
					continue;
				}
				try {
					const parsed = JSON.parse(call.result);
					const snapshot = this.parsePlanSnapshot(parsed);
					if (snapshot) {
						return snapshot;
					}
				} catch {
					continue;
				}
			}
		}

		return null;
	}

	arePlansComparable(
		left: PlanSnapshot | null,
		right: PlanSnapshot | null
	): left is PlanSnapshot & {} {
		if (!left || !right) {
			return false;
		}

		if (left.title !== right.title || left.tasks.length !== right.tasks.length) {
			return false;
		}

		return left.tasks.every(
			(task, index) =>
				task.name === right.tasks[index]?.name
				&& task.acceptance_criteria.length === right.tasks[index]?.acceptance_criteria.length
				&& task.acceptance_criteria.every(
					(criteria, criteriaIndex) =>
						criteria === right.tasks[index]?.acceptance_criteria[criteriaIndex]
				)
		);
	}

	isPlanAhead(candidate: PlanSnapshot, baseline: PlanSnapshot): boolean {
		let hasForwardProgress = false;

		for (let index = 0; index < candidate.tasks.length; index += 1) {
			const candidateRank = PLAN_PROGRESS_RANK[candidate.tasks[index].status];
			const baselineRank = PLAN_PROGRESS_RANK[baseline.tasks[index].status];
			if (candidateRank < baselineRank) {
				return false;
			}
			if (candidateRank > baselineRank) {
				hasForwardProgress = true;
			}
		}

		return hasForwardProgress;
	}

	resolveLivePlan(
		persistedPlan: PlanSnapshot | null,
		messagePlan: PlanSnapshot | null
	): PlanSnapshot | null {
		if (!persistedPlan) {
			return messagePlan;
		}
		if (!messagePlan) {
			return persistedPlan;
		}

		if (JSON.stringify(persistedPlan) === JSON.stringify(messagePlan)) {
			return persistedPlan;
		}

		if (!this.arePlansComparable(persistedPlan, messagePlan)) {
			return persistedPlan;
		}

		if (this.isPlanAhead(messagePlan, persistedPlan)) {
			return clonePlanSnapshot(messagePlan);
		}

		return persistedPlan;
	}
}
