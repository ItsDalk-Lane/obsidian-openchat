import type { UnitOfWork } from "@/lib/application/ports/unit-of-work";
import {
  createKernelEvent,
  createRunId,
  type Run,
  type RunId,
  type RuntimeContext,
  type RuntimeKind,
  type TaskId,
} from "@/lib/kernel";

export interface EnsurePiRunInput {
  sessionId: string;
  taskId: TaskId;
  createdAt?: string;
  updatedAt?: string;
  metadata?: Record<string, unknown>;
  allowTaskRebind?: boolean;
}

export class RunService {
  constructor(private readonly uow: UnitOfWork) {}

  listByTask(taskId: TaskId): Run[] {
    return this.uow.runs.listByTask(taskId);
  }

  getRuntimeContext(runtimeKind: RuntimeKind, nativeRuntimeId: string): RuntimeContext | null {
    const run = this.uow.runs.findByNativeRuntime(runtimeKind, nativeRuntimeId);
    if (!run) return null;
    return {
      taskId: run.taskId,
      runId: run.id,
      runtimeKind: run.runtimeKind,
      nativeRuntimeId: run.nativeRuntimeId,
    };
  }

  ensurePiRun(input: EnsurePiRunInput): RuntimeContext {
    return this.uow.transaction(({ tasks, runs, events }) => {
      const task = tasks.getById(input.taskId);
      if (!task) throw new Error("Task not found");

      const existing = runs.findByNativeRuntime("pi", input.sessionId);
      if (existing) {
        if (!input.allowTaskRebind && existing.taskId !== input.taskId) {
          throw new Error("Run already belongs to another task");
        }
        const updatedAt = input.updatedAt ?? new Date().toISOString();
        const nextRun: Run = {
          ...existing,
          taskId: task.id,
          status: existing.status === "closed" || existing.status === "interrupted" ? "idle" : existing.status,
          updatedAt,
          lastSeenAt: updatedAt,
          metadata: { ...existing.metadata, ...input.metadata },
        };
        runs.update(nextRun);
        if (!task.defaultRunId) {
          tasks.update({ ...task, defaultRunId: nextRun.id, updatedAt });
        }
        return {
          taskId: nextRun.taskId,
          runId: nextRun.id,
          runtimeKind: nextRun.runtimeKind,
          nativeRuntimeId: nextRun.nativeRuntimeId,
        };
      }

      const timestamp = input.createdAt ?? new Date().toISOString();
      const runId = createRunId(`pi:session:${input.sessionId}:default-run`);
      const run: Run = {
        id: runId,
        taskId: task.id,
        runtimeKind: "pi",
        nativeRuntimeId: input.sessionId,
        status: "idle",
        metadata: input.metadata,
        createdAt: timestamp,
        updatedAt: input.updatedAt ?? timestamp,
        lastSeenAt: input.updatedAt ?? timestamp,
      };
      runs.create(run);
      if (!task.defaultRunId) {
        tasks.update({
          ...task,
          defaultRunId: run.id,
          updatedAt: run.updatedAt,
        });
      }
      events.append(createKernelEvent(
        "run.created",
        run.taskId,
        run.id,
        { run: { id: run.id, runtimeKind: run.runtimeKind, nativeRuntimeId: run.nativeRuntimeId } },
        { kind: "system" },
      ), "durable");
      return {
        taskId: run.taskId,
        runId: run.id,
        runtimeKind: run.runtimeKind,
        nativeRuntimeId: run.nativeRuntimeId,
      };
    });
  }

  updateRunStatus(runId: RunId, status: Run["status"], options: { lastSeenAt?: string; emitInterruptedEvent?: boolean } = {}): Run | null {
    return this.uow.transaction(({ runs, events }) => {
      const existing = runs.getById(runId);
      if (!existing) return null;
      if (existing.status === status) {
        return existing;
      }
      const updatedAt = options.lastSeenAt ?? new Date().toISOString();
      const next = runs.update({
        ...existing,
        status,
        updatedAt,
        lastSeenAt: options.lastSeenAt ?? existing.lastSeenAt,
      });
      if (status === "interrupted") {
        events.append(createKernelEvent(
          "run.interrupted",
          next.taskId,
          next.id,
          { previousStatus: existing.status },
          { kind: "system" },
        ), "durable");
      } else {
        events.append(createKernelEvent(
          "run.status.changed",
          next.taskId,
          next.id,
          { previousStatus: existing.status, status: next.status },
          { kind: "system" },
        ), "durable");
      }
      return next;
    });
  }
}
