import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "fs";
import { homedir } from "os";
import { dirname, join, resolve } from "path";
import stripJsonComments from "strip-json-comments";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

// ============================================================================
// MCP config file access for the bundled pi-mcp-adapter.
//
// Mirrors the adapter's file precedence and merge semantics:
//   1. ~/.config/mcp/mcp.json          (shared global)
//   2. ~/.agents/mcp.json              (agents global)
//   3. ~/.agents/mcp/mcp.json          (agents nested global)
//   4. <pi agent dir>/mcp.json         (pi global override)
//   5. <cwd>/.mcp.json                 (shared project)
//   6. <cwd>/.pi/mcp.json              (pi project override, highest)
//
// pi-web only ever WRITES to:
//   - <cwd>/.mcp.json                  server definitions (project scope)
//   - ~/.config/mcp/mcp.json           server definitions (global scope)
//   - <cwd>/.pi/mcp.json               `disabled` overrides only
// so user-maintained files are never rewritten.
// ============================================================================

export type McpSourceId =
  | "shared-global"
  | "agents-global"
  | "agents-nested-global"
  | "pi-global"
  | "shared-project"
  | "pi-project";

export type McpScope = "global" | "project";

export interface McpServerEntry {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  url?: string;
  headers?: Record<string, string>;
  auth?: "oauth" | "bearer" | false;
  bearerToken?: string;
  bearerTokenEnv?: string;
  lifecycle?: "keep-alive" | "lazy" | "lazy-keep-alive" | "eager";
  idleTimeout?: number;
  requestTimeoutMs?: number;
  exposeResources?: boolean;
  directTools?: boolean | string[];
  includeTools?: string[];
  excludeTools?: string[];
  debug?: boolean;
  disabled?: boolean;
  [key: string]: unknown;
}

export interface McpConfigSourceInfo {
  id: McpSourceId;
  label: string;
  path: string;
  scope: McpScope;
  exists: boolean;
  serverCount: number;
}

export interface McpServerInfo {
  name: string;
  /** Effective merged entry with credential values masked. */
  config: McpServerEntry;
  /** Highest-precedence source that actually defines the server. */
  sourceId: McpSourceId;
  sourcePath: string;
  sourceScope: McpScope;
  disabled: boolean;
  /** True when pi-web may edit/remove the definition (it lives only in a pi-web-managed file). */
  editable: boolean;
  transport: "stdio" | "http" | "unknown";
}

export interface McpServersResponse {
  servers: McpServerInfo[];
  sources: McpConfigSourceInfo[];
  writableTargets: { project: string; global: string };
}

const MASK = "***";

interface SourceSpec {
  id: McpSourceId;
  label: string;
  path: string;
  scope: McpScope;
}

function getSourceSpecs(cwd: string): SourceSpec[] {
  const agentGlobal = join(getAgentDir(), "mcp.json");
  const specs: SourceSpec[] = [
    { id: "shared-global", label: "用户全局 (~/.config/mcp/mcp.json)", path: join(homedir(), ".config", "mcp", "mcp.json"), scope: "global" },
    { id: "agents-global", label: "用户全局 (~/.agents/mcp.json)", path: join(homedir(), ".agents", "mcp.json"), scope: "global" },
    { id: "agents-nested-global", label: "用户全局 (~/.agents/mcp/mcp.json)", path: join(homedir(), ".agents", "mcp", "mcp.json"), scope: "global" },
    { id: "pi-global", label: "Pi 全局覆盖 (agent dir mcp.json)", path: agentGlobal, scope: "global" },
    { id: "shared-project", label: "项目 (.mcp.json)", path: resolve(cwd, ".mcp.json"), scope: "project" },
    { id: "pi-project", label: "Pi 项目覆盖 (.pi/mcp.json)", path: resolve(cwd, ".pi", "mcp.json"), scope: "project" },
  ];
  // The adapter skips the shared-global path when the agent dir already points there.
  return specs.filter((s, i) => i === 0 ? s.path !== agentGlobal : true);
}

function parseJsonConfig(text: string): unknown {
  return JSON.parse(stripJsonComments(text));
}

