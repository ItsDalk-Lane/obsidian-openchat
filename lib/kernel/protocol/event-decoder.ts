import type { RunId, TaskId } from "../domain";
import { createKernelEvent } from "./event-factory";
import type { KernelEvent, LegacyFlatEvent } from "./events";
import { KERNEL_EVENT_SCHEMA_VERSION } from "./events";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isKernelEvent(value: unknown): value is KernelEvent {
  return isRecord(value)
    && value.schemaVersion === KERNEL_EVENT_SCHEMA_VERSION
    && typeof value.id === "string"
    && typeof value.type === "string"
    && typeof value.occurredAt === "string"
    && typeof value.taskId === "string"
    && typeof value.runId === "string"
    && isRecord(value.source)
    && "payload" in value;
}

export interface DecodeKernelEventOptions {
  taskId: TaskId;
  runId: RunId;
  sessionId?: string;
}

export function decodeKernelEvent(input: unknown, options: DecodeKernelEventOptions): KernelEvent | null {
  if (isKernelEvent(input)) return input;
  if (!isRecord(input) || typeof input.type !== "string") return null;

  const event = input as LegacyFlatEvent;
  const source = { kind: "runtime" as const, adapter: "pi" as const, nativeType: event.type };
  switch (event.type) {
    case "connected":
      return createKernelEvent("transport.connected", options.taskId, options.runId, { sessionId: options.sessionId ?? "" }, { kind: "transport", adapter: "pi", nativeType: event.type });
    case "agent_start":
      return createKernelEvent("operation.started", options.taskId, options.runId, { operationKind: "prompt" }, source);
    case "agent_end":
    case "prompt_done":
      return createKernelEvent("operation.completed", options.taskId, options.runId, { operationKind: "prompt" }, source);
    case "prompt_error":
      return createKernelEvent("operation.failed", options.taskId, options.runId, { operationKind: "prompt", errorMessage: String(event.errorMessage ?? "Prompt failed") }, source);
    case "message_start":
      return createKernelEvent("message.started", options.taskId, options.runId, { message: isRecord(event.message) ? event.message : {} }, source);
    case "message_update":
      return createKernelEvent("message.updated", options.taskId, options.runId, { message: isRecord(event.message) ? event.message : {} }, source);
    case "message_end":
      return createKernelEvent("message.completed", options.taskId, options.runId, { message: (isRecord(event.message) ? event.message : { role: "assistant", content: [] }) as never }, source);
    case "tool_execution_start":
      return createKernelEvent("capability.execution.started", options.taskId, options.runId, { executionId: String(event.toolCallId ?? ""), capabilityName: String(event.toolName ?? "") }, source);
    case "tool_execution_end":
      return createKernelEvent("capability.execution.completed", options.taskId, options.runId, { executionId: String(event.toolCallId ?? "") }, source);
    case "queue_update":
      return createKernelEvent("queue.updated", options.taskId, options.runId, { steering: Array.isArray(event.steering) ? event.steering as string[] : [], followUp: Array.isArray(event.followUp) ? event.followUp as string[] : [] }, source);
    case "auto_retry_start":
      return createKernelEvent("retry.started", options.taskId, options.runId, { attempt: typeof event.attempt === "number" ? event.attempt : undefined, maxAttempts: typeof event.maxAttempts === "number" ? event.maxAttempts : undefined, errorMessage: typeof event.errorMessage === "string" ? event.errorMessage : undefined }, source);
    case "auto_retry_end":
      return createKernelEvent("retry.completed", options.taskId, options.runId, {}, source);
    case "auto_compaction_start":
    case "compaction_start":
      return createKernelEvent("compaction.started", options.taskId, options.runId, {}, source);
    case "auto_compaction_end":
    case "compaction_end":
      return createKernelEvent("compaction.completed", options.taskId, options.runId, {
        aborted: event.aborted === true,
        reason: typeof event.reason === "string" ? event.reason : undefined,
        result: isRecord(event.result) ? event.result : null,
        errorMessage: typeof event.errorMessage === "string" ? event.errorMessage : undefined,
      }, source);
    case "extension_ui_request":
      return createKernelEvent("extension.ui.requested", options.taskId, options.runId, { request: event as never }, { kind: "extension", adapter: "pi", nativeType: event.type });
    case "extension_error":
      return createKernelEvent("extension.failed", options.taskId, options.runId, {
        extensionPath: typeof event.extensionPath === "string" ? event.extensionPath : undefined,
        event: typeof event.event === "string" ? event.event : undefined,
        errorMessage: String(event.error ?? "Extension failed"),
      }, { kind: "extension", adapter: "pi", nativeType: event.type });
    case "mcp_status":
      return createKernelEvent("runtime.status.updated", options.taskId, options.runId, { statusType: "mcp", snapshot: event.snapshot }, source);
    default:
      return createKernelEvent("native.diagnostic", options.taskId, options.runId, {
        nativeType: event.type,
        message: "Unknown native event",
      }, source);
  }
}
