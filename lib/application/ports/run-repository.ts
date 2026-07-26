import type { Run, RunId, RuntimeKind, RunStatus, TaskId } from "@/lib/kernel";

export interface RunRepository {
  getById(id: RunId): Run | null;
  listByTask(taskId: TaskId): Run[];
  findByNativeRuntime(runtimeKind: RuntimeKind, nativeRuntimeId: string): Run | null;
  create(run: Run): Run;
  update(run: Run): Run;
  updateStatus(id: RunId, status: RunStatus, updatedAt: string, lastSeenAt?: string): Run | null;
  upsertImportedRun(run: Run): Run;
  listByStatus(status: RunStatus): Run[];
}
