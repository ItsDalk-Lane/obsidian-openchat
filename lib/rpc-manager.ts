import { SessionManager } from "@earendil-works/pi-coding-agent";
import { randomUUID } from "crypto";
import { existsSync, writeFileSync } from "fs";
import { invalidateModelsCache } from "./models-cache";
import type { McpStatusSnapshot } from "./mcp-extension";
import { cacheSessionPath, invalidateSessionListCache } from "./session-reader";
import type { SlashCommandInfo } from "@earendil-works/pi-coding-agent";
import type { AgentSessionLike, ExtensionUiContextLike } from "./pi-types";
import type { ExtensionUiRequest, ExtensionUiResponse, ExtensionWidgetItem } from "./types";
import { createHeadlessCustomUiTui, DEFAULT_CUSTOM_UI_COLUMNS } from "./custom-ui-terminal";
import {
  CUSTOM_UI_KEYBINDINGS,
  PLAIN_TEXT_THEME,
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
import { ensureKernelStartupRecovery, getKernelServices } from "./application/services";

// ============================================================================
// Types
// ============================================================================

type EventListener = (event: KernelEvent) => void;

type PendingUiResponse = {
  resolve: (response: ExtensionUiResponse) => void;
  cancel: () => void;
};

type CustomUiComponent = {
  render: (width: number) => string[];
  handleInput?: (data: string) => void;
  dispose?: () => void;
  invalidate?: () => void;
};

type ActiveCustomUi = {
  component: CustomUiComponent;
  width: number;
  resolve: (value: unknown) => void;
  settled: boolean;
};

type ExtensionUiRequestBody = Record<string, unknown> & {
  method: ExtensionUiRequest["method"];
  timeout?: number;
  expiresAt?: number;
};

type ExtensionCommandContextActionsLike = {
  waitForIdle: () => Promise<void>;
  newSession: () => Promise<{ cancelled: boolean }>;
  fork: () => Promise<{ cancelled: boolean }>;
  navigateTree: (targetId: string, options?: { summarize?: boolean }) => Promise<{ cancelled: boolean }>;
  switchSession: () => Promise<{ cancelled: boolean }>;
  reload: () => Promise<void>;
};

type ExtensionBindingOptions = {
  forceEmptySystemPrompt?: boolean;
};

type OperationKind = "prompt" | "bash" | "compact";

class OperationLifecycleTracker {
  private active = new Map<OperationKind, string>();
  private terminal = new Set<string>();

  begin(kind: OperationKind, operationId: string): void {
    this.active.set(kind, operationId);
    this.terminal.delete(operationId);
  }

  current(kind: OperationKind): string | undefined {
    return this.active.get(kind);
  }

  finish(kind: OperationKind, operationId: string): boolean {
    const active = this.active.get(kind);
    if (!active || active !== operationId || this.terminal.has(operationId)) return false;
    this.terminal.add(operationId);
    this.active.delete(kind);
    return true;
  }

  abort(kind: OperationKind): string | undefined {
    const active = this.active.get(kind);
    if (!active || this.terminal.has(active)) return undefined;
    this.terminal.add(active);
    this.active.delete(kind);
    return active;
  }
}

// ============================================================================
// AgentSessionWrapper
// Wraps AgentSession with the same interface the rest of the app expects
// ============================================================================

export class AgentSessionWrapper {
  private listeners: EventListener[] = [];
  private pendingUiResponses = new Map<string, PendingUiResponse>();
  private pendingUiRequests = new Map<string, KernelEvent>();
  private activeCustomUis = new Map<string, ActiveCustomUi>();
  private extensionStatuses = new Map<string, string>();
  private extensionWidgets = new Map<string, ExtensionWidgetItem>();
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

  constructor(
    public readonly inner: AgentSessionLike,
    private readonly runtimeContext: RuntimeContext,
  ) {
    this.runtime = new PiRuntimeAdapter(inner);
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
      const uiContext = this.createExtensionUiContext();
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
          commandContextActions: this.createExtensionCommandContextActions(),
          shutdownHandler: () => this.emitExtensionUiRequest({
            type: "extension_ui_request",
            id: randomUUID(),
            method: "notify",
            notifyType: "warning",
            message: "Extension requested shutdown, but shutdown is not supported in Pi Web.",
          }),
          onError: (error) => this.emitExtensionError({
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

  private emitExtensionUiRequest(request: ExtensionUiRequest): KernelEvent {
    const event = createKernelEvent(
      "extension.ui.requested",
      this.getTaskId(),
      this.getRunId(),
      { request },
      { kind: "extension", adapter: "pi", nativeType: "extension_ui_request" },
      this.getCurrentOperationId(),
    );
    this.pendingUiRequests.set(request.id, event);
    this.emit(event);
    return event;
  }

  private emitExtensionError(payload: { extensionPath?: string; event?: string; errorMessage: string }): void {
    this.emit(createKernelEvent(
      "extension.failed",
      this.getTaskId(),
      this.getRunId(),
      payload,
      { kind: "extension", adapter: "pi", nativeType: "extension_error" },
      this.getCurrentOperationId(),
    ));
  }

  private emit(event: KernelEvent): void {
    getKernelServices().eventService.tryAppendRuntimeEvent(event);
    for (const l of this.listeners) l(event);
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
    for (const event of this.pendingUiRequests.values()) listener(event);
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

      case "get_state": {
        const state = this.runtime.getState(this.promptRunning);
        return {
          ...state,
          messageCount: 0,
          extensionStatuses: this.getExtensionStatuses(),
          extensionWidgets: this.getExtensionWidgets(),
          mcpStatus: this.mcpStatus,
        };
      }

      case "set_model": {
        const { provider, modelId } = command as { provider: string; modelId: string };
        let model = this.inner.modelRuntime.getModel(provider, modelId);
        if (!model) {
          await this.inner.modelRuntime.refresh?.({ allowNetwork: false });
          model = this.inner.modelRuntime.getModel(provider, modelId);
        }
        if (!model) throw new Error(`Model not found: ${provider}/${modelId}`);
        await this.inner.setModel(model);
        invalidateModelsCache();
        invalidateSessionListCache();
        return { id: model.id, provider: model.provider };
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

      case "set_thinking_level": {
        this.runtime.setThinkingLevel(command.level);
        invalidateSessionListCache();
        return null;
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

      case "set_session_name": {
        const name = command.name?.trim();
        if (!name) throw new Error("Session name cannot be empty");
        this.inner.setSessionName(name);
        invalidateSessionListCache();
        return null;
      }

      case "get_session_stats": {
        return {
          ...this.inner.getSessionStats(),
          sessionName: this.inner.sessionManager.getSessionName(),
        };
      }

      case "get_last_assistant_text": {
        return { text: this.inner.getLastAssistantText() ?? "" };
      }

      case "set_auto_compaction": {
        this.inner.setAutoCompactionEnabled(command.enabled);
        return null;
      }

      case "clear_queue": {
        // Full clear only: pi has no single-item dequeue, and clear+requeue
        // races against the agent loop pulling messages mid-flight.
        return this.inner.clearQueue();
      }

      case "steer": {
        const steerImages = parseAgentImages(command.images, "steer");
        await this.inner.steer(command.message, steerImages);
        return null;
      }

      case "follow_up": {
        const followImages = parseAgentImages(command.images, "follow_up");
        await this.inner.followUp(command.message, followImages);
        return null;
      }

      case "get_tools": {
        return this.runtime.getTools();
      }

      case "get_commands": {
        const commands: SlashCommandInfo[] = [];
        for (const registered of this.inner.extensionRunner.getRegisteredCommands()) {
          commands.push({
            name: registered.invocationName,
            description: registered.description,
            source: "extension",
            sourceInfo: registered.sourceInfo,
          });
        }
        for (const template of this.inner.promptTemplates) {
          commands.push({
            name: template.name,
            description: template.description,
            source: "prompt",
            sourceInfo: template.sourceInfo,
          });
        }
        for (const skill of this.inner.resourceLoader.getSkills().skills) {
          commands.push({
            name: `skill:${skill.name}`,
            description: skill.description,
            source: "skill",
            sourceInfo: skill.sourceInfo,
          });
        }
        return { commands };
      }

      case "set_tools": {
        const toolNames = command.toolNames;
        this.setForceEmptySystemPrompt(toolNames.length === 0);
        this.runtime.setTools(toolNames);
        this.applyForcedEmptySystemPrompt();
        return null;
      }

      case "reload": {
        await this.waitForExtensionsBound();
        this.extensionStatuses.clear();
        this.extensionWidgets.clear();
        await this.inner.reload();
        if (typeof this.inner.bindExtensions !== "function") {
          this.inner.extensionRunner.setUIContext?.(this.createExtensionUiContext(), "rpc");
        }
        this.applyForcedEmptySystemPrompt();
        return { success: true };
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

      case "extension_ui_response": {
        this.resolveExtensionUiResponse(command);
        return null;
      }

      case "extension_ui_input": {
        this.handleExtensionUiInput(command.id, command.data);
        return null;
      }

      case "set_auto_retry": {
        this.inner.setAutoRetryEnabled(command.enabled);
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
    for (const pending of this.pendingUiResponses.values()) pending.cancel();
    for (const id of Array.from(this.activeCustomUis.keys())) this.closeCustomUi(id, undefined);
    this.pendingUiResponses.clear();
    this.pendingUiRequests.clear();
    this.onDestroyCallback?.();
    notifyRunningChange();
  }

  private resolveExtensionUiResponse(response: ExtensionUiResponse): void {
    const pending = this.pendingUiResponses.get(response.id);
    if (!pending) return;
    pending.resolve(response);
  }

  private getExtensionStatuses(): Array<{ key: string; text: string }> {
    return Array.from(this.extensionStatuses, ([key, text]) => ({ key, text }));
  }

  private getExtensionWidgets(): ExtensionWidgetItem[] {
    return Array.from(this.extensionWidgets.values());
  }

  private getCustomUiWidth(options: unknown): number {
    if (!options || typeof options !== "object") return DEFAULT_CUSTOM_UI_COLUMNS;
    const overlayOptions = (options as { overlayOptions?: unknown }).overlayOptions;
    const resolved = typeof overlayOptions === "function" ? overlayOptions() : overlayOptions;
    if (!resolved || typeof resolved !== "object") return DEFAULT_CUSTOM_UI_COLUMNS;
    const width = (resolved as { width?: unknown }).width;
    return typeof width === "number" && Number.isFinite(width)
      ? Math.max(40, Math.min(140, Math.round(width)))
      : 92;
  }

  private emitCustomUiRender(id: string, custom: ActiveCustomUi): void {
    let lines: string[];
    try {
      lines = custom.component.render(custom.width);
    } catch (error) {
      lines = [`Extension custom UI render failed: ${error instanceof Error ? error.message : String(error)}`];
    }
    this.emitExtensionUiRequest({
      type: "extension_ui_request",
      id,
      method: "custom",
      lines,
    });
  }

  private closeCustomUi(id: string, value: unknown): void {
    const custom = this.activeCustomUis.get(id);
    if (!custom || custom.settled) return;
    custom.settled = true;
    this.activeCustomUis.delete(id);
    this.pendingUiRequests.delete(id);
    try {
      custom.component.dispose?.();
    } catch {
      // Ignore dispose errors from extension UI components.
    }
    this.emitExtensionUiRequest({
      type: "extension_ui_request",
      id,
      method: "custom",
      lines: [],
      closed: true,
    });
    custom.resolve(value);
  }

  private handleExtensionUiInput(id: string, data: string): void {
    const custom = this.activeCustomUis.get(id);
    if (!custom || typeof data !== "string") return;
    try {
      custom.component.handleInput?.(data);
      if (this.activeCustomUis.has(id)) this.emitCustomUiRender(id, custom);
    } catch (error) {
      this.closeCustomUi(id, undefined);
      this.emitExtensionError({
        extensionPath: `custom-ui:${id}`,
        event: "custom_ui_input",
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private requestExtensionCustomUi<T>(
    factory: unknown,
    options?: unknown,
  ): Promise<T> {
    if (typeof factory !== "function") return Promise.resolve(undefined as T);

    const id = randomUUID();
    const width = this.getCustomUiWidth(options);

    return new Promise<T>((resolve) => {
      let completed = false;
      const tui = createHeadlessCustomUiTui(
        () => {
          const custom = this.activeCustomUis.get(id);
          if (custom) this.emitCustomUiRender(id, custom);
        },
        width,
      );
      const finish = (value: T) => {
        if (completed) return;
        completed = true;
        resolve(value);
      };
      const done = (value: T) => {
        if (this.activeCustomUis.has(id)) {
          this.closeCustomUi(id, value);
        } else {
          finish(value);
        }
      };

      Promise.resolve()
        .then(() => factory(tui, PLAIN_TEXT_THEME, CUSTOM_UI_KEYBINDINGS, done))
        .then((component) => {
          if (completed) {
            try {
              (component as CustomUiComponent | undefined)?.dispose?.();
            } catch {
              // Ignore dispose errors from a component completed before mounting.
            }
            return;
          }
          if (!component || typeof component !== "object" || typeof (component as CustomUiComponent).render !== "function") {
            finish(undefined as T);
            return;
          }
          const custom: ActiveCustomUi = {
            component: component as CustomUiComponent,
            width,
            resolve: (value) => finish(value as T),
            settled: false,
          };
          this.activeCustomUis.set(id, custom);
          this.emitCustomUiRender(id, custom);
        })
        .catch((error) => {
          if (completed) return;
          this.emitExtensionError({
            extensionPath: `custom-ui:${id}`,
            event: "custom_ui",
            errorMessage: error instanceof Error ? error.message : String(error),
          });
          finish(undefined as T);
        });
    });
  }

  private requestExtensionUi<T>(
    request: ExtensionUiRequestBody,
    defaultValue: T,
    parseResponse: (response: ExtensionUiResponse) => T,
    timeout?: number,
    signal?: AbortSignal,
  ): Promise<T> {
    if (signal?.aborted) return Promise.resolve(defaultValue);

    const id = randomUUID();
    const fullRequest = {
      type: "extension_ui_request",
      id,
      ...request,
      ...(timeout ? { timeout, expiresAt: Date.now() + timeout } : {}),
    } as ExtensionUiRequest;

    return new Promise((resolve) => {
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      const cleanup = () => {
        if (timeoutId) clearTimeout(timeoutId);
        signal?.removeEventListener("abort", onAbort);
        this.pendingUiRequests.delete(id);
        this.pendingUiResponses.delete(id);
      };
      const settle = (value: T) => {
        cleanup();
        resolve(value);
      };
      const onAbort = () => settle(defaultValue);

      if (timeout) timeoutId = setTimeout(() => settle(defaultValue), timeout);
      signal?.addEventListener("abort", onAbort, { once: true });

      this.pendingUiResponses.set(id, {
        resolve: (response) => settle(parseResponse(response)),
        cancel: () => settle(defaultValue),
      });
      this.emitExtensionUiRequest(fullRequest);
    });
  }

  private createExtensionUiContext(): ExtensionUiContextLike {
    return {
      select: (title, options, opts) => this.requestExtensionUi(
        { method: "select", title, options, ...(opts?.timeout ? { timeout: opts.timeout } : {}) },
        undefined,
        (response) => "value" in response ? response.value : undefined,
        opts?.timeout,
        opts?.signal,
      ),
      confirm: (title, message, opts) => this.requestExtensionUi(
        { method: "confirm", title, message, ...(opts?.timeout ? { timeout: opts.timeout } : {}) },
        false,
        (response) => "confirmed" in response ? response.confirmed : false,
        opts?.timeout,
        opts?.signal,
      ),
      input: (title, placeholder, opts) => this.requestExtensionUi(
        { method: "input", title, ...(placeholder !== undefined ? { placeholder } : {}), ...(opts?.timeout ? { timeout: opts.timeout } : {}) },
        undefined,
        (response) => "value" in response ? response.value : undefined,
        opts?.timeout,
        opts?.signal,
      ),
      editor: (title, prefill, opts) => this.requestExtensionUi(
        { method: "editor", title, ...(prefill !== undefined ? { prefill } : {}), ...(opts?.timeout ? { timeout: opts.timeout } : {}) },
        undefined,
        (response) => "value" in response ? response.value : undefined,
        opts?.timeout,
        opts?.signal,
      ),
      notify: (message, type) => {
        this.emitExtensionUiRequest({
          type: "extension_ui_request",
          id: randomUUID(),
          method: "notify",
          message,
          notifyType: type,
        });
      },
      onTerminalInput: () => () => {},
      setStatus: (key, text) => {
        if (text === undefined) this.extensionStatuses.delete(key);
        else this.extensionStatuses.set(key, text);
        this.emitExtensionUiRequest({
          type: "extension_ui_request",
          id: randomUUID(),
          method: "setStatus",
          statusKey: key,
          statusText: text,
        });
      },
      setWorkingMessage: () => {},
      setWorkingVisible: () => {},
      setWorkingIndicator: () => {},
      setHiddenThinkingLabel: () => {},
      setWidget: (key, content, options) => {
        if (content !== undefined && !Array.isArray(content)) return;
        if (content === undefined) {
          this.extensionWidgets.delete(key);
        } else {
          this.extensionWidgets.set(key, {
            key,
            lines: content,
            placement: options?.placement ?? "aboveEditor",
          });
        }
        this.emitExtensionUiRequest({
          type: "extension_ui_request",
          id: randomUUID(),
          method: "setWidget",
          widgetKey: key,
          widgetLines: content,
          widgetPlacement: options?.placement,
        });
      },
      setFooter: () => {},
      setHeader: () => {},
      setTitle: (title) => {
        this.emitExtensionUiRequest({
          type: "extension_ui_request",
          id: randomUUID(),
          method: "setTitle",
          title,
        });
      },
      custom: <T = unknown>(factory: unknown, options?: unknown) => this.requestExtensionCustomUi<T>(factory, options),
      pasteToEditor: (text) => {
        this.emitExtensionUiRequest({
          type: "extension_ui_request",
          id: randomUUID(),
          method: "set_editor_text",
          text,
        });
      },
      setEditorText: (text) => {
        this.emitExtensionUiRequest({
          type: "extension_ui_request",
          id: randomUUID(),
          method: "set_editor_text",
          text,
        });
      },
      getEditorText: () => "",
      addAutocompleteProvider: () => {},
      setEditorComponent: () => {},
      getEditorComponent: () => undefined,
      get theme() { return PLAIN_TEXT_THEME; },
      getAllThemes: () => [],
      getTheme: () => undefined,
      setTheme: () => ({ success: false, error: "Theme switching is not supported in Pi Web extension UI yet" }),
      getToolsExpanded: () => false,
      setToolsExpanded: () => {},
    };
  }

  private createExtensionCommandContextActions(): ExtensionCommandContextActionsLike {
    return {
      waitForIdle: async () => {
        const agent = this.inner.agent as { waitForIdle?: () => Promise<void> };
        await agent.waitForIdle?.();
      },
      newSession: async () => ({ cancelled: true }),
      fork: async () => ({ cancelled: true }),
      navigateTree: async (targetId, options) => {
        const result = await this.inner.navigateTree(targetId, { summarize: options?.summarize });
        return { cancelled: result.cancelled };
      },
      switchSession: async () => ({ cancelled: true }),
      reload: async () => {
        this.extensionStatuses.clear();
        this.extensionWidgets.clear();
        await this.inner.reload({
          beforeSessionStart: () => {
            this.inner.extensionRunner.setUIContext?.(this.createExtensionUiContext(), "rpc");
          },
        });
        this.applyForcedEmptySystemPrompt();
      },
    };
  }
}

// ============================================================================
// Session registry
// ============================================================================

declare global {
  var __piSessions: Map<string, AgentSessionWrapper> | undefined;
  var __piStartLocks: Map<string, Promise<{ session: AgentSessionWrapper; realSessionId: string; runtimeContext: RuntimeContext }>> | undefined;
  var __piRunningListeners: Set<(ids: string[]) => void> | undefined;
}

function getRegistry(): Map<string, AgentSessionWrapper> {
  if (!globalThis.__piSessions) {
    globalThis.__piSessions = new Map();
    ensureKernelStartupRecovery();
    const cleanup = () => globalThis.__piSessions?.forEach((s) => s.destroy());
    process.once("exit", cleanup);
    process.once("SIGINT", cleanup);
    process.once("SIGTERM", cleanup);
  }
  return globalThis.__piSessions;
}

function getLocks(): Map<string, Promise<{ session: AgentSessionWrapper; realSessionId: string; runtimeContext: RuntimeContext }>> {
  if (!globalThis.__piStartLocks) globalThis.__piStartLocks = new Map();
  return globalThis.__piStartLocks;
}

export function getRpcSession(sessionId: string): AgentSessionWrapper | undefined {
  return getRegistry().get(sessionId);
}

export function getRunningRpcSessionIds(): string[] {
  const ids = new Set<string>();
  for (const [sessionId, session] of getRegistry()) {
    if (session.isRunning()) ids.add(session.sessionId || sessionId);
  }
  return [...ids];
}

// ----------------------------------------------------------------------------
// Running-status broadcaster
//
// Pushes the current set of running session ids to subscribers whenever any
// session's running state may have changed. This lets the sidebar receive live
// updates over SSE instead of polling. Listeners live on globalThis so they
// survive Next.js hot-reload.
// ----------------------------------------------------------------------------

function getRunningListeners(): Set<(ids: string[]) => void> {
  if (!globalThis.__piRunningListeners) globalThis.__piRunningListeners = new Set();
  return globalThis.__piRunningListeners;
}

/** Subscribe to running-session-id changes. Returns an unsubscribe function. */
export function subscribeRunningSessions(listener: (ids: string[]) => void): () => void {
  const listeners = getRunningListeners();
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

let lastRunningSnapshot = "";

/**
 * Recompute the running-session-id set and, if it changed since the last
 * notification, broadcast it to subscribers. Cheap to call often.
 */
export function notifyRunningChange(): void {
  const ids = getRunningRpcSessionIds();
  const snapshot = JSON.stringify([...ids].sort());
  if (snapshot === lastRunningSnapshot) return;
  lastRunningSnapshot = snapshot;
  for (const listener of getRunningListeners()) {
    try { listener(ids); } catch { /* ignore listener errors */ }
  }
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
  const registry = getRegistry();
  const locks = getLocks();
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
