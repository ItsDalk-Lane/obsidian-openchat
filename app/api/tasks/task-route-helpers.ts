import { NextResponse } from "next/server";
import type { KernelEvent, Run, RunId, Task, TaskId, TaskStatus } from "@/lib/kernel";
import { getKernelServices } from "@/lib/server/kernel-services";

const TASK_STATUSES = new Set<TaskStatus>(["draft", "idle", "active", "waiting", "completed", "failed", "archived"]);
const ARTIFACT_STATUSES = new Set(["draft", "ready", "archived"] as const);
const TASK_EVENT_TYPES = new Set<KernelEvent["type"]>([
  "transport.connected",
  "task.created",
  "task.updated",
  "task.status.changed",
  "run.created",
  "run.status.changed",
  "run.interrupted",
  "operation.started",
  "operation.completed",
  "operation.failed",
  "operation.aborted",
  "message.started",
  "message.updated",
  "message.completed",
  "capability.execution.started",
  "capability.execution.completed",
  "queue.updated",
  "retry.started",
  "retry.completed",
  "compaction.started",
  "compaction.completed",
  "extension.ui.requested",
  "extension.failed",
  "runtime.status.updated",
  "native.diagnostic",
  "artifact.registered",
  "artifact.updated",
  "artifact.archived",
]);

export function isTaskId(value: string): value is TaskId {
  return /^task_[0-9a-f]{8}$/i.test(value);
}

export function isRunId(value: string): value is RunId {
  return /^run_[0-9a-f]{8}$/i.test(value);
}

export function isTaskStatus(value: string): value is TaskStatus {
  return TASK_STATUSES.has(value as TaskStatus);
}

export function isArtifactStatus(value: string): value is "draft" | "ready" | "archived" {
  return ARTIFACT_STATUSES.has(value as "draft" | "ready" | "archived");
}

export function isKernelEventType(value: string): value is KernelEvent["type"] {
  return TASK_EVENT_TYPES.has(value as KernelEvent["type"]);
}

export function badRequest(error: string) {
  return NextResponse.json({ error }, { status: 400 });
}

export function notFound(error: string) {
  return NextResponse.json({ error }, { status: 404 });
}

export function conflict(error: string) {
  return NextResponse.json({ error }, { status: 409 });
}

export function summarizeTask(task: Task) {
  const services = getKernelServices();
  const runs = services.runService.listByTask(task.id);
  const artifacts = services.artifactService.listByTask(task.id);
  const defaultRun = task.defaultRunId
    ? runs.find((run) => run.id === task.defaultRunId) ?? null
    : null;
  return {
    task,
    defaultRun,
    runCount: runs.length,
    artifactCount: artifacts.length,
  };
}

export function parsePositiveInt(value: string | null, fallback: number, max: number): number {
  const parsed = value ? Number.parseInt(value, 10) : fallback;
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

export function enforceSameOrigin(req: Request): Response | null {
  const origin = req.headers.get("origin");
  if (!origin) return null;
  let originUrl: URL;
  let requestUrl: URL;
  try {
    originUrl = new URL(origin);
    requestUrl = new URL(req.url);
  } catch {
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  }
  if (originUrl.protocol !== requestUrl.protocol || originUrl.host !== requestUrl.host) {
    return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
  }
  return null;
}

export function resolveDefaultRun(taskId: TaskId, runs: Run[]): Run | null {
  const services = getKernelServices();
  const task = services.taskService.getTask(taskId);
  if (!task?.defaultRunId) return null;
  return runs.find((run) => run.id === task.defaultRunId) ?? null;
}
