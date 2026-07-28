import { SessionManager } from "@earendil-works/pi-coding-agent";
import { existsSync, writeFileSync } from "fs";
import type { McpStatusSnapshot } from "./mcp-extension";
import { cacheSessionPath, invalidateSessionListCache } from "./session-reader";
import type { AgentSessionLike, ExtensionUiContextLike } from "./pi-types";
import {
  PiRuntimeAdapter,
  applyEmptySystemPromptPatch,
  applySessionManagerFlushedPatch,
  createPiSession,
  parseAgentImages,
  toKernelEventFromPiEvent,
  withExtensionTools,
} from "./adapters/pi";
import {
  createKernelEvent,
  createOperationId,
  type KernelEvent,
  type RuntimeContext,
  type RuntimeCommand,
} from "./kernel";
import { getKernelServices } from "./application/services";
import { OperationLifecycleTracker } from "./rpc/operation-lifecycle";
import {
  ExtensionUiBridge,
  type ExtensionCommandContextActionsLike,
} from "./rpc/extension-ui-bridge";
import {
  getRegisteredSession,
  getRunningSessionIds,
  getSessionRegistry,
  getSessionStartLocks,
  notifyRunningSessionsChanged,
  subscribeToRunningSessions,
} from "./rpc/session-registry";
import {
  dispatchStandardCommand,
  STANDARD_COMMAND_NOT_HANDLED,
} from "./rpc/standard-command-handlers";

// ============================================================================
// Types
// ============================================================================

type EventListener = (event: KernelEvent, sequence?: number) => void;

type ExtensionBindingOptions = {
  forceEmptySystemPrompt?: boolean;
};

// ============================================================================
// AgentSessionWrapper
// Wraps AgentSession with the same interface the rest of the app expects
// ============================================================================

export class AgentSessionWrapper {
  private listeners: EventListener[] = [];
  private promptRunning = false;
  private extensionsBound = false;
  private extensionBindingPromise: Promise<void> | null = null;
  private extensionBindingError: unknown = null;
  private forceEmptySystemPrompt = false;
  private mcpStatus: McpStatusSnapshot | null = null;
  private unsubscribe: (() => void) | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private onDestroyCallback: (() => void) | null = null;
  private _alive = true;
  private readonly runtime: PiRuntimeAdapter;
  private readonly operationLifecycle = new OperationLifecycleTracker();
  private readonly extensionUi: ExtensionUiBridge;

  constructor(
    public readonly inner: AgentSessionLike,
    private readonly runtimeContext: RuntimeContext,
  ) {
    this.runtime = new PiRuntimeAdapter(inner);
    this.extensionUi = new ExtensionUiBridge({
      inner,
      runtimeContext,
      getOperationId: () => this.getCurrentOperationId(),
      emit: (event) => this.emit(event),
      applyForcedEmptySystemPrompt: () => this.applyForcedEmptySystemPrompt(),
    });
  }

  get sessionId(): string {
    return this.inner.sessionId;
  }

  get sessionFile(): string {
    return this.inner.sessionFile ?? "";
  }

  getRuntimeContext(): RuntimeContext {
    return this.runtimeContext;
  }

  isAlive(): boolean {
    return this._alive;
  }

  isRunning(): boolean {
    return this._alive && (this.promptRunning || this.inner.isStreaming || this.inner.isCompacting || this.inner.isBashRunning);
  }

  start(): void {
    this.unsubscribe = this.inner.subscribe((event: { type: string; [key: string]: unknown }) => {
      this.resetIdleTimer();
      if (event.type === "agent_end") {
        invalidateSessionListCache();
      }
      const kernelEvent = toKernelEventFromPiEvent(event, {
        taskId: this.runtimeContext.taskId,
        runId: this.runtimeContext.runId,
        operationId: this.getCurrentOperationId(),
      });
      if (kernelEvent) this.emit(kernelEvent);
      // Streaming / compaction / tool events flow through here; re-broadcast
      // the running-status snapshot so the sidebar can update live.
      notifyRunningChange();
    });
    this.resetIdleTimer();
    notifyRunningChange();
  }

  setForceEmptySystemPrompt(force: boolean): void {
    this.forceEmptySystemPrompt = force;
    this.applyForcedEmptySystemPrompt();
  }

  /** Latest MCP status snapshot published by the bundled pi-mcp-adapter. */
  getMcpStatus(): McpStatusSnapshot | null {
    return this.mcpStatus;
  }

