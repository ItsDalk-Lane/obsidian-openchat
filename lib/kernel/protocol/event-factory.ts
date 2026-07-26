import type { RunId, TaskId } from "../domain";
import { KERNEL_EVENT_SCHEMA_VERSION, type KernelEvent, type KernelEventSource } from "./events";

function createEventId(): string {
  const random = Math.floor(Math.random() * 0x7fffffff).toString(16).padStart(8, "0");
  return `evt_${Date.now().toString(36)}_${random}`;
}

export function createKernelEvent<T extends KernelEvent["type"]>(
  type: T,
  taskId: TaskId,
  runId: RunId | undefined,
  payload: Extract<KernelEvent, { type: T }>["payload"],
  source: KernelEventSource,
  operationId?: string,
): Extract<KernelEvent, { type: T }> {
  return {
    schemaVersion: KERNEL_EVENT_SCHEMA_VERSION,
    id: createEventId(),
    type,
    occurredAt: new Date().toISOString(),
    taskId,
    ...(runId ? { runId } : {}),
    ...(operationId ? { operationId } : {}),
    source,
    payload,
  } as Extract<KernelEvent, { type: T }>;
}

export function createOperationId(kind: "prompt" | "bash" | "compact"): string {
  const random = Math.floor(Math.random() * 0x7fffffff).toString(16).padStart(8, "0");
  return `op_${kind}_${Date.now().toString(36)}_${random}`;
}
