import type { RunId, TaskId } from "../domain";
import { createKernelEvent } from "./event-factory";
import type { AgentMessage, ExtensionUiRequest } from "./interactions";
import type { KernelEvent, LegacyFlatEvent } from "./events";
import { KERNEL_EVENT_SCHEMA_VERSION } from "./events";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isAgentMessage(value: unknown): value is AgentMessage {
  return isRecord(value) && isString(value.role);
}

function isExtensionUiRequest(value: unknown): value is ExtensionUiRequest {
  return isRecord(value)
    && value.type === "extension_ui_request"
    && isString(value.id)
    && isString(value.method);
}

function isKnownEventType(value: string): value is KernelEvent["type"] {
  return new Set<KernelEvent["type"]>([
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
    "capability.execution.progress",
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
  ]).has(value as KernelEvent["type"]);
}

function isValidPayload(type: KernelEvent["type"], payload: unknown): boolean {
  if (!isRecord(payload)) return false;
  switch (type) {
    case "transport.connected":
      return isString(payload.sessionId);
    case "task.created":
      return isRecord(payload.task) && isString(payload.task.id) && isString(payload.task.status) && isString(payload.task.title);
    case "task.updated":
      return isStringArray(payload.changedFields);
    case "task.status.changed":
      return isString(payload.previousStatus) && isString(payload.status);
    case "run.created":
      return isRecord(payload.run)
        && isString(payload.run.id)
        && isString(payload.run.runtimeKind)
        && isString(payload.run.nativeRuntimeId);
    case "run.status.changed":
      return isString(payload.previousStatus) && isString(payload.status);
    case "run.interrupted":
      return isString(payload.previousStatus);
    case "operation.started":
    case "operation.aborted":
      return payload.operationKind === "prompt" || payload.operationKind === "bash" || payload.operationKind === "compact";
    case "operation.completed":
      return (payload.operationKind === "prompt" || payload.operationKind === "bash" || payload.operationKind === "compact")
        && (payload.result === undefined || payload.result === null || isRecord(payload.result));
    case "operation.failed":
      return (payload.operationKind === "prompt" || payload.operationKind === "bash" || payload.operationKind === "compact")
        && isString(payload.errorMessage);
    case "message.started":
    case "message.updated":
      return isRecord(payload.message);
    case "message.completed":
      return isAgentMessage(payload.message);
    case "capability.execution.started":
      return isString(payload.executionId) && isString(payload.capabilityName);
    case "capability.execution.progress":
      return isString(payload.executionId) && isString(payload.progress);
    case "capability.execution.completed":
      return isString(payload.executionId);
    case "queue.updated":
      return isStringArray(payload.steering) && isStringArray(payload.followUp);
    case "retry.started":
      return (payload.attempt === undefined || typeof payload.attempt === "number")
        && (payload.maxAttempts === undefined || typeof payload.maxAttempts === "number")
        && (payload.errorMessage === undefined || isString(payload.errorMessage));
    case "retry.completed":
    case "compaction.started":
      return true;
    case "compaction.completed":
      return (payload.aborted === undefined || typeof payload.aborted === "boolean")
        && (payload.reason === undefined || isString(payload.reason))
        && (payload.result === undefined || payload.result === null || isRecord(payload.result))
        && (payload.errorMessage === undefined || isString(payload.errorMessage));
    case "extension.ui.requested":
      return isExtensionUiRequest(payload.request);
    case "extension.failed":
      return (payload.extensionPath === undefined || isString(payload.extensionPath))
        && (payload.event === undefined || isString(payload.event))
        && isString(payload.errorMessage);
    case "runtime.status.updated":
      return payload.statusType === "mcp";
    case "native.diagnostic":
      return isString(payload.nativeType) && isString(payload.message);
    case "artifact.registered":
      return isString(payload.artifactId) && isString(payload.artifactType);
    case "artifact.updated":
      return isString(payload.artifactId) && isStringArray(payload.changedFields);
    case "artifact.archived":
      return isString(payload.artifactId);
    default:
      return false;
  }
}