function readRawConfig(path: string): Record<string, unknown> | null {
  if (!existsSync(path)) return null;
  try {
    const parsed = parseJsonConfig(readFileSync(path, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch (err) {
    console.warn(`[pi-web] failed to parse MCP config ${path}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

function getServersFromRaw(raw: Record<string, unknown> | null): Record<string, McpServerEntry> {
  if (!raw) return {};
  const servers = raw.mcpServers ?? raw["mcp-servers"];
  if (!servers || typeof servers !== "object" || Array.isArray(servers)) return {};
  const out: Record<string, McpServerEntry> = {};
  for (const [name, entry] of Object.entries(servers as Record<string, unknown>)) {
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      out[name] = entry as McpServerEntry;
    }
  }
  return out;
}

/** True when the entry actually defines a server (not just an override such as `disabled`). */
function isDefinition(entry: McpServerEntry): boolean {
  return typeof entry.command === "string" || typeof entry.url === "string";
}

// Mirrors the adapter's url-bound credential handling: when a higher-precedence
// source repoints `url`, drop inherited auth material before merging.
const URL_BOUND_AUTH_FIELDS = ["headers", "bearerToken", "bearerTokenEnv"] as const;

function mergeEntries(base: McpServerEntry | undefined, next: McpServerEntry): McpServerEntry {
  let baseEntry: McpServerEntry = base ?? {};
  if (base && typeof next.url === "string" && next.url !== base.url) {
    baseEntry = { ...base };
    for (const field of URL_BOUND_AUTH_FIELDS) delete baseEntry[field];
    if (baseEntry.oauth !== false) delete baseEntry.oauth;
  }
  return { ...baseEntry, ...next };
}

function maskRecord(record: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!record) return undefined;
  return Object.fromEntries(Object.keys(record).map((k) => [k, MASK]));
}

function maskEntry(entry: McpServerEntry): McpServerEntry {
  const masked: McpServerEntry = { ...entry };
  if (masked.env) masked.env = maskRecord(masked.env as Record<string, string>);
  if (masked.headers) masked.headers = maskRecord(masked.headers as Record<string, string>);
  if (typeof masked.bearerToken === "string") masked.bearerToken = MASK;
  if (masked.oauth && typeof masked.oauth === "object") {
    const oauth = { ...(masked.oauth as Record<string, unknown>) };
    if (typeof oauth.clientSecret === "string") oauth.clientSecret = MASK;
    masked.oauth = oauth as McpServerEntry["oauth"];
  }
  return masked;
}

export function getWritableTargets(cwd: string): { project: string; global: string } {
  return {
    project: resolve(cwd, ".mcp.json"),
    global: join(homedir(), ".config", "mcp", "mcp.json"),
  };
}

export function listMcpServers(cwd: string): McpServersResponse {
  const specs = getSourceSpecs(cwd);
  const writableTargets = getWritableTargets(cwd);

  const perSource = specs.map((spec) => ({ spec, servers: getServersFromRaw(readRawConfig(spec.path)) }));

  const sources: McpConfigSourceInfo[] = perSource.map(({ spec, servers }) => ({
    id: spec.id,
    label: spec.label,
    path: spec.path,
    scope: spec.scope,
    exists: existsSync(spec.path),
    serverCount: Object.keys(servers).length,
  }));

  const merged = new Map<string, { entry: McpServerEntry; definingSpecs: SourceSpec[] }>();
  for (const { spec, servers } of perSource) {
    for (const [name, entry] of Object.entries(servers)) {
      const current = merged.get(name);
      const mergedEntry = mergeEntries(current?.entry, entry);
      const definingSpecs = current?.definingSpecs ?? [];
      if (isDefinition(entry)) definingSpecs.push(spec);
      merged.set(name, { entry: mergedEntry, definingSpecs });
    }
  }

  const writablePaths = new Set(Object.values(writableTargets));
  const servers: McpServerInfo[] = [...merged.entries()]
    .map(([name, { entry, definingSpecs }]) => {
      const defining = definingSpecs[definingSpecs.length - 1];
      if (!defining) return null;
      const editable = definingSpecs.length === 1 && writablePaths.has(defining.path);
      return {
        name,
        config: maskEntry(entry),
        sourceId: defining.id,
        sourcePath: defining.path,
        sourceScope: defining.scope,
        disabled: entry.disabled === true,
        editable,
        transport: typeof entry.url === "string" ? "http" as const : typeof entry.command === "string" ? "stdio" as const : "unknown" as const,
      };
    })
    .filter((s): s is McpServerInfo => s !== null)
    .sort((a, b) => a.name.localeCompare(b.name));

  return { servers, sources, writableTargets };
}

function writeRawConfig(path: string, raw: Record<string, unknown>): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmpPath = `${path}.${process.pid}.tmp`;
  writeFileSync(tmpPath, `${JSON.stringify(raw, null, 2)}\n`, "utf8");
  renameSync(tmpPath, path);
}

/**
 * Like writeRawConfig, but deletes the file when it would only contain an
 * empty server map (no settings/imports/other keys) so removing the last
 * server doesn't leave `{"mcpServers": {}}` husks behind.
 */
function writeOrCleanupConfig(path: string, raw: Record<string, unknown>, serversKey: string): void {
  const servers = raw[serversKey];
  const serversEmpty = !servers || (typeof servers === "object" && !Array.isArray(servers) && Object.keys(servers).length === 0);
  const onlyServersKey = Object.keys(raw).every((k) => k === serversKey);
  if (serversEmpty && onlyServersKey) {
    if (existsSync(path)) unlinkSync(path);
    return;
  }
  writeRawConfig(path, raw);
}

function getServersKey(raw: Record<string, unknown>): string {
  return raw.mcpServers !== undefined ? "mcpServers" : raw["mcp-servers"] !== undefined ? "mcp-servers" : "mcpServers";
}

/**
 * Persist only the `disabled` field in the project `.pi/mcp.json` layer,
 * mirroring the adapter's `/mcp disable|enable` semantics. Never copies server
 * definitions or credentials into the override file.
 */
export function setServerDisabled(cwd: string, name: string, disabled: boolean): { path: string; changed: boolean } {
  const path = resolve(cwd, ".pi", "mcp.json");
  const raw = readRawConfig(path) ?? {};
  const key = getServersKey(raw);
  const servers = (raw[key] && typeof raw[key] === "object" && !Array.isArray(raw[key]) ? raw[key] : {}) as Record<string, unknown>;
  const existing = (servers[name] && typeof servers[name] === "object" && !Array.isArray(servers[name])
    ? servers[name]
    : undefined) as Record<string, unknown> | undefined;

  let next: Record<string, unknown>;
  if (disabled) {
    next = { ...existing, disabled: true };
  } else {
    next = Object.fromEntries(Object.entries(existing ?? {}).filter(([k]) => k !== "disabled"));
    // If a lower-precedence source disables the server, write an explicit false override.
    const lower = getSourceSpecs(cwd).filter((s) => s.path !== path);
    let lowerEntry: McpServerEntry | undefined;
    for (const spec of lower) {
      const entry = getServersFromRaw(readRawConfig(spec.path))[name];
      if (entry) lowerEntry = mergeEntries(lowerEntry, entry);
    }
    if (lowerEntry?.disabled === true) next.disabled = false;
  }

  if ((!existing && Object.keys(next).length === 0) || JSON.stringify(existing) === JSON.stringify(next)) {
    return { path, changed: false };
  }
  if (Object.keys(next).length === 0) delete servers[name];
  else servers[name] = next;
  raw[key] = servers;
  writeOrCleanupConfig(path, raw, key);
  return { path, changed: true };
}

/** Restore masked ("***") credential values from a previous entry before saving. */
function unmaskEntry(entry: McpServerEntry, previous: McpServerEntry | undefined): McpServerEntry {
  const out: McpServerEntry = { ...entry };
  const restoreRecord = (key: "env" | "headers") => {
    const record = out[key] as Record<string, string> | undefined;
    const prevRecord = previous?.[key] as Record<string, string> | undefined;
    if (!record) return;
    out[key] = Object.fromEntries(
      Object.entries(record).map(([k, v]) => [k, v === MASK && prevRecord?.[k] !== undefined ? prevRecord[k] : v]),
    );
  };
  restoreRecord("env");
  restoreRecord("headers");
  if (out.bearerToken === MASK && typeof previous?.bearerToken === "string") out.bearerToken = previous.bearerToken;
  if (out.oauth && typeof out.oauth === "object") {
    const oauth = { ...(out.oauth as Record<string, unknown>) };
    const prevOauth = previous?.oauth && typeof previous.oauth === "object" ? previous.oauth as Record<string, unknown> : undefined;
    if (oauth.clientSecret === MASK && typeof prevOauth?.clientSecret === "string") oauth.clientSecret = prevOauth.clientSecret;
    out.oauth = oauth as McpServerEntry["oauth"];
  }
  return out;
}

function getWriteTarget(cwd: string, scope: McpScope): string {
  const targets = getWritableTargets(cwd);
  return scope === "project" ? targets.project : targets.global;
}

/**
 * Add or update a server definition in a pi-web-managed file
 * (project `.mcp.json` or global `~/.config/mcp/mcp.json`).
 */
export function upsertServer(
  cwd: string,
  scope: McpScope,
  name: string,
  entry: McpServerEntry,
  options?: { previousName?: string },
): { path: string } {
  if (!name.trim()) throw new Error("server name required");
  if (!isDefinition(entry)) throw new Error("server must define a command or url");

  const path = getWriteTarget(cwd, scope);
  const raw = readRawConfig(path) ?? {};
  const key = getServersKey(raw);
  const servers = (raw[key] && typeof raw[key] === "object" && !Array.isArray(raw[key]) ? raw[key] : {}) as Record<string, unknown>;

  const previousName = options?.previousName ?? name;
  const previous = (servers[previousName] && typeof servers[previousName] === "object"
    ? servers[previousName]
    : undefined) as McpServerEntry | undefined;

  if (previousName !== name) delete servers[previousName];
  servers[name] = unmaskEntry(entry, previous);
  raw[key] = servers;
  writeRawConfig(path, raw);
  return { path };
}

/** Remove a server definition from a pi-web-managed file. */
export function removeServer(cwd: string, scope: McpScope, name: string): { path: string; removed: boolean } {
  const path = getWriteTarget(cwd, scope);
  const raw = readRawConfig(path);
  if (!raw) return { path, removed: false };
  const key = getServersKey(raw);
  const servers = (raw[key] && typeof raw[key] === "object" && !Array.isArray(raw[key]) ? raw[key] : {}) as Record<string, unknown>;
  if (!(name in servers)) return { path, removed: false };
  delete servers[name];
  raw[key] = servers;
  writeOrCleanupConfig(path, raw, key);

  // Also drop any stale disabled override for this server in .pi/mcp.json.
  try {
    const overridePath = resolve(cwd, ".pi", "mcp.json");
    if (overridePath !== path) {
      const overrideRaw = readRawConfig(overridePath);
      if (overrideRaw) {
        const overrideKey = getServersKey(overrideRaw);
        const overrideServers = (overrideRaw[overrideKey] && typeof overrideRaw[overrideKey] === "object"
          ? overrideRaw[overrideKey]
          : {}) as Record<string, unknown>;
        const overrideEntry = overrideServers[name] as McpServerEntry | undefined;
        if (overrideEntry && !isDefinition(overrideEntry)) {
          delete overrideServers[name];
          overrideRaw[overrideKey] = overrideServers;
          writeOrCleanupConfig(overridePath, overrideRaw, overrideKey);
        }
      }
    }
  } catch { /* override cleanup is best-effort */ }

  return { path, removed: true };
}

/** Raw (unmasked) entry from a pi-web-managed file — used to prefill edit forms server-side only. */
export function getEditableServerEntry(cwd: string, scope: McpScope, name: string): McpServerEntry | undefined {
  const raw = readRawConfig(getWriteTarget(cwd, scope));
  return getServersFromRaw(raw)[name];
}
