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

const cachedExtensionDirs = new Map<string, string | null>();

/**
 * Resolve a bundled extension package directory.
 * Returns null (with a one-time warning) when the package cannot be found so
 * session startup never fails because of the bundled extension.
 */
export function resolveBundledExtensionDir(packageName: string): string | null {
  if (cachedExtensionDirs.has(packageName)) {
    return cachedExtensionDirs.get(packageName) ?? null;
  }

  // Primary: Node resolution from the app root (handles hoisted node_modules,
  // e.g. npx installs). createRequire is used at runtime, so webpack does not
  // try to bundle the adapter's TypeScript sources.
  try {
    const req = createRequire(join(process.cwd(), "noop.js"));
    const entry = req.resolve(packageName);
    const extensionDir = dirname(entry);
    cachedExtensionDirs.set(packageName, extensionDir);
    return extensionDir;
  } catch { /* fall through to manual walk */ }

  // Fallback: walk up from cwd looking for the package under node_modules.
  let dir = process.cwd();
  for (;;) {
    const candidate = join(dir, "node_modules", packageName);
    if (existsSync(join(candidate, "package.json"))) {
      cachedExtensionDirs.set(packageName, candidate);
      return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  const supportName = packageName === "pi-mcp-adapter" ? "MCP" : packageName;
  console.warn(`[pi-web] bundled ${packageName} not found; ${supportName} support disabled for new sessions`);
  cachedExtensionDirs.set(packageName, null);
  return null;
}

type PackageSourceLike = string | { source: string };

function packageSourceMatchesExtension(entry: PackageSourceLike, packageName: string): boolean {
  const source = typeof entry === "string" ? entry : entry.source;
  const escapedPackageName = packageName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const packagePattern = new RegExp(`(^|[/:@\\\\])${escapedPackageName}(@|$|[/\\\\])?`);
  return packagePattern.test(source) || source === packageName;
}

/**
 * True when the user already installed an extension as a pi package (global or
 * project scope). The bundled copy is skipped so the extension is not loaded
 * twice.
 */
export function isExtensionInstalledAsPackage(
  settingsManager: SettingsManager,
  packageName: string,
): boolean {
  const globalPackages = (settingsManager.getGlobalSettings().packages ?? []) as PackageSourceLike[];
  const projectPackages = (settingsManager.getProjectSettings().packages ?? []) as PackageSourceLike[];
  return [...globalPackages, ...projectPackages].some((entry) =>
    packageSourceMatchesExtension(entry, packageName));
}
