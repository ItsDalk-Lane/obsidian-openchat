import type { RunId, TaskId } from "../domain";
import type { RuntimeKind } from "../domain/runtime-context";
import type { AgentMessage, ExtensionUiRequest } from "./interactions";

export const KERNEL_EVENT_SCHEMA_VERSION = 1 as const;
export type KernelEventDurability = "durable" | "transient";

export type KernelEventSourceKind = "runtime" | "system" | "extension" | "transport";

export interface KernelEventSource {
  kind: KernelEventSourceKind;
  adapter?: RuntimeKind;
  nativeType?: string;
}

export interface KernelEventEnvelope<TType extends string, TPayload> {
  schemaVersion: typeof KERNEL_EVENT_SCHEMA_VERSION;
  id: string;
  type: TType;
  occurredAt: string;
  taskId: TaskId;
  runId?: RunId;
  operationId?: string;
  source: KernelEventSource;
  payload: TPayload;
}

export type TransportConnectedEvent = KernelEventEnvelope<"transport.connected", { sessionId: string }>;
export type TaskCreatedEvent = KernelEventEnvelope<"task.created", { task: { id: TaskId; status: string; title: string } }>;
export type TaskUpdatedEvent = KernelEventEnvelope<"task.updated", { changedFields: string[] }>;
export type TaskStatusChangedEvent = KernelEventEnvelope<"task.status.changed", { previousStatus: string; status: string }>;
export type RunCreatedEvent = KernelEventEnvelope<"run.created", { run: { id: RunId; runtimeKind: string; nativeRuntimeId: string } }>;
export type RunStatusChangedEvent = KernelEventEnvelope<"run.status.changed", { previousStatus: string; status: string }>;
export type RunInterruptedEvent = KernelEventEnvelope<"run.interrupted", { previousStatus: string }>;
export type OperationStartedEvent = KernelEventEnvelope<"operation.started", { operationKind: "prompt" | "bash" | "compact" }>;
export type OperationCompletedEvent = KernelEventEnvelope<"operation.completed", { operationKind: "prompt" | "bash" | "compact"; result?: Record<string, unknown> | null }>;
export type OperationFailedEvent = KernelEventEnvelope<"operation.failed", { operationKind: "prompt" | "bash" | "compact"; errorMessage: string }>;
export type OperationAbortedEvent = KernelEventEnvelope<"operation.aborted", { operationKind: "prompt" | "bash" | "compact" }>;
export type MessageStartedEvent = KernelEventEnvelope<"message.started", { message: Partial<AgentMessage> }>;
export type MessageUpdatedEvent = KernelEventEnvelope<"message.updated", { message: Partial<AgentMessage> }>;
export type MessageCompletedEvent = KernelEventEnvelope<"message.completed", { message: AgentMessage }>;
export type CapabilityExecutionStartedEvent = KernelEventEnvelope<"capability.execution.started", { executionId: string; capabilityName: string }>;
export type CapabilityExecutionProgressEvent = KernelEventEnvelope<"capability.execution.progress", { executionId: string; progress: string }>;
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
export type ArtifactRegisteredEvent = KernelEventEnvelope<"artifact.registered", { artifactId: string; artifactType: string }>;
export type ArtifactUpdatedEvent = KernelEventEnvelope<"artifact.updated", { artifactId: string; changedFields: string[] }>;
export type ArtifactArchivedEvent = KernelEventEnvelope<"artifact.archived", { artifactId: string }>;

export type KernelEvent =
  | TransportConnectedEvent
  | TaskCreatedEvent
  | TaskUpdatedEvent
  | TaskStatusChangedEvent
  | RunCreatedEvent
  | RunStatusChangedEvent
  | RunInterruptedEvent
  | OperationStartedEvent
  | OperationCompletedEvent
  | OperationFailedEvent
  | OperationAbortedEvent
  | MessageStartedEvent
  | MessageUpdatedEvent
  | MessageCompletedEvent
  | CapabilityExecutionStartedEvent
  | CapabilityExecutionProgressEvent
  | CapabilityExecutionCompletedEvent
  | QueueUpdatedEvent
  | RetryStartedEvent
  | RetryCompletedEvent
  | CompactionStartedEvent
  | CompactionCompletedEvent
  | ExtensionUiRequestedEvent
  | ExtensionFailedEvent
  | RuntimeStatusUpdatedEvent
  | NativeDiagnosticEvent
  | ArtifactRegisteredEvent
  | ArtifactUpdatedEvent
  | ArtifactArchivedEvent;

export interface StoredKernelEvent {
  sequence: number;
  durability: KernelEventDurability;
  event: KernelEvent;
}

export type LegacyFlatEvent = {
  type: string;
  [key: string]: unknown;
};
