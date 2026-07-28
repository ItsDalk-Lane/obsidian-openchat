import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });

test("RPC registry keeps global sessions and broadcasts only changed running snapshots", async (t) => {
  const previousSessions = globalThis.__piSessions;
  const previousLocks = globalThis.__piStartLocks;
  const previousListeners = globalThis.__piRunningListeners;
  const previousStartingCwds = globalThis.__piStartingSessionCwds;
  globalThis.__piSessions = new Map();
  globalThis.__piStartLocks = new Map();
  globalThis.__piRunningListeners = new Set();
  globalThis.__piStartingSessionCwds = new Map();

  t.after(() => {
    globalThis.__piSessions = previousSessions;
    globalThis.__piStartLocks = previousLocks;
    globalThis.__piRunningListeners = previousListeners;
    globalThis.__piStartingSessionCwds = previousStartingCwds;
  });

  const registryModule = await jiti.import("./rpc/session-registry.ts");
  const registry = registryModule.getSessionRegistry();
  let running = false;
  registry.set("native-session", {
    sessionId: "real-session",
    cwd: "/tmp/pi-web-registry-test",
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

test("RPC registry tracks starting workspaces and destroys only matching sessions", async (t) => {
  const previousSessions = globalThis.__piSessions;
  const previousStartingCwds = globalThis.__piStartingSessionCwds;
  globalThis.__piSessions = new Map();
  globalThis.__piStartingSessionCwds = new Map();

  t.after(() => {
    globalThis.__piSessions = previousSessions;
    globalThis.__piStartingSessionCwds = previousStartingCwds;
  });

  const registryModule = await jiti.import("./rpc/session-registry.ts");
  const release = registryModule.trackStartingSessionCwd("/tmp/pi-web-trust-a/.");
  assert.equal(registryModule.hasBusySessionForCwd("/tmp/pi-web-trust-a"), true);
  release();
  assert.equal(registryModule.hasBusySessionForCwd("/tmp/pi-web-trust-a"), false);

  let matchingDestroyed = false;
  let otherDestroyed = false;
  const registry = registryModule.getSessionRegistry();
  registry.set("matching", {
    sessionId: "matching",
    cwd: "/tmp/pi-web-trust-a",
    destroy: () => { matchingDestroyed = true; },
    getRuntimeContext: () => ({
      taskId: "task_a",
      runId: "run_a",
      runtimeKind: "pi",
      nativeRuntimeId: "matching",
    }),
    isAlive: () => true,
    isRunning: () => false,
  });
  registry.set("other", {
    sessionId: "other",
    cwd: "/tmp/pi-web-trust-b",
    destroy: () => { otherDestroyed = true; },
    getRuntimeContext: () => ({
      taskId: "task_b",
      runId: "run_b",
      runtimeKind: "pi",
      nativeRuntimeId: "other",
    }),
    isAlive: () => true,
    isRunning: () => false,
  });

  assert.equal(registryModule.destroySessionsForCwd("/tmp/pi-web-trust-a/."), 1);
  assert.equal(matchingDestroyed, true);
  assert.equal(otherDestroyed, false);
});
