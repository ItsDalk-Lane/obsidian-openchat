import type { AgentMessage, ExtensionUiRequest } from "../../types";
import type { RunId, TaskId } from "../domain";

export const KERNEL_EVENT_SCHEMA_VERSION = 1 as const;

export type KernelEventSourceKind = "runtime" | "system" | "extension" | "transport";

export interface KernelEventSource {
  kind: KernelEventSourceKind;
  adapter?: "pi";
  nativeType?: string;
}

export interface KernelEventEnvelope<TType extends string, TPayload> {
  schemaVersion: typeof KERNEL_EVENT_SCHEMA_VERSION;
  id: string;
  type: TType;
  occurredAt: string;
  taskId: TaskId;
  runId: RunId;
  operationId?: string;
  source: KernelEventSource;
  payload: TPayload;
}

export type TransportConnectedEvent = KernelEventEnvelope<"transport.connected", { sessionId: string }>;
export type OperationStartedEvent = KernelEventEnvelope<"operation.started", { operationKind: "prompt" | "bash" | "compact" }>;
export type OperationCompletedEvent = KernelEventEnvelope<"operation.completed", { operationKind: "prompt" | "bash" | "compact"; result?: Record<string, unknown> | null }>;
export type OperationFailedEvent = KernelEventEnvelope<"operation.failed", { operationKind: "prompt" | "bash" | "compact"; errorMessage: string }>;
export type OperationAbortedEvent = KernelEventEnvelope<"operation.aborted", { operationKind: "prompt" | "bash" | "compact" }>;
export type MessageStartedEvent = KernelEventEnvelope<"message.started", { message: Partial<AgentMessage> }>;
export type MessageUpdatedEvent = KernelEventEnvelope<"message.updated", { message: Partial<AgentMessage> }>;
export type MessageCompletedEvent = KernelEventEnvelope<"message.completed", { message: AgentMessage }>;
export type CapabilityExecutionStartedEvent = KernelEventEnvelope<"capability.execution.started", { executionId: string; capabilityName: string }>;
export type CapabilityExecutionCompletedEvent = KernelEventEnvelope<"capability.execution.completed", { executionId: string }>;
export type QueueUpdatedEvent = KernelEventEnvelope<"queue.updated", { steering: string[]; followUp: string[] }>;
export type RetryStartedEvent = KernelEventEnvelope<"retry.started", { attempt?: number; maxAttempts?: number; errorMessage?: string }>;
export type RetryCompletedEvent = KernelEventEnvelope<"retry.completed", Record<string, never>>;
export type CompactionStartedEvent = KernelEventEnvelope<"compaction.started", Record<string, never>>;
export type CompactionCompletedEvent = KernelEventEnvelope<"compaction.completed", { aborted?: boolean; reason?: string; result?: Record<string, unknown> | null; errorMessage?: string }>;
export type ExtensionUiRequestedEvent = KernelEventEnvelope<"extension.ui.requested", { request: ExtensionUiRequest }>;
export type ExtensionFailedEvent = KernelEventEnvelope<"extension.failed", { extensionPath?: string; event?: string; errorMessage: string }>;
export type RuntimeStatusUpdatedEvent = KernelEventEnvelope<"runtime.status.updated", { statusType: "mcp"; snapshot: unknown }>;
export type NativeDiagnosticEvent = KernelEventEnvelope<"native.diagnostic", { nativeType: string; message: string }>;

export type KernelEvent =
  | TransportConnectedEvent
  | OperationStartedEvent
  | OperationCompletedEvent
  | OperationFailedEvent
  | OperationAbortedEvent
  | MessageStartedEvent
  | MessageUpdatedEvent
  | MessageCompletedEvent
  | CapabilityExecutionStartedEvent
  | CapabilityExecutionCompletedEvent
  | QueueUpdatedEvent
  | RetryStartedEvent
  | RetryCompletedEvent
  | CompactionStartedEvent
  | CompactionCompletedEvent
  | ExtensionUiRequestedEvent
  | ExtensionFailedEvent
  | RuntimeStatusUpdatedEvent
  | NativeDiagnosticEvent;

export type LegacyFlatEvent = {
  type: string;
  [key: string]: unknown;
};
