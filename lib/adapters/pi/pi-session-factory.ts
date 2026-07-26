import {
  createAgentSessionFromServices,
  createAgentSessionServices,
  createEventBus,
  getAgentDir,
  initTheme,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { MCP_STATUS_EVENT, isMcpAdapterInstalledAsPackage, resolveBundledMcpAdapterDir, type McpStatusSnapshot } from "../../mcp-extension";
import type { AgentSessionLike } from "../../pi-types";

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

  let mcpAdapterDir: string | null = null;
  try {
    const settingsProbe = SettingsManager.create(input.cwd, agentDir);
    mcpAdapterDir = isMcpAdapterInstalledAsPackage(settingsProbe) ? null : resolveBundledMcpAdapterDir();
  } catch (err) {
    console.warn("[pi-web] failed to check installed packages for pi-mcp-adapter:", err instanceof Error ? err.message : err);
    mcpAdapterDir = resolveBundledMcpAdapterDir();
  }

  const mcpEventBus = createEventBus();
  let latestSnapshot: McpStatusSnapshot | null = null;
  const listeners = new Set<(snapshot: McpStatusSnapshot) => void>();
  const unsubMcpStatus = mcpEventBus.on(MCP_STATUS_EVENT, (data) => {
    const snapshot = data as McpStatusSnapshot;
    latestSnapshot = snapshot;
    for (const listener of listeners) listener(snapshot);
  });

  const services = await createAgentSessionServices({
    cwd: input.cwd,
    agentDir,
    resourceLoaderOptions: {
      eventBus: mcpEventBus,
      ...(mcpAdapterDir ? { additionalExtensionPaths: [mcpAdapterDir] } : {}),
    },
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
    dispose: () => {
      listeners.clear();
      unsubMcpStatus();
    },
  };
}
