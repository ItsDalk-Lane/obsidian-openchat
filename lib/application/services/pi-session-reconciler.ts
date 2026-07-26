import { listAllSessions } from "@/lib/session-reader";
import type { SessionInfo } from "@/lib/types";
import type { UnitOfWork } from "@/lib/application/ports/unit-of-work";
import { createKernelEvent, type RuntimeContext, type Task, type TaskId } from "@/lib/kernel";
import { getPiRunId, getPiTaskId } from "@/lib/adapters/pi/pi-task-projector";
import { RunService } from "./run-service";

function deriveTitle(session: Pick<SessionInfo, "id" | "name" | "firstMessage">): Pick<Task, "title" | "titleSource"> {
  const named = session.name?.trim();
  if (named) return { title: named, titleSource: "session-name" };
  const firstMessage = session.firstMessage?.trim();
  if (firstMessage && firstMessage !== "(no messages)") {
    return { title: firstMessage, titleSource: "first-message" };
  }
  return { title: `Session ${session.id.slice(0, 8)}`, titleSource: "fallback" };
}

function nextImportedTaskStatus(current: Task["status"] | undefined, running: boolean): Task["status"] {
  if (current === "completed" || current === "archived" || current === "waiting" || current === "failed") {
    return current;
  }
  return running ? "active" : "idle";
}

function createImportedTaskSnapshot(session: SessionInfo, running: boolean, parentTaskId?: TaskId): Task {
  const title = deriveTitle(session);
  const runId = getPiRunId(session.id);
  return {
    id: getPiTaskId(session.id),
    title: title.title,
    titleSource: title.titleSource,
    status: running ? "active" : "idle",
    origin: { kind: "pi-session", externalId: session.id },
    scope: {
      cwd: session.cwd,
      projectRoot: session.projectRoot,
      worktreeBranch: session.worktreeBranch,
    },
    defaultRunId: runId,
    parentTaskId,
    metadata: {
      sourceSessionId: session.id,
      sourceSessionModifiedAt: session.modified,
      sourceSessionMissing: false,
    },
    createdAt: session.created,
    updatedAt: session.modified,
  };
}

declare global {
  var __piSessionReconcileAllPromise: Promise<void> | undefined;
}

export interface EnsureStartedPiSessionInput {
  sessionId: string;
  cwd: string;
  taskId?: TaskId;
  createdAt?: string;
  updatedAt?: string;
}

