import type { RunId, TaskId } from "./ids";

export type RuntimeKind = "pi" | (string & {});

export interface RuntimeContext {
  taskId: TaskId;
  runId: RunId;
  runtimeKind: RuntimeKind;
  nativeRuntimeId: string;
}
