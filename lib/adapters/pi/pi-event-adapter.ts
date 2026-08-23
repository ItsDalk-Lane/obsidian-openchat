import type { AgentMessage, ExtensionUiRequest } from "../../types";
import type { RunId, TaskId } from "../../kernel";
import { createKernelEvent } from "../../kernel";
import { normalizePiMessage } from "./pi-message-adapter";
import { getToolExecutionProgress } from "../../tool-execution-progress";

export interface PiRuntimeEvent {
  type: string;
  [key: string]: unknown;
}

export interface PiEventContext {
  taskId: TaskId;
  runId: RunId;
  operationId?: string;
}

const COMPACTION_START_TYPES = new Set(["auto_compaction_start", "compaction_start"]);
const COMPACTION_END_TYPES = new Set(["auto_compaction_end", "compaction_end"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizePiEventType(type: string): string {
  if (COMPACTION_START_TYPES.has(type)) return "compaction_start";
  if (COMPACTION_END_TYPES.has(type)) return "compaction_end";
  return type;
}

export function toKernelEventFromPiEvent(event: PiRuntimeEvent, context: PiEventContext) {
  const nativeType = normalizePiEventType(event.type);
  const source = { kind: "runtime" as const, adapter: "pi" as const, nativeType };
  switch (nativeType) {
    case "agent_start":
    case "agent_end":
      return null;
    case "message_start":
      return createKernelEvent("message.started", context.taskId, context.runId, { message: isRecord(event.message) ? normalizePiMessage(event.message as unknown as AgentMessage) as Partial<AgentMessage> : {} }, source, context.operationId);
    case "message_update":
      return createKernelEvent("message.updated", context.taskId, context.runId, { message: isRecord(event.message) ? normalizePiMessage(event.message as unknown as AgentMessage) as Partial<AgentMessage> : {} }, source, context.operationId);
    case "message_end":
      if (!isRecord(event.message)) return null;
      return createKernelEvent("message.completed", context.taskId, context.runId, { message: normalizePiMessage(event.message as unknown as AgentMessage) }, source, context.operationId);
    case "tool_execution_start":
      return createKernelEvent("capability.execution.started", context.taskId, context.runId, {
        executionId: typeof event.toolCallId === "string" ? event.toolCallId : "",
        capabilityName: typeof event.toolName === "string" ? event.toolName : "",
      }, source, context.operationId);
    case "tool_execution_update": {
      // Pi 0.84+ emits in-flight progress for long-running tools. Surface the
      // latest text line so the chat can show "Running bash: ..." updates
      // instead of a frozen header. The capability.execution.started already
      // added the tool to the running-tools list; we just update progress.
      const executionId = typeof event.toolCallId === "string" ? event.toolCallId : "";
      const progress = getToolExecutionProgress(event.partialResult);
      if (!executionId || !progress) return null;
      return createKernelEvent("capability.execution.progress", context.taskId, context.runId, {
        executionId,
        progress,
      }, source, context.operationId);
    }
    case "tool_execution_end":
      return createKernelEvent("capability.execution.completed", context.taskId, context.runId, {
        executionId: typeof event.toolCallId === "string" ? event.toolCallId : "",
      }, source, context.operationId);
    case "queue_update":
      return createKernelEvent("queue.updated", context.taskId, context.runId, {
        steering: Array.isArray(event.steering) ? event.steering as string[] : [],
        followUp: Array.isArray(event.followUp) ? event.followUp as string[] : [],
      }, source, context.operationId);
    case "auto_retry_start":
      return createKernelEvent("retry.started", context.taskId, context.runId, {
        attempt: typeof event.attempt === "number" ? event.attempt : undefined,
        maxAttempts: typeof event.maxAttempts === "number" ? event.maxAttempts : undefined,
        errorMessage: typeof event.errorMessage === "string" ? event.errorMessage : undefined,
      }, source, context.operationId);
    case "auto_retry_end":
      return createKernelEvent("retry.completed", context.taskId, context.runId, {}, source, context.operationId);
    case "compaction_start":
      return createKernelEvent("compaction.started", context.taskId, context.runId, {}, source, context.operationId);
    case "compaction_end":
      return createKernelEvent("compaction.completed", context.taskId, context.runId, {
        aborted: event.aborted === true,
        reason: typeof event.reason === "string" ? event.reason : undefined,
        result: isRecord(event.result) ? event.result : null,
        errorMessage: typeof event.errorMessage === "string" ? event.errorMessage : undefined,
      }, source, context.operationId);
    case "extension_ui_request":
      if (!isRecord(event)) return null;
      return createKernelEvent("extension.ui.requested", context.taskId, context.runId, {
        request: event as ExtensionUiRequest,
      }, { kind: "extension", adapter: "pi", nativeType }, context.operationId);
    case "extension_error":
      return createKernelEvent("extension.failed", context.taskId, context.runId, {
        extensionPath: typeof event.extensionPath === "string" ? event.extensionPath : undefined,
        event: typeof event.event === "string" ? event.event : undefined,
        errorMessage: typeof event.error === "string" ? event.error : "Extension command failed",
      }, { kind: "extension", adapter: "pi", nativeType }, context.operationId);
    default:
      return createKernelEvent("native.diagnostic", context.taskId, context.runId, {
        nativeType,
        message: "Unmapped native event",
      }, source, context.operationId);
  }
}