export class PiSessionReconciler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly runService: RunService,
  ) {}

  private upsertImportedTask(session: SessionInfo, running: boolean): RuntimeContext {
    return this.uow.transaction(({ tasks, runs, events }) => {
      const runId = getPiRunId(session.id);
      const parentTaskId = session.parentSessionId ? getPiTaskId(session.parentSessionId) : undefined;
      const imported = createImportedTaskSnapshot(session, running, parentTaskId);
      const existingRun = runs.findByNativeRuntime("pi", session.id);
      const existingTask = existingRun
        ? tasks.getById(existingRun.taskId)
        : tasks.findByOrigin({ kind: "pi-session", externalId: session.id });

      if (!existingTask) {
        tasks.create(imported);
        events.append(createKernelEvent(
          "task.created",
          imported.id,
          imported.defaultRunId,
          { task: { id: imported.id, status: imported.status, title: imported.title } },
          { kind: "system" },
        ), "durable");
      } else {
        const preserveTitle = existingTask.titleSource === "user" || existingTask.origin.kind === "native";
        const nextTask: Task = {
          ...existingTask,
          title: preserveTitle ? existingTask.title : imported.title,
          titleSource: preserveTitle ? existingTask.titleSource : imported.titleSource,
          status: nextImportedTaskStatus(existingTask.status, running),
          scope: imported.scope,
          parentTaskId: imported.parentTaskId ?? existingTask.parentTaskId,
          defaultRunId: existingTask.defaultRunId ?? imported.defaultRunId,
          metadata: {
            ...existingTask.metadata,
            sourceSessionId: session.id,
            sourceSessionModifiedAt: session.modified,
            sourceSessionMissing: false,
          },
          updatedAt: session.modified,
        };
        tasks.update(nextTask);
      }

      const task = tasks.getById(existingTask?.id ?? imported.id) ?? imported;
      const existingImportedRun = existingRun ?? runs.getById(runId);
      if (!existingImportedRun) {
        runs.create({
          id: runId,
          taskId: task.id,
          runtimeKind: "pi",
          nativeRuntimeId: session.id,
          status: running ? "running" : "idle",
          createdAt: session.created,
          updatedAt: session.modified,
          lastSeenAt: session.modified,
          metadata: {
            sourceSessionId: session.id,
            cwd: session.cwd,
            projectRoot: session.projectRoot,
            worktreeBranch: session.worktreeBranch,
          },
        });
        events.append(createKernelEvent(
          "run.created",
          task.id,
          runId,
          { run: { id: runId, runtimeKind: "pi", nativeRuntimeId: session.id } },
          { kind: "system" },
        ), "durable");
      } else {
        const nextStatus = running ? "running" : (existingImportedRun.status === "closed" || existingImportedRun.status === "interrupted" ? "idle" : existingImportedRun.status);
        runs.update({
          ...existingImportedRun,
          taskId: task.id,
          status: nextStatus,
          updatedAt: session.modified,
          lastSeenAt: session.modified,
          metadata: {
            ...existingImportedRun.metadata,
            sourceSessionId: session.id,
            cwd: session.cwd,
            projectRoot: session.projectRoot,
            worktreeBranch: session.worktreeBranch,
          },
        });
      }

      if (task.defaultRunId !== runId) {
        tasks.update({ ...task, defaultRunId: runId, updatedAt: session.modified });
      }

      return {
        taskId: task.id,
        runId,
        runtimeKind: "pi",
        nativeRuntimeId: session.id,
      };
    });
  }

  private markMissingSessions(seenSessionIds: Set<string>): void {
    this.uow.transaction(({ tasks, runs }) => {
      const importedTasks = tasks.list({ originKind: "pi-session", includeArchived: true });
      for (const task of importedTasks) {
        const sessionId = task.origin.externalId;
        if (!sessionId || seenSessionIds.has(sessionId)) continue;
        const taskRuns = runs.listByTask(task.id);
        const updatedAt = new Date().toISOString();
        for (const run of taskRuns) {
          if (run.runtimeKind === "pi" && run.status !== "closed") {
            runs.update({ ...run, status: "closed", updatedAt });
          }
        }
        tasks.update({
          ...task,
          metadata: { ...task.metadata, sourceSessionMissing: true },
          updatedAt,
        });
      }
    });
  }

  async reconcileAll(options: { runningSessionIds?: Set<string> } = {}): Promise<void> {
    if (globalThis.__piSessionReconcileAllPromise) return globalThis.__piSessionReconcileAllPromise;
    globalThis.__piSessionReconcileAllPromise = (async () => {
      const sessions = await listAllSessions();
      const runningSessionIds = options.runningSessionIds ?? new Set<string>();
      const seen = new Set<string>();
      for (const session of sessions) {
        seen.add(session.id);
        this.upsertImportedTask(session, runningSessionIds.has(session.id));
      }
      this.markMissingSessions(seen);
    })().finally(() => {
      globalThis.__piSessionReconcileAllPromise = undefined;
    });
    return globalThis.__piSessionReconcileAllPromise;
  }

  async reconcileSession(sessionId: string, options: { running?: boolean } = {}): Promise<RuntimeContext | null> {
    const sessions = await listAllSessions();
    const session = sessions.find((item) => item.id === sessionId);
    if (!session) {
      this.markMissingSessions(new Set(sessions.map((item) => item.id)));
      return this.runService.getRuntimeContext("pi", sessionId);
    }
    return this.upsertImportedTask(session, options.running === true);
  }

  ensureStartedPiSession(input: EnsureStartedPiSessionInput): RuntimeContext {
    if (input.taskId) {
      return this.runService.ensurePiRun({
        sessionId: input.sessionId,
        taskId: input.taskId,
        createdAt: input.createdAt,
        updatedAt: input.updatedAt,
        metadata: { cwd: input.cwd },
      });
    }

    return this.uow.transaction(({ tasks, events }) => {
      const existing = tasks.findByOrigin({ kind: "pi-session", externalId: input.sessionId });
      if (!existing) {
        const now = input.createdAt ?? new Date().toISOString();
        const title = deriveTitle({ id: input.sessionId, name: undefined, firstMessage: "(no messages)" });
        const task: Task = {
          id: getPiTaskId(input.sessionId),
          title: title.title,
          titleSource: title.titleSource,
          status: "idle",
          origin: { kind: "pi-session", externalId: input.sessionId },
          scope: { cwd: input.cwd, projectRoot: input.cwd },
          defaultRunId: getPiRunId(input.sessionId),
          metadata: {
            sourceSessionId: input.sessionId,
            sourceSessionMissing: false,
          },
          createdAt: now,
          updatedAt: input.updatedAt ?? now,
        };
        tasks.create(task);
        events.append(createKernelEvent(
          "task.created",
          task.id,
          task.defaultRunId,
          { task: { id: task.id, status: task.status, title: task.title } },
          { kind: "system" },
        ), "durable");
      }

      const task = tasks.findByOrigin({ kind: "pi-session", externalId: input.sessionId })!;
      return this.runService.ensurePiRun({
        sessionId: input.sessionId,
        taskId: task.id,
        createdAt: input.createdAt,
        updatedAt: input.updatedAt,
        metadata: { cwd: input.cwd, projectRoot: input.cwd },
      });
    });
  }

  interruptStaleRuns(activeRuntimeIds: Set<string>): void {
    const runningRuns = this.uow.runs.listByStatus("running");
    for (const run of runningRuns) {
      if (activeRuntimeIds.has(run.nativeRuntimeId)) continue;
      this.runService.updateRunStatus(run.id, "interrupted", {
        lastSeenAt: new Date().toISOString(),
        emitInterruptedEvent: true,
      });
    }
  }
}
