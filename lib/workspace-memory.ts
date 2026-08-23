/**
 * Remember which session was last open per workspace so the next visit to a
 * project can restore it, instead of landing on a blank new-session page.
 *
 * The workspace key is the server-provided project identity when known, so
 * Windows path variants and all worktrees of one repo share one memory slot.
 * Transient and legacy session objects fall back to projectRoot/cwd.
 *
 * Stored in localStorage; best-effort (silently ignored when unavailable).
 */

export interface RecentOpen {
  sessionId: string;
  ts: number;
}

const STORAGE_KEY = "pi-web:recent-open-sessions";
const MAX_ENTRIES_PER_WORKSPACE = 8;
const MAX_WORKSPACES = 64;

function readStore(): Record<string, RecentOpen[]> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, RecentOpen[]> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (!Array.isArray(v)) continue;
      const filtered: RecentOpen[] = [];
      for (const item of v) {
        if (
          item && typeof item === "object"
          && typeof (item as RecentOpen).sessionId === "string"
          && typeof (item as RecentOpen).ts === "number"
        ) {
          filtered.push(item as RecentOpen);
        }
      }
      if (filtered.length > 0) out[k] = filtered;
    }
    return out;
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, RecentOpen[]>): void {
  if (typeof window === "undefined") return;
  try {
    if (Object.keys(store).length === 0) {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    }
  } catch {
    /* quota / privacy mode — silently ignore */
  }
}

function trimWorkspace(entries: RecentOpen[]): RecentOpen[] {
  return entries.slice(-MAX_ENTRIES_PER_WORKSPACE);
}

function trimStore(store: Record<string, RecentOpen[]>): Record<string, RecentOpen[]> {
  const keys = Object.keys(store);
  if (keys.length <= MAX_WORKSPACES) return store;
  const sortedByNewest = keys
    .map((k) => ({ key: k, ts: Math.max(0, ...store[k].map((e) => e.ts)) }))
    .sort((a, b) => b.ts - a.ts);
  const keep = new Set(sortedByNewest.slice(0, MAX_WORKSPACES).map((x) => x.key));
  const next: Record<string, RecentOpen[]> = {};
  for (const k of keys) if (keep.has(k)) next[k] = store[k];
  return next;
}

export function setLastOpenSession(workspaceKey: string, sessionId: string): void {
  if (!workspaceKey || !sessionId) return;
  const store = readStore();
  const entries = (store[workspaceKey] ?? []).filter((e) => e.sessionId !== sessionId);
  entries.push({ sessionId, ts: Date.now() });
  store[workspaceKey] = trimWorkspace(entries);
  writeStore(trimStore(store));
}

export function getLastOpenSession(workspaceKey: string): RecentOpen | null {
  if (!workspaceKey) return null;
  const entries = readStore()[workspaceKey];
  if (!entries || entries.length === 0) return null;
  return entries[entries.length - 1] ?? null;
}

export function clearLastOpen(workspaceKey: string): void {
  if (!workspaceKey) return;
  const store = readStore();
  if (!(workspaceKey in store)) return;
  delete store[workspaceKey];
  writeStore(store);
}

/** Resolve the workspace key used by `setLastOpenSession` from a session. */
export function workspaceKeyOf(session: {
  cwd: string;
  projectRoot?: string | null;
  projectKey?: string | null;
}): string {
  return session.projectKey ?? session.projectRoot ?? session.cwd;
}