function isKernelEvent(value: unknown): value is KernelEvent {
  if (!isRecord(value)) return false;
  if (value.schemaVersion !== KERNEL_EVENT_SCHEMA_VERSION) return false;
  if (!isString(value.id) || !isString(value.type) || !isKnownEventType(value.type)) return false;
  if (!isString(value.occurredAt) || !isString(value.taskId)) return false;
  if (value.runId !== undefined && !isString(value.runId)) return false;
  if (!isRecord(value.source)) return false;
  return isValidPayload(value.type, value.payload);
}

export interface DecodeKernelEventOptions {
  taskId: TaskId;
  runId: RunId;
  sessionId?: string;
}

export function decodeKernelEvent(input: unknown, options: DecodeKernelEventOptions): KernelEvent | null {
  if (isKernelEvent(input)) return input;
  if (!isRecord(input) || !isString(input.type)) return null;

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
      return createKernelEvent("operation.failed", options.taskId, options.runId, { operationKind: "prompt", errorMessage: isString(event.errorMessage) ? event.errorMessage : "Prompt failed" }, source);
    case "message_start":
    case "message_update":
      if (!isRecord(event.message)) return null;
      return createKernelEvent(
        event.type === "message_start" ? "message.started" : "message.updated",
        options.taskId,
        options.runId,
        { message: event.message as Partial<AgentMessage> },
        source,
      );
    case "message_end":
      if (!isAgentMessage(event.message)) return null;
      return createKernelEvent("message.completed", options.taskId, options.runId, { message: event.message }, source);
    case "tool_execution_start":
      return createKernelEvent("capability.execution.started", options.taskId, options.runId, { executionId: isString(event.toolCallId) ? event.toolCallId : "", capabilityName: isString(event.toolName) ? event.toolName : "" }, source);
    case "tool_execution_update": {
      const executionId = isString(event.toolCallId) ? event.toolCallId : "";
      const progress = typeof event.progress === "string" ? event.progress : "";
      if (!executionId || !progress) return null;
      return createKernelEvent("capability.execution.progress", options.taskId, options.runId, { executionId, progress }, source);
    }
    case "tool_execution_end":
      return createKernelEvent("capability.execution.completed", options.taskId, options.runId, { executionId: isString(event.toolCallId) ? event.toolCallId : "" }, source);
    case "queue_update":
      return createKernelEvent("queue.updated", options.taskId, options.runId, { steering: isStringArray(event.steering) ? event.steering : [], followUp: isStringArray(event.followUp) ? event.followUp : [] }, source);
    case "auto_retry_start":
      return createKernelEvent("retry.started", options.taskId, options.runId, { attempt: typeof event.attempt === "number" ? event.attempt : undefined, maxAttempts: typeof event.maxAttempts === "number" ? event.maxAttempts : undefined, errorMessage: isString(event.errorMessage) ? event.errorMessage : undefined }, source);
    case "auto_retry_end":
      return createKernelEvent("retry.completed", options.taskId, options.runId, {}, source);
    case "auto_compaction_start":
    case "compaction_start":
      return createKernelEvent("compaction.started", options.taskId, options.runId, {}, source);
    case "auto_compaction_end":
    case "compaction_end":
      return createKernelEvent("compaction.completed", options.taskId, options.runId, {
        aborted: event.aborted === true,
        reason: isString(event.reason) ? event.reason : undefined,
        result: isRecord(event.result) ? event.result : null,
        errorMessage: isString(event.errorMessage) ? event.errorMessage : undefined,
      }, source);
    case "extension_ui_request":
      if (!isExtensionUiRequest(event)) return null;
      return createKernelEvent("extension.ui.requested", options.taskId, options.runId, { request: event }, { kind: "extension", adapter: "pi", nativeType: event.type });
    case "extension_error":
      return createKernelEvent("extension.failed", options.taskId, options.runId, {
        extensionPath: isString(event.extensionPath) ? event.extensionPath : undefined,
        event: isString(event.event) ? event.event : undefined,
        errorMessage: isString(event.error) ? event.error : "Extension failed",
      }, { kind: "extension", adapter: "pi", nativeType: event.type });
    case "mcp_status":
      return createKernelEvent("runtime.status.updated", options.taskId, options.runId, { statusType: "mcp", snapshot: event.snapshot }, source);
    default:
      return null;
  }
}
