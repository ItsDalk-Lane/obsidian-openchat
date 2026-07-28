import type { RuntimeContext } from "../kernel";
import { ensureKernelStartupRecovery } from "../application/services";
import { realpathSync } from "fs";
import { resolve } from "path";

export interface RegisteredRpcSession {
  readonly sessionId: string;
  readonly cwd: string;
  destroy(): void;
  getRuntimeContext(): RuntimeContext;
  isAlive(): boolean;
  isRunning(): boolean;
}

export interface RpcSessionStartResult<TSession extends RegisteredRpcSession = RegisteredRpcSession> {
  session: TSession;
  realSessionId: string;
  runtimeContext: RuntimeContext;
}

type RunningListener = (ids: string[]) => void;

declare global {
  var __piSessions: Map<string, RegisteredRpcSession> | undefined;
  var __piStartLocks: Map<string, Promise<RpcSessionStartResult>> | undefined;
  var __piRunningListeners: Set<RunningListener> | undefined;
  var __piStartingSessionCwds: Map<string, number> | undefined;
}

function normalizeCwd(cwd: string): string {
  const absolute = resolve(cwd);
  try {
    return realpathSync(absolute);
  } catch {
    return absolute;
  }
}

export function getSessionRegistry<TSession extends RegisteredRpcSession>(): Map<string, TSession> {
  if (!globalThis.__piSessions) {
    globalThis.__piSessions = new Map();
    ensureKernelStartupRecovery();
    const cleanup = () => globalThis.__piSessions?.forEach((session) => session.destroy());
    process.once("exit", cleanup);
    process.once("SIGINT", cleanup);
    process.once("SIGTERM", cleanup);
  }
  return globalThis.__piSessions as Map<string, TSession>;
}

export function getSessionStartLocks<TSession extends RegisteredRpcSession>(): Map<string, Promise<RpcSessionStartResult<TSession>>> {
  if (!globalThis.__piStartLocks) globalThis.__piStartLocks = new Map();
  return globalThis.__piStartLocks as Map<string, Promise<RpcSessionStartResult<TSession>>>;
}

export function getRegisteredSession<TSession extends RegisteredRpcSession>(
  sessionId: string,
): TSession | undefined {
  return getSessionRegistry<TSession>().get(sessionId);
}

function getStartingSessionCwds(): Map<string, number> {
  if (!globalThis.__piStartingSessionCwds) {
    globalThis.__piStartingSessionCwds = new Map();
  }
  return globalThis.__piStartingSessionCwds;
}

export function trackStartingSessionCwd(cwd: string): () => void {
  const normalized = normalizeCwd(cwd);
  const starting = getStartingSessionCwds();
  starting.set(normalized, (starting.get(normalized) ?? 0) + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const remaining = (starting.get(normalized) ?? 1) - 1;
    if (remaining > 0) starting.set(normalized, remaining);
    else starting.delete(normalized);
  };
}

export function hasBusySessionForCwd(cwd: string): boolean {
  const normalized = normalizeCwd(cwd);
  if ((getStartingSessionCwds().get(normalized) ?? 0) > 0) return true;
  return [...getSessionRegistry().values()].some(
    (session) => normalizeCwd(session.cwd) === normalized && session.isRunning(),
  );
}

export function destroySessionsForCwd(cwd: string): number {
  const normalized = normalizeCwd(cwd);
  const matches = [...getSessionRegistry().values()].filter(
    (session) => normalizeCwd(session.cwd) === normalized,
  );
  for (const session of matches) session.destroy();
  return matches.length;
}

export function getRunningSessionIds(): string[] {
  const ids = new Set<string>();
  for (const [sessionId, session] of getSessionRegistry()) {
    if (session.isRunning()) ids.add(session.sessionId || sessionId);
  }
  return [...ids];
}

function getRunningListeners(): Set<RunningListener> {
  if (!globalThis.__piRunningListeners) globalThis.__piRunningListeners = new Set();
  return globalThis.__piRunningListeners;
}

export function subscribeToRunningSessions(listener: RunningListener): () => void {
  const listeners = getRunningListeners();
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

let lastRunningSnapshot = "";

export function notifyRunningSessionsChanged(): void {
  const ids = getRunningSessionIds();
  const snapshot = JSON.stringify([...ids].sort());
  if (snapshot === lastRunningSnapshot) return;
  lastRunningSnapshot = snapshot;
  for (const listener of getRunningListeners()) {
    try {
      listener(ids);
    } catch {
      // 单个监听器失败不能影响其他会话状态订阅者
    }
  }
}