  setMcpStatus(snapshot: McpStatusSnapshot | null): void {
    this.mcpStatus = snapshot;
    this.emit(createKernelEvent(
      "runtime.status.updated",
      this.runtimeContext.taskId,
      this.runtimeContext.runId,
      { statusType: "mcp", snapshot },
      { kind: "runtime", adapter: "pi", nativeType: "mcp_status" },
      this.getCurrentOperationId(),
    ));
  }

  beginExtensionBinding(options: ExtensionBindingOptions = {}): void {
    void this.ensureExtensionsBound(options).catch((err) => {
      console.error("[pi-web] failed to dispatch session_start to extensions:", err instanceof Error ? err.message : err);
    });
  }

  async waitUntilReady(): Promise<void> {
    await this.waitForExtensionsBound();
  }

  private ensureExtensionsBound(options: ExtensionBindingOptions = {}): Promise<void> {
    if (options.forceEmptySystemPrompt) this.forceEmptySystemPrompt = true;
    if (this.extensionsBound) {
      this.applyForcedEmptySystemPrompt();
      return Promise.resolve();
    }
    if (this.extensionBindingPromise) return this.extensionBindingPromise;

    this.extensionBindingError = null;
    this.extensionBindingPromise = (async () => {
      if (!this._alive) return;
      const uiContext = this.extensionUi.createContext();
      if (typeof this.inner.bindExtensions === "function") {
        const bindExtensions = this.inner.bindExtensions as (bindings: {
          uiContext?: ExtensionUiContextLike;
          mode?: "rpc";
          commandContextActions?: ExtensionCommandContextActionsLike;
          shutdownHandler?: () => void;
          onError?: (error: { extensionPath: string; event: string; error: string }) => void;
        }) => Promise<void>;
        await bindExtensions.call(this.inner, {
          uiContext,
          mode: "rpc",
          commandContextActions: this.extensionUi.createCommandContextActions(),
          shutdownHandler: () => this.extensionUi.emitNotification(
            "Extension requested shutdown, but shutdown is not supported in Pi Web.",
            "warning",
          ),
          onError: (error) => this.extensionUi.emitError({
            extensionPath: error.extensionPath,
            event: error.event,
            errorMessage: error.error,
          }),
        });
      } else {
        this.inner.extensionRunner.setUIContext?.(uiContext, "rpc");
      }
      this.extensionsBound = true;
      this.applyForcedEmptySystemPrompt();
      console.log(`[pi-web] session_start dispatched to extensions for session ${this.inner.sessionId}`);
    })().catch((err) => {
      this.extensionBindingError = err;
      throw err;
    });

    return this.extensionBindingPromise;
  }

  private async waitForExtensionsBound(): Promise<void> {
    try {
      if (this.extensionBindingPromise) await this.extensionBindingPromise;
    } catch (err) {
      throw err instanceof Error ? err : new Error(String(err));
    }
    if (this.extensionBindingError) {
      throw this.extensionBindingError instanceof Error
        ? this.extensionBindingError
        : new Error(String(this.extensionBindingError));
    }
  }

  private shouldWaitForExtensions(type: string): boolean {
    return type === "prompt" || type === "steer" || type === "follow_up" || type === "get_commands";
  }

