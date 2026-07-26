import type { RunId, TaskId } from "./ids";
import type { RuntimeKind } from "./runtime-context";

export type RunStatus =
  | "pending"
  | "idle"
  | "running"
  | "waiting"
  | "error"
  | "interrupted"
  | "closed";

export interface Run {
  id: RunId;
  taskId: TaskId;
  runtimeKind: RuntimeKind;
  nativeRuntimeId: string;
  status: RunStatus;
  createdAt: string;
  updatedAt: string;
  lastSeenAt?: string;
  metadata?: Record<string, unknown>;
}
