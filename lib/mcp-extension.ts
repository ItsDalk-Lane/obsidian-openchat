import { existsSync } from "fs";
import { createRequire } from "module";
import { dirname, join } from "path";
import type { SettingsManager } from "@earendil-works/pi-coding-agent";

// ============================================================================
// Bundled pi-mcp-adapter extension
//
// pi-web ships pi-mcp-adapter as an npm dependency and injects its package
// directory into every AgentSession via resourceLoaderOptions.
// additionalExtensionPaths — the same code path `pi install npm:pi-mcp-adapter`
// uses, so behavior matches the pi CLI exactly.
// ============================================================================

/** Event-bus channel the adapter publishes read-only status snapshots on. */
export const MCP_STATUS_EVENT = "pi-mcp-adapter/status/v1";

export type McpServerRuntimeStatus =
  | "connected"
  | "cached"
  | "failed"
  | "needs-auth"
  | "not-connected"
  | "disabled";

export interface McpServerStatusSnapshot {
  readonly name: string;
  readonly status: McpServerRuntimeStatus;
  readonly toolCount: number;
  readonly resourceCount?: number;
  readonly failedAgoSeconds?: number;
  readonly disabled: boolean;
}

export interface McpStatusSnapshot {
  readonly version: number;
  readonly servers: ReadonlyArray<McpServerStatusSnapshot>;
  readonly totalTools: number;
  readonly totalResources: number;
  readonly connectedCount: number;
  readonly disabledCount: number;
}

let cachedAdapterDir: string | null | undefined;

/**
 * Resolve the bundled pi-mcp-adapter package directory.
 * Returns null (with a one-time warning) when the package cannot be found so
 * session startup never fails because of the bundled extension.
 */
export function resolveBundledMcpAdapterDir(): string | null {
  if (cachedAdapterDir !== undefined) return cachedAdapterDir;

  // Primary: Node resolution from the app root (handles hoisted node_modules,
  // e.g. npx installs). createRequire is used at runtime, so webpack does not
  // try to bundle the adapter's TypeScript sources.
  try {
    const req = createRequire(join(process.cwd(), "noop.js"));
    const entry = req.resolve("pi-mcp-adapter");
    cachedAdapterDir = dirname(entry);
    return cachedAdapterDir;
  } catch { /* fall through to manual walk */ }

  // Fallback: walk up from cwd looking for node_modules/pi-mcp-adapter.
  let dir = process.cwd();
  for (;;) {
    const candidate = join(dir, "node_modules", "pi-mcp-adapter");
    if (existsSync(join(candidate, "package.json"))) {
      cachedAdapterDir = candidate;
      return cachedAdapterDir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  console.warn("[pi-web] bundled pi-mcp-adapter not found; MCP support disabled for new sessions");
  cachedAdapterDir = null;
  return cachedAdapterDir;
}

type PackageSourceLike = string | { source: string };

function packageSourceMatchesAdapter(entry: PackageSourceLike): boolean {
  const source = typeof entry === "string" ? entry : entry.source;
  return /(^|[/:@\\])pi-mcp-adapter(@|$|[/\\])?/.test(source) || source === "pi-mcp-adapter";
}

/**
 * True when the user already installed pi-mcp-adapter as a pi package
 * (global or project scope). The bundled copy is skipped in that case so the
 * extension is not loaded twice.
 */
export function isMcpAdapterInstalledAsPackage(settingsManager: SettingsManager): boolean {
  const globalPackages = (settingsManager.getGlobalSettings().packages ?? []) as PackageSourceLike[];
  const projectPackages = (settingsManager.getProjectSettings().packages ?? []) as PackageSourceLike[];
  return [...globalPackages, ...projectPackages].some(packageSourceMatchesAdapter);
}
