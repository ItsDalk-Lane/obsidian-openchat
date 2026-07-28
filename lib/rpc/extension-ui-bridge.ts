import { randomUUID } from "crypto";
import type { AgentSessionLike, ExtensionUiContextLike } from "../pi-types";
import type { ExtensionUiRequest, ExtensionUiResponse, ExtensionWidgetItem } from "../types";
import { createHeadlessCustomUiTui, DEFAULT_CUSTOM_UI_COLUMNS } from "../custom-ui-terminal";
import { CUSTOM_UI_KEYBINDINGS, PLAIN_TEXT_THEME } from "../adapters/pi";
import {
  createKernelEvent,
  type KernelEvent,
  type RuntimeContext,
} from "../kernel";

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

export type ExtensionCommandContextActionsLike = {
  waitForIdle: () => Promise<void>;
  newSession: () => Promise<{ cancelled: boolean }>;
  fork: () => Promise<{ cancelled: boolean }>;
  navigateTree: (targetId: string, options?: { summarize?: boolean }) => Promise<{ cancelled: boolean }>;
  switchSession: () => Promise<{ cancelled: boolean }>;
  reload: () => Promise<void>;
};

interface ExtensionUiBridgeOptions {
  inner: AgentSessionLike;
  runtimeContext: RuntimeContext;
  getOperationId: () => string | undefined;
  emit: (event: KernelEvent) => void;
  applyForcedEmptySystemPrompt: () => void;
  prepareReload: () => void;
}

export class ExtensionUiBridge {
  private pendingResponses = new Map<string, PendingUiResponse>();
  private pendingRequests = new Map<string, KernelEvent>();
  private activeCustomUis = new Map<string, ActiveCustomUi>();
  private statuses = new Map<string, string>();
  private widgets = new Map<string, ExtensionWidgetItem>();

  constructor(private readonly options: ExtensionUiBridgeOptions) {}

  replayPendingRequests(listener: (event: KernelEvent) => void): void {
    for (const event of this.pendingRequests.values()) listener(event);
  }

  getStatuses(): Array<{ key: string; text: string }> {
    return Array.from(this.statuses, ([key, text]) => ({ key, text }));
  }

  getWidgets(): ExtensionWidgetItem[] {
    return Array.from(this.widgets.values());
  }

  clearDecorations(): void {
    this.statuses.clear();
    this.widgets.clear();
  }

  resolveResponse(response: ExtensionUiResponse): void {
    const pending = this.pendingResponses.get(response.id);
    if (pending) pending.resolve(response);
  }

