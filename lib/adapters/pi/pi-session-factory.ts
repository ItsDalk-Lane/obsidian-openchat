import {
  createAgentSessionFromServices,
  createAgentSessionServices,
  createEventBus,
  getAgentDir,
  initTheme,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { bundledExtensionSpecs } from "../../bundled";
import {
  MCP_CONTROL_NOTICE_EVENT,
  MCP_CONTROL_READY_EVENT,
  MCP_CONTROL_REQUEST_EVENT,
  MCP_CONTROL_RESULT_EVENT,
  MCP_STATUS_EVENT,
  isExtensionInstalledAsPackage,
  resolveBundledExtensionDir,
  type McpControlAction,
  type McpControlNotice,
  type McpControlResult,
  type McpStatusSnapshot,
} from "../../mcp-extension";
import {
  createProjectCommandBashExtension,
  preferUserBashExtension,
} from "../../project-command-env";
import type { AgentSessionLike } from "../../pi-types";
import { getProjectTrustStatus, projectTrustReloadOptions } from "../../project-trust";

export interface CreatePiSessionInput {
  cwd: string;
  sessionFile: string;
  toolNames?: string[];
}

export interface PiSessionFactoryResult {
  session: AgentSessionLike;
  realSessionId: string;
  realSessionFile: string | undefined;
  forceEmptySystemPrompt: boolean;
  subscribeMcpStatus: (listener: (snapshot: McpStatusSnapshot) => void) => () => void;
  /** True once the patched adapter has installed its control-channel listener. */
  isMcpControlReady: () => boolean;
  /** Send a reconnect/auth/logout request to the adapter; resolves with the correlated result. */
  sendMcpControl: (request: { action: McpControlAction; server?: string }) => Promise<McpControlResult>;
  /** Progress/user-facing messages from control operations (e.g. OAuth URLs). */
  subscribeMcpControlNotices: (listener: (notice: McpControlNotice) => void) => () => void;
  dispose: () => void;
}

function resolveToolOption(toolNames: string[] | undefined): string[] | undefined {
  if (toolNames === undefined) return undefined;
  return toolNames.length === 0 ? [] : undefined;
}

export async function createPiSession(input: CreatePiSessionInput): Promise<PiSessionFactoryResult> {
  initTheme();
  const agentDir = getAgentDir();
  const sessionManager = input.sessionFile
    ? SessionManager.open(input.sessionFile, undefined)
    : SessionManager.create(input.cwd, undefined);

  let settingsProbe: SettingsManager | null = null;
  let settingsProbeError: unknown;
  try {
    const trustStatus = getProjectTrustStatus(input.cwd, agentDir);
    settingsProbe = SettingsManager.create(input.cwd, agentDir, {
      projectTrusted: trustStatus.trusted,
    });
  } catch (err) {
    settingsProbeError = err;
  }

  const bundledExtensionPaths: string[] = [];
  for (const spec of bundledExtensionSpecs) {
    let installedAsPackage = false;
    try {
      if (settingsProbeError) throw settingsProbeError;
      installedAsPackage = settingsProbe
        ? isExtensionInstalledAsPackage(settingsProbe, spec.packageName)
        : false;
    } catch (err) {
      console.warn(`[pi-web] failed to check installed packages for ${spec.packageName}:`, err instanceof Error ? err.message : err);
    }
    if (installedAsPackage) continue;

    const extensionDir = resolveBundledExtensionDir(spec.packageName);
    if (!extensionDir) continue;
    spec.setup?.({ cwd: input.cwd });
    bundledExtensionPaths.push(extensionDir);
  }

  const mcpEventBus = createEventBus();
  let latestSnapshot: McpStatusSnapshot | null = null;
  const listeners = new Set<(snapshot: McpStatusSnapshot) => void>();
  const unsubMcpStatus = mcpEventBus.on(MCP_STATUS_EVENT, (data) => {
    const snapshot = data as McpStatusSnapshot;
    latestSnapshot = snapshot;
    for (const listener of listeners) listener(snapshot);
  });

  // pi-web control channel (patched adapter): ready flag, correlated results,
  // and forwarded notices. Listeners are registered before the extension loads
  // so the ready event emitted during factory install is never missed.
  let mcpControlReady = false;
  let mcpControlCounter = 0;
  const controlNoticeListeners = new Set<(notice: McpControlNotice) => void>();
  const pendingControlRequests = new Map<string, {
    resolve: (result: McpControlResult) => void;
    timer: ReturnType<typeof setTimeout>;
  }>();
  const failPendingControlRequests = (message: string) => {
    for (const [requestId, pending] of pendingControlRequests) {
      clearTimeout(pending.timer);
      pending.resolve({ requestId, ok: false, message });
    }
    pendingControlRequests.clear();
  };
  const unsubControlReady = mcpEventBus.on(MCP_CONTROL_READY_EVENT, () => {
    mcpControlReady = true;
  });
  const unsubControlResult = mcpEventBus.on(MCP_CONTROL_RESULT_EVENT, (data) => {
    const result = data as McpControlResult;
    const pending = pendingControlRequests.get(result.requestId);
    if (!pending) return;
    pendingControlRequests.delete(result.requestId);
    clearTimeout(pending.timer);
    pending.resolve(result);
  });
  const unsubControlNotice = mcpEventBus.on(MCP_CONTROL_NOTICE_EVENT, (data) => {
    const notice = data as McpControlNotice;
    if (typeof notice?.text !== "string") return;
    for (const listener of controlNoticeListeners) listener(notice);
  });

  const services = await createAgentSessionServices({
    cwd: input.cwd,
    agentDir,
    settingsManager: settingsProbe ?? undefined,
    resourceLoaderOptions: {
      eventBus: mcpEventBus,
      extensionFactories: [
        createProjectCommandBashExtension({
          cwd: input.cwd,
          settings: settingsProbe ?? SettingsManager.create(input.cwd, agentDir),
        }),
      ],
      extensionsOverride: preferUserBashExtension,
      ...(bundledExtensionPaths.length > 0
        ? { additionalExtensionPaths: bundledExtensionPaths }
        : {}),
    },
    resourceLoaderReloadOptions: projectTrustReloadOptions(input.cwd, agentDir),
  });
  const toolsOption = resolveToolOption(input.toolNames);
  const { session } = await createAgentSessionFromServices({
    services,
    sessionManager,
    ...(toolsOption !== undefined ? { tools: toolsOption } : {}),
  });

  return {
    session: session as AgentSessionLike,
    realSessionId: session.sessionId as string,
    realSessionFile: session.sessionFile as string | undefined,
    forceEmptySystemPrompt: input.toolNames?.length === 0,
    subscribeMcpStatus: (listener) => {
      listeners.add(listener);
      if (latestSnapshot) listener(latestSnapshot);
      return () => {
        listeners.delete(listener);
      };
    },
    isMcpControlReady: () => mcpControlReady,
    sendMcpControl: (request) => {
      if (!mcpControlReady) {
        return Promise.resolve({ requestId: "", ok: false, message: "MCP control channel unavailable" });
      }
      const requestId = `mcpctl-${Date.now().toString(36)}-${++mcpControlCounter}`;
      return new Promise<McpControlResult>((resolve) => {
        const timer = setTimeout(() => {
          pendingControlRequests.delete(requestId);
          resolve({ requestId, ok: false, message: "MCP control request timed out" });
        }, 120_000);
        timer.unref?.();
        pendingControlRequests.set(requestId, { resolve, timer });
        mcpEventBus.emit(MCP_CONTROL_REQUEST_EVENT, {
          requestId,
          action: request.action,
          ...(request.server ? { server: request.server } : {}),
        });
      });
    },
    subscribeMcpControlNotices: (listener) => {
      controlNoticeListeners.add(listener);
      return () => {
        controlNoticeListeners.delete(listener);
      };
    },
    dispose: () => {
      listeners.clear();
      unsubMcpStatus();
      controlNoticeListeners.clear();
      failPendingControlRequests("MCP control channel closed");
      unsubControlReady();
      unsubControlResult();
      unsubControlNotice();
    },
  };
}
