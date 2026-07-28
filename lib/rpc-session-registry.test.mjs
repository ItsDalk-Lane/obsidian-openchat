import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });

test("RPC registry keeps global sessions and broadcasts only changed running snapshots", async (t) => {
  const previousSessions = globalThis.__piSessions;
  const previousLocks = globalThis.__piStartLocks;
  const previousListeners = globalThis.__piRunningListeners;
  globalThis.__piSessions = new Map();
  globalThis.__piStartLocks = new Map();
  globalThis.__piRunningListeners = new Set();

  t.after(() => {
    globalThis.__piSessions = previousSessions;
    globalThis.__piStartLocks = previousLocks;
    globalThis.__piRunningListeners = previousListeners;
  });

  const registryModule = await jiti.import("./rpc/session-registry.ts");
  const registry = registryModule.getSessionRegistry();
  let running = false;
  registry.set("native-session", {
    sessionId: "real-session",
    destroy() {},
    getRuntimeContext() {
      return { taskId: "task_test", runId: "run_test", runtimeKind: "pi", nativeRuntimeId: "real-session" };
    },
    isAlive: () => true,
    isRunning: () => running,
  });

  assert.equal(registryModule.getRegisteredSession("native-session")?.sessionId, "real-session");
  assert.deepEqual(registryModule.getRunningSessionIds(), []);

  const snapshots = [];
  const unsubscribe = registryModule.subscribeToRunningSessions((ids) => snapshots.push([...ids]));
  registryModule.notifyRunningSessionsChanged();
  registryModule.notifyRunningSessionsChanged();
  running = true;
  registryModule.notifyRunningSessionsChanged();
  registryModule.notifyRunningSessionsChanged();
  unsubscribe();

  assert.deepEqual(snapshots, [[], ["real-session"]]);
});
