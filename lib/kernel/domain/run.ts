import type { RunId, TaskId } from "./ids";

export type RunStatus = "idle" | "running" | "error";

export interface Run {
  id: RunId;
  taskId: TaskId;
  runtimeKind: string;
  nativeRuntimeId?: string;
  status: RunStatus;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}