  private async withFinalRunningNotification<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } finally {
      notifyRunningChange();
    }
  }

  private applyForcedEmptySystemPrompt(): void {
    applyEmptySystemPromptPatch(this.inner, this.forceEmptySystemPrompt);
  }

  private getTaskId() {
    return this.runtimeContext.taskId;
  }

  private getRunId() {
    return this.runtimeContext.runId;
  }

  private getCurrentOperationId(): string | undefined {
    return this.operationLifecycle.current("prompt")
      ?? this.operationLifecycle.current("bash")
      ?? this.operationLifecycle.current("compact");
  }

  private emit(event: KernelEvent): void {
    const stored = getKernelServices().eventService.tryAppendRuntimeEvent(event);
    for (const l of this.listeners) l(event, stored?.sequence);
  }

  private resetIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      if (this.isRunning()) {
        this.resetIdleTimer();
        return;
      }
      this.destroy();
    }, 10 * 60 * 1000);
  }

  private persistBashOnlySession(): void {
    const manager = this.inner.sessionManager;
    const sessionFile = manager.getSessionFile();
    if (!sessionFile || existsSync(sessionFile)) return;

    const header = manager.getHeader();
    if (!header) return;

    const content = [header, ...manager.getEntries()]
      .map((entry) => JSON.stringify(entry))
      .join("\n") + "\n";
    writeFileSync(sessionFile, content, { encoding: "utf8", flag: "wx" });

    // Pi normally delays the first flush until an assistant message exists.
    // A leading shell command has no assistant message, so mark this SDK
    // manager as flushed after writing its own generated entries.
    applySessionManagerFlushedPatch(this.inner);
    cacheSessionPath(this.inner.sessionId, sessionFile);
  }

  onEvent(listener: EventListener): () => void {
    this.listeners.push(listener);
    this.extensionUi.replayPendingRequests(listener);
    return () => {
      const i = this.listeners.indexOf(listener);
      if (i !== -1) this.listeners.splice(i, 1);
    };
  }

  onDestroy(cb: () => void): void {
    this.onDestroyCallback = cb;
  }

  async send(command: RuntimeCommand): Promise<unknown> {
    this.resetIdleTimer();
    const type = command.type;
    if (this.shouldWaitForExtensions(type)) await this.waitForExtensionsBound();
    const standardResult = await dispatchStandardCommand(command, {
      inner: this.inner,
      runtime: this.runtime,
      extensionUi: this.extensionUi,
      isPromptRunning: () => this.promptRunning,
      getMcpStatus: () => this.mcpStatus,
      waitForExtensionsBound: () => this.waitForExtensionsBound(),
      setForceEmptySystemPrompt: (force) => this.setForceEmptySystemPrompt(force),
      applyForcedEmptySystemPrompt: () => this.applyForcedEmptySystemPrompt(),
    });
    if (standardResult !== STANDARD_COMMAND_NOT_HANDLED) return standardResult;

    switch (type) {
      case "prompt": {
        if (this.inner.isBashRunning) {
          throw new Error("Cannot send a prompt while a shell command is running");
        }
        // Fire and forget — events come via subscribe
        const promptImages = parseAgentImages(command.images, "prompt");
        const streamingBehavior = command.streamingBehavior;
        const operationId = createOperationId("prompt");
        this.operationLifecycle.begin("prompt", operationId);
        this.emit(createKernelEvent(
          "operation.started",
          this.getTaskId(),
          this.getRunId(),
          { operationKind: "prompt" },
          { kind: "runtime", adapter: "pi", nativeType: "prompt" },
          operationId,
        ));
        this.promptRunning = true;
        notifyRunningChange();
        this.inner.prompt(command.message, {
          ...(promptImages?.length ? { images: promptImages } : {}),
          ...(streamingBehavior ? { streamingBehavior } : {}),
          source: "rpc",
        }).then(() => {
          this.promptRunning = false;
          if (this.operationLifecycle.finish("prompt", operationId)) {
            this.emit(createKernelEvent(
              "operation.completed",
              this.getTaskId(),
              this.getRunId(),
              { operationKind: "prompt" },
              { kind: "runtime", adapter: "pi", nativeType: "prompt_done" },
              operationId,
            ));
          }
          notifyRunningChange();
        }).catch((error) => {
          this.promptRunning = false;
          invalidateSessionListCache();
          if (this.operationLifecycle.finish("prompt", operationId)) {
            this.emit(createKernelEvent(
              "operation.failed",
              this.getTaskId(),
              this.getRunId(),
              { operationKind: "prompt", errorMessage: error instanceof Error ? error.message : String(error) },
              { kind: "runtime", adapter: "pi", nativeType: "prompt_error" },
              operationId,
            ));
          }
          notifyRunningChange();
        });
        return null;
      }

      case "abort": {
        await this.withFinalRunningNotification(() => this.inner.abort());
        const activeOperationId = this.operationLifecycle.abort("prompt");
        if (activeOperationId) {
          this.emit(createKernelEvent(
            "operation.aborted",
            this.getTaskId(),
            this.getRunId(),
            { operationKind: "prompt" },
            { kind: "runtime", adapter: "pi", nativeType: "abort" },
            activeOperationId,
          ));
        }
        return null;
      }

      case "fork": {
        if (this.inner.isBashRunning) {
          throw new Error("Cannot fork while a shell command is running");
        }
        const entryId = command.entryId;
        const sessionManager = this.inner.sessionManager;
        const currentSessionFile = this.inner.sessionFile;

        if (!sessionManager.isPersisted()) return { cancelled: true };
        if (!currentSessionFile) throw new Error("Persisted session is missing a session file");

        const entry = sessionManager.getEntry(entryId);
        if (!entry) throw new Error("Invalid entry ID for forking");

        const sessionDir = sessionManager.getSessionDir();
        let newSessionFile: string;

        if (!entry.parentId) {
          // Fork before the first message: create an empty session linked to this one
          const newManager = SessionManager.create(sessionManager.getCwd(), sessionDir);
          newManager.newSession({ parentSession: currentSessionFile });
          newSessionFile = newManager.getSessionFile() as string;
        } else {
          // Fork after some history: copy path up to (but not including) the fork point
          const sourceManager = SessionManager.open(currentSessionFile, sessionDir);
          const forkedPath = sourceManager.createBranchedSession(entry.parentId);
          if (!forkedPath) throw new Error("Failed to create forked session");
          newSessionFile = forkedPath;
        }

        const newSessionId = SessionManager.open(newSessionFile, sessionDir).getSessionId();
        cacheSessionPath(newSessionId, newSessionFile);
        invalidateSessionListCache();
        this.destroy();
        return { cancelled: false, newSessionId };
      }

      case "navigate_tree": {
        if (this.inner.isBashRunning) {
          throw new Error("Cannot navigate while a shell command is running");
        }
        const result = await this.inner.navigateTree(command.targetId, {});
        return { cancelled: result.cancelled };
      }

      case "compact": {
        const operationId = createOperationId("compact");
        this.operationLifecycle.begin("compact", operationId);
        this.emit(createKernelEvent(
          "operation.started",
          this.getTaskId(),
          this.getRunId(),
          { operationKind: "compact" },
          { kind: "runtime", adapter: "pi", nativeType: "compact" },
          operationId,
        ));
        try {
          const result = await this.withFinalRunningNotification(() =>
            this.inner.compact(command.customInstructions)
          );
          if (this.operationLifecycle.finish("compact", operationId)) {
            this.emit(createKernelEvent(
              "operation.completed",
              this.getTaskId(),
              this.getRunId(),
              { operationKind: "compact", result: (result as Record<string, unknown>) ?? null },
              { kind: "runtime", adapter: "pi", nativeType: "compact_done" },
              operationId,
            ));
          }
          return result;
        } catch (error) {
          if (this.operationLifecycle.finish("compact", operationId)) {
            this.emit(createKernelEvent(
              "operation.failed",
              this.getTaskId(),
              this.getRunId(),
              { operationKind: "compact", errorMessage: error instanceof Error ? error.message : String(error) },
              { kind: "runtime", adapter: "pi", nativeType: "compact_error" },
              operationId,
            ));
          }
          throw error;
        } finally {
          invalidateSessionListCache();
        }
      }

      case "abort_compaction": {
        this.inner.abortCompaction();
        const activeOperationId = this.operationLifecycle.abort("compact");
        if (activeOperationId) {
          this.emit(createKernelEvent(
            "operation.aborted",
            this.getTaskId(),
            this.getRunId(),
            { operationKind: "compact" },
            { kind: "runtime", adapter: "pi", nativeType: "abort_compaction" },
            activeOperationId,
          ));
        }
        return null;
      }

      case "bash": {
        if (this.promptRunning || this.inner.isStreaming || this.inner.isCompacting || this.inner.isBashRunning) {
          throw new Error("Cannot run a shell command while the session is busy");
        }
        const operationId = createOperationId("bash");
        this.operationLifecycle.begin("bash", operationId);
        this.emit(createKernelEvent(
          "operation.started",
          this.getTaskId(),
          this.getRunId(),
          { operationKind: "bash" },
          { kind: "runtime", adapter: "pi", nativeType: "bash" },
          operationId,
        ));
        const execution = this.inner.executeBash(
          command.command,
          undefined,
          { excludeFromContext: command.excludeFromContext },
        );
        notifyRunningChange();
        try {
          const result = await execution;
          this.persistBashOnlySession();
          if (this.operationLifecycle.finish("bash", operationId)) {
            this.emit(createKernelEvent(
              "operation.completed",
              this.getTaskId(),
              this.getRunId(),
              { operationKind: "bash", result: (result as Record<string, unknown>) ?? null },
              { kind: "runtime", adapter: "pi", nativeType: "bash_done" },
              operationId,
            ));
          }
          return result;
        } catch (error) {
          if (this.operationLifecycle.finish("bash", operationId)) {
            this.emit(createKernelEvent(
              "operation.failed",
              this.getTaskId(),
              this.getRunId(),
              { operationKind: "bash", errorMessage: error instanceof Error ? error.message : String(error) },
              { kind: "runtime", adapter: "pi", nativeType: "bash_error" },
              operationId,
            ));
          }
          throw error;
        } finally {
          invalidateSessionListCache();
          notifyRunningChange();
        }
      }

      case "abort_bash": {
        this.inner.abortBash();
        const activeOperationId = this.operationLifecycle.abort("bash");
        if (activeOperationId) {
          this.emit(createKernelEvent(
            "operation.aborted",
            this.getTaskId(),
            this.getRunId(),
            { operationKind: "bash" },
            { kind: "runtime", adapter: "pi", nativeType: "abort_bash" },
            activeOperationId,
          ));
        }
        return null;
      }

      default:
        throw new Error(`Unsupported command: ${type}`);
    }
  }

  destroy(): void {
    if (!this._alive) return;
    this._alive = false;
    if (this.idleTimer) clearTimeout(this.idleTimer);
    if (this.inner.isBashRunning) this.inner.abortBash();
    this.unsubscribe?.();
    this.extensionUi.dispose();
    this.onDestroyCallback?.();
    notifyRunningChange();
  }

}

