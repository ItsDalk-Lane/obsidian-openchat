import type { KernelEvent, RuntimeCommand, RuntimeCommandResult } from "../protocol";
import type { RuntimeContext, RuntimeKind } from "./runtime-context";

export interface RuntimeDescriptor {
  id: RuntimeKind;
  version: string;
  displayName: string;
  description?: string;
  capabilities: {
    streaming: boolean;
    resumable: boolean;
    cancellable: boolean;
    branching: boolean;
    nativeTools: boolean;
    contextInjection: boolean;
  };
}

export interface CreateRuntimeRunInput {
  taskId: RuntimeContext["taskId"];
  cwd: string;
  runId?: RuntimeContext["runId"];
  nativeRuntimeId?: string;
  metadata?: Record<string, unknown>;
}

export interface AttachExistingRuntimeInput {
  context: RuntimeContext;
  cwd?: string;
}

export interface RuntimeState {
  status: "idle" | "running" | "closed" | "error" | "unknown";
  details?: Record<string, unknown>;
}

export interface RuntimeAdapter {
  descriptor: RuntimeDescriptor;
  createRun(input: CreateRuntimeRunInput): Promise<RuntimeContext>;
  attachExisting(input: AttachExistingRuntimeInput): Promise<RuntimeContext>;
  getState(context: RuntimeContext): Promise<RuntimeState>;
  send<C extends RuntimeCommand>(context: RuntimeContext, command: C): Promise<RuntimeCommandResult<C>>;
  subscribe(context: RuntimeContext, listener: (event: KernelEvent) => void): () => void;
  abort(context: RuntimeContext): Promise<void>;
  close(context: RuntimeContext): Promise<void>;
}
