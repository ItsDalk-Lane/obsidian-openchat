import type { RunId, TaskId } from "./ids";

export type TaskStatus = "idle" | "active" | "error";

export interface TaskScope {
  cwd?: string;
  projectRoot?: string;
  worktreeBranch?: string;
}

export interface Task {
  id: TaskId;
  title: string;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  scope?: TaskScope;
  defaultRunId?: RunId;
  parentTaskId?: TaskId;
  metadata?: Record<string, unknown>;
}
