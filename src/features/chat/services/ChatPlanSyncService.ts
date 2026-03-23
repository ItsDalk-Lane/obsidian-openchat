import type { BuiltinToolsRuntime } from 'src/mcp/builtin/BuiltinToolsRuntime';
import { clonePlanSnapshot, type PlanSnapshot } from 'src/mcp/builtin/runtime/plan-state';
import {
	normalizeStructuredToolResult,
	serializeMcpToolResult,
} from 'src/mcp/builtin/runtime/tool-result';
import type { ChatSession } from '../types/chat';
import { HistoryService } from './HistoryService';
import { ChatStateStore } from './ChatStateStore';

const serializePlanSnapshot = (
	snapshot: PlanSnapshot | null | undefined
): string => JSON.stringify(snapshot ?? null);

const isTerminalPlanStatus = (
	status: PlanSnapshot['tasks'][number]['status']
): boolean => status === 'done' || status === 'skipped';

const createPlanSummary = (
	tasks: PlanSnapshot['tasks']
): PlanSnapshot['summary'] => {
	const summary = {
		total: tasks.length,
		todo: 0,
		inProgress: 0,
		done: 0,
		skipped: 0,
	};

	for (const task of tasks) {
		if (task.status === 'todo') summary.todo += 1;
		if (task.status === 'in_progress') summary.inProgress += 1;
		if (task.status === 'done') summary.done += 1;
		if (task.status === 'skipped') summary.skipped += 1;
	}

	return summary;
};

export class ChatPlanSyncService {
	private livePlanUnsubscribe: (() => void) | null = null;
	private pendingPlanSync: Promise<void> = Promise.resolve();

	constructor(
		private readonly stateStore: ChatStateStore,
		private readonly historyService: HistoryService,
	) {}

	attachRuntime(runtime: BuiltinToolsRuntime, session?: ChatSession | null): void {
		this.livePlanUnsubscribe?.();
		this.livePlanUnsubscribe = null;
		runtime.syncPlanSnapshot(clonePlanSnapshot(session?.livePlan ?? null));
		if (!session) {
			return;
		}

		this.livePlanUnsubscribe = runtime.onPlanChange((snapshot) => {
			const activeSession = this.stateStore.getMutableState().activeSession;
			if (!activeSession || activeSession.id !== session.id) {
				return;
			}

			const nextSnapshot = clonePlanSnapshot(snapshot);
			if (
				serializePlanSnapshot(activeSession.livePlan)
				=== serializePlanSnapshot(nextSnapshot)
			) {
				return;
			}

			activeSession.livePlan = nextSnapshot;
			this.stateStore.emit();
			void this.persistSessionPlanFrontmatter(activeSession);
		});
	}

	detachRuntime(): void {
		this.livePlanUnsubscribe?.();
		this.livePlanUnsubscribe = null;
	}

	queueSessionPlanSync(
		session: ChatSession | null,
		ensureRuntime: (session: ChatSession | null) => Promise<BuiltinToolsRuntime | null>
	): void {
		this.pendingPlanSync = this.pendingPlanSync
			.catch((error) => {
				console.warn('[ChatService] 前一个任务计划同步失败，继续执行后续同步:', error);
			})
			.then(async () => {
				const runtime = await ensureRuntime(session);
				if (!runtime) {
					return;
				}
				runtime.syncPlanSnapshot(clonePlanSnapshot(session?.livePlan ?? null));
			})
			.catch((error) => {
				console.warn('[ChatService] 同步任务计划失败:', error);
			});
	}

	async ensureReady(): Promise<void> {
		await this.pendingPlanSync.catch(() => undefined);
	}

	async persistSessionPlanFrontmatter(session: ChatSession): Promise<void> {
		const state = this.stateStore.getMutableState();
		if (!state.shouldSaveHistory || !session.filePath) {
			return;
		}

		try {
			await this.historyService.updateSessionFrontmatter(session.filePath, {
				livePlan: clonePlanSnapshot(session.livePlan ?? null),
			});
		} catch (error) {
			console.error('[ChatService] 持久化任务计划失败:', error);
		}
	}

	createBuiltinCallTool(
		runtime: BuiltinToolsRuntime,
		session?: ChatSession,
	): (name: string, args: Record<string, unknown>) => Promise<unknown> {
		let guardedPlanSnapshot = session && this.hasLivePlan(session)
			? clonePlanSnapshot(session.livePlan ?? null)
			: null;

		return async (name: string, args: Record<string, unknown>) => {
			let shouldRefreshGuardedPlan = false;
			if (guardedPlanSnapshot && name === 'write_plan') {
				shouldRefreshGuardedPlan = true;
				if (!this.isPlanRewriteRequest(guardedPlanSnapshot, args)) {
					this.validatePlanContinuationWritePlanArgs(guardedPlanSnapshot, args);
				}
			}

			const result = await runtime.getRegistry().call(
				name,
				args,
				runtime.getContext(),
			);
			if (shouldRefreshGuardedPlan) {
				const serialized = serializeMcpToolResult(
					normalizeStructuredToolResult(result),
				);
				const nextGuardedPlan = this.parsePlanSnapshotFromWritePlanResult(serialized);
				if (nextGuardedPlan) {
					guardedPlanSnapshot = nextGuardedPlan;
				}
			}
			return result;
		};
	}

	dispose(): void {
		this.detachRuntime();
	}

	private hasLivePlan(session: ChatSession): boolean {
		return Boolean(session.livePlan && session.livePlan.summary.total > 0);
	}

	private isPlanRewriteRequest(
		currentPlan: PlanSnapshot,
		args: Record<string, unknown>
	): boolean {
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
	}

	private validatePlanContinuationWritePlanArgs(
		currentPlan: PlanSnapshot,
		args: Record<string, unknown>
	): PlanSnapshot {
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

			const nextStatus = nextTaskInput.status;
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

		this.assertContinuePlanProgression(currentPlan, nextPlan);
		return nextPlan;
	}

	private parsePlanSnapshotFromWritePlanResult(result: string): PlanSnapshot | null {
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
				const status = task.status;
				if (
					status !== 'todo'
					&& status !== 'in_progress'
					&& status !== 'done'
					&& status !== 'skipped'
				) {
					throw new Error('invalid status');
				}

				const acceptanceCriteria = Array.isArray(task.acceptance_criteria)
					? task.acceptance_criteria.map((item) => String(item ?? '').trim()).filter(Boolean)
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
	}

	private assertContinuePlanProgression(
		currentPlan: PlanSnapshot,
		nextPlan: PlanSnapshot,
	): void {
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
	}
}