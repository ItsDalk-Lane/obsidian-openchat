import { randomUUID } from "crypto";
import { existsSync } from "fs";
import type {
  RuntimeAdapter,
  RuntimeCommand,
  RuntimeCommandResult,
  RuntimeContext,
  RuntimeState,
} from "@/lib/kernel";
import { RuntimeRegistry } from "@/lib/application/services/runtime-registry";
import { allowFileRoot } from "@/lib/file-access";
import { invalidateSessionListCache } from "@/lib/session-reader";
import { getSessionCwd, resolveSessionPath } from "@/lib/session-reader";
import { getRpcSession, startRpcSession } from "@/lib/rpc-manager";

declare global {
  var __piWebRuntimeRegistry: RuntimeRegistry | undefined;
}

function ensurePiRuntimeContext(runtimeKind: string): void {
  if (runtimeKind !== "pi") {
    throw new Error(`Runtime adapter mismatch: expected pi, got ${runtimeKind}`);
  }
}

async function ensurePiSessionByNativeId(
  sessionId: string,
  cwdOverride?: string,
  taskId?: RuntimeContext["taskId"],
) {
  const existing = getRpcSession(sessionId);
  if (existing?.isAlive()) return existing;
  const sessionFile = await resolveSessionPath(sessionId);
  if (!sessionFile) {
    throw new Error(`Session not found: ${sessionId}`);
  }
  const cwd = cwdOverride ?? getSessionCwd(sessionFile) ?? process.cwd();
  const { session } = await startRpcSession(sessionId, sessionFile, cwd, undefined, { taskId });
  return session;
}

function createPiRuntimeAdapter(): RuntimeAdapter {
  return {
    descriptor: {
      id: "pi",
      version: "0.82.1",
      displayName: "Pi Runtime",
      description: "Pi SDK runtime adapter",
      capabilities: {
        streaming: true,
        resumable: true,
        cancellable: true,
        branching: true,
        nativeTools: true,
        contextInjection: true,
      },
    },
    async createRun(input) {
      if (!input.cwd) throw new Error("cwd is required");
      if (!existsSync(input.cwd)) throw new Error(`Directory does not exist: ${input.cwd}`);
      const tempKey = `__new__${randomUUID()}`;
      const toolNames = Array.isArray(input.metadata?.toolNames)
        ? input.metadata?.toolNames.filter((item): item is string => typeof item === "string")
        : undefined;
      const { runtimeContext } = await startRpcSession(
        tempKey,
        "",
        input.cwd,
        toolNames,
        { taskId: input.taskId },
      );
      allowFileRoot(input.cwd);
      invalidateSessionListCache();
      return runtimeContext;
    },
    async attachExisting(input) {
      ensurePiRuntimeContext(input.context.runtimeKind);
      const session = await ensurePiSessionByNativeId(
        input.context.nativeRuntimeId,
        input.cwd,
        input.context.taskId,
      );
      return session.getRuntimeContext();
    },
    async getState(context): Promise<RuntimeState> {
      ensurePiRuntimeContext(context.runtimeKind);
      try {
        const session = await ensurePiSessionByNativeId(context.nativeRuntimeId, undefined, context.taskId);
        const state = await session.send({ type: "get_state" });
        if (state && typeof state === "object") {
          const raw = state as Record<string, unknown>;
          const status = raw.isStreaming || raw.isPromptRunning || raw.isBashRunning || raw.isCompacting
            ? "running"
            : "idle";
          return { status, details: raw };
        }
        return { status: "unknown" };
      } catch {
        return { status: "unknown" };
      }
    },
    async send<C extends RuntimeCommand>(
      context: RuntimeContext,
      command: C,
    ): Promise<RuntimeCommandResult<C>> {
      ensurePiRuntimeContext(context.runtimeKind);
      const session = await ensurePiSessionByNativeId(context.nativeRuntimeId, undefined, context.taskId);
      const result = await session.send(command);
      return result as RuntimeCommandResult<C>;
    },
    subscribe(context, listener) {
      ensurePiRuntimeContext(context.runtimeKind);
      let cancelled = false;
      let unsubscribeInner: (() => void) | null = null;
      void ensurePiSessionByNativeId(context.nativeRuntimeId, undefined, context.taskId)
        .then((session) => {
          if (cancelled) return;
          unsubscribeInner = session.onEvent((event) => {
            if (event.taskId === context.taskId && event.runId === context.runId) {
              listener(event);
            }
          });
        })
        .catch(() => {});
      return () => {
        cancelled = true;
        unsubscribeInner?.();
      };
    },
    async abort(context) {
      ensurePiRuntimeContext(context.runtimeKind);
      const session = await ensurePiSessionByNativeId(context.nativeRuntimeId, undefined, context.taskId);
      await session.send({ type: "abort" });
    },
    async close(context) {
      ensurePiRuntimeContext(context.runtimeKind);
      const session = getRpcSession(context.nativeRuntimeId);
      if (!session?.isAlive()) return;
      session.destroy();
    },
  };
}

export function getRuntimeRegistry(): RuntimeRegistry {
  if (!globalThis.__piWebRuntimeRegistry) {
    const registry = new RuntimeRegistry();
    registry.register(createPiRuntimeAdapter());
    globalThis.__piWebRuntimeRegistry = registry;
  }
  return globalThis.__piWebRuntimeRegistry;
}

export function resetRuntimeRegistryForTests(): void {
  globalThis.__piWebRuntimeRegistry?.dispose();
  globalThis.__piWebRuntimeRegistry = undefined;
}
