import type { SessionInfo } from "../../types";
import {
  createRunId,
  createTaskId,
  type Run,
  type RunStatus,
  type Task,
  type TaskStatus,
} from "../../kernel";

export interface TaskRunProjection {
  task: Task;
  run: Run;
}

function normalizeTitle(session: SessionInfo): string {
  const named = session.name?.trim();
  if (named) return named;
  const firstMessage = session.firstMessage?.trim();
  if (firstMessage && firstMessage !== "(no messages)") return firstMessage;
  return `Session ${session.id.slice(0, 8)}`;
}

function mapTaskStatus(sessionId: string, runningSessionIds: Set<string>): TaskStatus {
  return runningSessionIds.has(sessionId) ? "active" : "idle";
}

function mapRunStatus(sessionId: string, runningSessionIds: Set<string>): RunStatus {
  return runningSessionIds.has(sessionId) ? "running" : "idle";
}

export function getPiTaskId(sessionId: string): ReturnType<typeof createTaskId> {
  return createTaskId(`pi:session:${sessionId}`);
}

export function getPiRunId(sessionId: string): ReturnType<typeof createRunId> {
  return createRunId(`pi:session:${sessionId}:default-run`);
}

export function projectPiSession(session: SessionInfo, runningSessionIds: Set<string> = new Set()): TaskRunProjection {
  const taskId = getPiTaskId(session.id);
  const runId = getPiRunId(session.id);
  const parentTaskId = session.parentSessionId ? getPiTaskId(session.parentSessionId) : undefined;

  return {
    task: {
      id: taskId,
      title: normalizeTitle(session),
      status: mapTaskStatus(session.id, runningSessionIds),
      origin: { kind: "pi-session", externalId: session.id },
      createdAt: session.created,
      updatedAt: session.modified,
      scope: {
        cwd: session.cwd,
        projectRoot: session.projectRoot,
        worktreeBranch: session.worktreeBranch,
      },
      defaultRunId: runId,
      ...(parentTaskId ? { parentTaskId } : {}),
      titleSource: session.name?.trim() ? "session-name" : session.firstMessage?.trim() && session.firstMessage !== "(no messages)" ? "first-message" : "fallback",
      metadata: {
        adapter: "pi",
        sourceSessionId: session.id,
      },
    },
    run: {
      id: runId,
      taskId,
      runtimeKind: "pi",
      nativeRuntimeId: session.id,
      status: mapRunStatus(session.id, runningSessionIds),
      createdAt: session.created,
      updatedAt: session.modified,
      lastSeenAt: session.modified,
      metadata: {
        adapter: "pi",
        sourceSessionId: session.id,
      },
    },
  };
}

export function projectPiSessions(sessions: SessionInfo[], runningSessionIds: Set<string> = new Set()): TaskRunProjection[] {
  return sessions.map((session) => projectPiSession(session, runningSessionIds));
}
