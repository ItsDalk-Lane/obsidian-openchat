import type { BuiltinToolsRuntime } from 'src/tools/runtime/BuiltinToolsRuntime';
import { clonePlanSnapshot, type PlanSnapshot } from 'src/tools/runtime/plan-state';
import {
	normalizeStructuredToolResult,
	serializeMcpToolResult,
} from 'src/tools/runtime/tool-result';
import type { ChatSession } from '../types/chat';
import { HistoryService } from './history-service';
import { ChatStateStore } from './chat-state-store';
import { DebugLogger } from 'src/utils/DebugLogger';
import {
	assertContinuePlanProgression,
	createPlanSummary,
	isPlanRewriteRequest,
	isTerminalPlanStatus,
	parsePlanSnapshotFromWritePlanResult,
	serializePlanSnapshot,
	validatePlanContinuationWritePlanArgs,
} from './chat-plan-sync-rules';

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
				DebugLogger.warn('[ChatService] 前一个任务计划同步失败，继续执行后续同步:', error);
			})
			.then(async () => {
				const runtime = await ensureRuntime(session);
				if (!runtime) {
					return;
				}
				runtime.syncPlanSnapshot(clonePlanSnapshot(session?.livePlan ?? null));
			})
			.catch((error) => {
				DebugLogger.warn('[ChatService] 同步任务计划失败:', error);
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
			DebugLogger.error('[ChatService] 持久化任务计划失败:', error);
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
				if (!isPlanRewriteRequest(guardedPlanSnapshot, args)) {
					validatePlanContinuationWritePlanArgs(guardedPlanSnapshot, args);
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
				const nextGuardedPlan = parsePlanSnapshotFromWritePlanResult(serialized);
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
}