  handleInput(id: string, data: string): void {
    const custom = this.activeCustomUis.get(id);
    if (!custom || typeof data !== "string") return;
    try {
      custom.component.handleInput?.(data);
      if (this.activeCustomUis.has(id)) this.emitCustomUiRender(id, custom);
    } catch (error) {
      this.closeCustomUi(id, undefined);
      this.emitError({
        extensionPath: `custom-ui:${id}`,
        event: "custom_ui_input",
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }

  dispose(): void {
    for (const pending of this.pendingResponses.values()) pending.cancel();
    for (const id of Array.from(this.activeCustomUis.keys())) {
      this.closeCustomUi(id, undefined);
    }
    this.pendingResponses.clear();
    this.pendingRequests.clear();
  }

  emitNotification(message: string, notifyType: "info" | "warning" | "error" = "info"): void {
    this.emitRequest({
      type: "extension_ui_request",
      id: randomUUID(),
      method: "notify",
      notifyType,
      message,
    });
  }

  emitError(payload: { extensionPath?: string; event?: string; errorMessage: string }): void {
    this.options.emit(createKernelEvent(
      "extension.failed",
      this.options.runtimeContext.taskId,
      this.options.runtimeContext.runId,
      payload,
      { kind: "extension", adapter: "pi", nativeType: "extension_error" },
      this.options.getOperationId(),
    ));
  }

  createContext(): ExtensionUiContextLike {
    return {
      select: (title, options, dialogOptions) => this.request(
        { method: "select", title, options, ...(dialogOptions?.timeout ? { timeout: dialogOptions.timeout } : {}) },
        undefined,
        (response) => "value" in response ? response.value : undefined,
        dialogOptions?.timeout,
        dialogOptions?.signal,
      ),
      confirm: (title, message, dialogOptions) => this.request(
        { method: "confirm", title, message, ...(dialogOptions?.timeout ? { timeout: dialogOptions.timeout } : {}) },
        false,
        (response) => "confirmed" in response ? response.confirmed : false,
        dialogOptions?.timeout,
        dialogOptions?.signal,
      ),
      input: (title, placeholder, dialogOptions) => this.request(
        { method: "input", title, ...(placeholder !== undefined ? { placeholder } : {}), ...(dialogOptions?.timeout ? { timeout: dialogOptions.timeout } : {}) },
        undefined,
        (response) => "value" in response ? response.value : undefined,
        dialogOptions?.timeout,
        dialogOptions?.signal,
      ),
      editor: (title, prefill, dialogOptions) => this.request(
        { method: "editor", title, ...(prefill !== undefined ? { prefill } : {}), ...(dialogOptions?.timeout ? { timeout: dialogOptions.timeout } : {}) },
        undefined,
        (response) => "value" in response ? response.value : undefined,
        dialogOptions?.timeout,
        dialogOptions?.signal,
      ),
      notify: (message, type) => this.emitNotification(message, type),
      onTerminalInput: () => () => {},
      setStatus: (key, text) => {
        if (text === undefined) this.statuses.delete(key);
        else this.statuses.set(key, text);
        this.emitRequest({
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
          this.widgets.delete(key);
        } else {
          this.widgets.set(key, {
            key,
            lines: content,
            placement: options?.placement ?? "aboveEditor",
          });
        }
        this.emitRequest({
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
        this.emitRequest({
          type: "extension_ui_request",
          id: randomUUID(),
          method: "setTitle",
          title,
        });
      },
      custom: <T = unknown>(factory: unknown, options?: unknown) => this.requestCustom<T>(factory, options),
      pasteToEditor: (text) => {
        this.emitRequest({
          type: "extension_ui_request",
          id: randomUUID(),
          method: "set_editor_text",
          text,
        });
      },
      setEditorText: (text) => {
        this.emitRequest({
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

  createCommandContextActions(): ExtensionCommandContextActionsLike {
    const { inner } = this.options;
    return {
      waitForIdle: async () => {
        const agent = inner.agent as { waitForIdle?: () => Promise<void> };
        await agent.waitForIdle?.();
      },
      newSession: async () => ({ cancelled: true }),
      fork: async () => ({ cancelled: true }),
      navigateTree: async (targetId, options) => {
        const result = await inner.navigateTree(targetId, { summarize: options?.summarize });
        return { cancelled: result.cancelled };
      },
      switchSession: async () => ({ cancelled: true }),
      reload: async () => {
        this.options.prepareReload();
        this.clearDecorations();
        await inner.reload({
          beforeSessionStart: () => {
            inner.extensionRunner.setUIContext?.(this.createContext(), "rpc");
          },
        });
        this.options.applyForcedEmptySystemPrompt();
      },
    };
  }

  private emitRequest(request: ExtensionUiRequest): KernelEvent {
    const event = createKernelEvent(
      "extension.ui.requested",
      this.options.runtimeContext.taskId,
      this.options.runtimeContext.runId,
      { request },
      { kind: "extension", adapter: "pi", nativeType: "extension_ui_request" },
      this.options.getOperationId(),
    );
    this.pendingRequests.set(request.id, event);
    this.options.emit(event);
    return event;
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
    this.emitRequest({
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
    this.pendingRequests.delete(id);
    try {
      custom.component.dispose?.();
    } catch {
      // 扩展清理失败不能阻断主会话销毁
    }
    this.emitRequest({
      type: "extension_ui_request",
      id,
      method: "custom",
      lines: [],
      closed: true,
    });
    custom.resolve(value);
  }

  private requestCustom<T>(factory: unknown, options?: unknown): Promise<T> {
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
              // 组件挂载前已经结束时，清理失败不影响主流程
            }
            return;
          }
          if (
            !component
            || typeof component !== "object"
            || typeof (component as CustomUiComponent).render !== "function"
          ) {
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
          this.emitError({
            extensionPath: `custom-ui:${id}`,
            event: "custom_ui",
            errorMessage: error instanceof Error ? error.message : String(error),
          });
          finish(undefined as T);
        });
    });
  }

  private request<T>(
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
        this.pendingRequests.delete(id);
        this.pendingResponses.delete(id);
      };
      const settle = (value: T) => {
        cleanup();
        resolve(value);
      };
      const onAbort = () => settle(defaultValue);

      if (timeout) timeoutId = setTimeout(() => settle(defaultValue), timeout);
      signal?.addEventListener("abort", onAbort, { once: true });

      this.pendingResponses.set(id, {
        resolve: (response) => settle(parseResponse(response)),
        cancel: () => settle(defaultValue),
      });
      this.emitRequest(fullRequest);
    });
  }
}