export function getRpcSession(sessionId: string): AgentSessionWrapper | undefined {
  return getRegisteredSession<AgentSessionWrapper>(sessionId);
}

export function getRunningRpcSessionIds(): string[] {
  return getRunningSessionIds();
}

export function subscribeRunningSessions(listener: (ids: string[]) => void): () => void {
  return subscribeToRunningSessions(listener);
}

export function notifyRunningChange(): void {
  notifyRunningSessionsChanged();
}

/**
 * Get or create an AgentSession for the given session.
 * For new sessions (sessionFile === ""), pi generates its own id.
 * Pass toolNames to pre-configure active tools (empty array = all tools disabled).
 */
export async function startRpcSession(
  sessionId: string,
  sessionFile: string,
  cwd: string,
  toolNames?: string[],
  options: { taskId?: RuntimeContext["taskId"] } = {},
): Promise<{ session: AgentSessionWrapper; realSessionId: string; runtimeContext: RuntimeContext }> {
  const registry = getSessionRegistry<AgentSessionWrapper>();
  const locks = getSessionStartLocks<AgentSessionWrapper>();
  const kernelServices = getKernelServices();

  const existing = registry.get(sessionId);
  if (existing?.isAlive()) {
    return { session: existing, realSessionId: sessionId, runtimeContext: existing.getRuntimeContext() };
  }

  const inflight = locks.get(sessionId);
  if (inflight) return inflight;

  const starting = (async () => {
    let runtimeContext = sessionFile
      ? await kernelServices.piSessionReconciler.reconcileSession(sessionId)
      : null;

    const runtime = await createPiSession({
      cwd,
      sessionFile,
      toolNames,
    });

    if (toolNames && toolNames.length > 0) {
      runtime.session.setActiveToolsByName(withExtensionTools(runtime.session, toolNames));
    }

    const realSessionId = runtime.realSessionId;
    const realSessionFile = runtime.realSessionFile;
    if (realSessionFile) cacheSessionPath(realSessionId, realSessionFile);

    runtimeContext = runtimeContext ?? kernelServices.piSessionReconciler.ensureStartedPiSession({
      sessionId: realSessionId,
      cwd,
      taskId: options.taskId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const wrapper = new AgentSessionWrapper(runtime.session, runtimeContext);
    if (runtime.forceEmptySystemPrompt) wrapper.setForceEmptySystemPrompt(true);
    wrapper.start();

    wrapper.onDestroy(() => {
      runtime.dispose();
      registry.delete(realSessionId);
    });
    registry.set(realSessionId, wrapper);
    wrapper.beginExtensionBinding({ forceEmptySystemPrompt: runtime.forceEmptySystemPrompt });
    runtime.subscribeMcpStatus((snapshot) => wrapper.setMcpStatus(snapshot));

    return { session: wrapper, realSessionId, runtimeContext };
  })().finally(() => locks.delete(sessionId));

  locks.set(sessionId, starting);
  return starting;
}
