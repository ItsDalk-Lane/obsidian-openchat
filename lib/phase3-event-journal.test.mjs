import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });

async function withEventHarness(t) {
  const root = await mkdtemp(join(tmpdir(), "pi-web-phase3-events-"));
  const agentDir = join(root, "agent");
  const dataDir = join(root, "data");
  await mkdir(agentDir, { recursive: true });

  const previousDataDir = process.env.PI_WEB_DATA_DIR;
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_WEB_DATA_DIR = dataDir;
  process.env.PI_CODING_AGENT_DIR = agentDir;

  const persistence = await jiti.import("./persistence/index.ts");
  const servicesModule = await jiti.import("./application/services/index.ts");
  const kernel = await jiti.import("./kernel/index.ts");

  const cleanup = async () => {
    servicesModule.resetKernelServicesForTests();
    persistence.resetKernelDatabaseForTests({ removeFiles: true, path: join(dataDir, "kernel.sqlite") });
    if (previousDataDir === undefined) delete process.env.PI_WEB_DATA_DIR;
    else process.env.PI_WEB_DATA_DIR = previousDataDir;
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
    await rm(root, { recursive: true, force: true });
  };
  t.after(() => cleanup());

  return { services: servicesModule.getKernelServices(), kernel };
}

test("event journal uses monotonic sequence numbers and filters transient message events", async (t) => {
  const { services, kernel } = await withEventHarness(t);
  const task = services.taskService.createTask({ title: "Event task" });
  const context = services.piSessionReconciler.ensureStartedPiSession({ sessionId: "event-session", cwd: join(tmpdir(), "event-cwd"), taskId: task.id });

  const started = kernel.createKernelEvent("operation.started", task.id, context.runId, { operationKind: "prompt" }, { kind: "runtime", adapter: "pi", nativeType: "prompt" });
  const message = kernel.createKernelEvent("message.completed", task.id, context.runId, { message: { role: "assistant", content: [], model: "m", provider: "p" } }, { kind: "runtime", adapter: "pi", nativeType: "message_end" });
  const completed = kernel.createKernelEvent("operation.completed", task.id, context.runId, { operationKind: "prompt" }, { kind: "runtime", adapter: "pi", nativeType: "prompt_done" });

  services.eventService.appendIfDurable(started);
  services.eventService.appendIfDurable(message);
  services.eventService.appendIfDurable(completed);

  const stored = services.uow.events.getByTask(task.id, { limit: 20 });
  assert.equal(stored.filter((entry) => entry.event.type === "message.completed").length, 0);
  assert.ok(stored.some((entry) => entry.event.id === started.id));
  assert.ok(stored.some((entry) => entry.event.id === completed.id));
  assert.ok(stored[0].sequence < stored[stored.length - 1].sequence);

  const afterFirst = services.uow.events.readAfter(stored[0].sequence, 20);
  assert.ok(afterFirst.every((entry) => entry.sequence > stored[0].sequence));
});

test("run interruption emits at most one durable interrupted event and supports task isolation", async (t) => {
  const { services } = await withEventHarness(t);
  const taskA = services.taskService.createTask({ title: "Task A" });
  const taskB = services.taskService.createTask({ title: "Task B" });
  const contextA = services.piSessionReconciler.ensureStartedPiSession({ sessionId: "run-a", cwd: join(tmpdir(), "run-a"), taskId: taskA.id });
  const contextB = services.piSessionReconciler.ensureStartedPiSession({ sessionId: "run-b", cwd: join(tmpdir(), "run-b"), taskId: taskB.id });

  services.runService.updateRunStatus(contextA.runId, "running", { lastSeenAt: "2026-03-01T00:00:00.000Z" });
  services.runService.updateRunStatus(contextB.runId, "running", { lastSeenAt: "2026-03-01T00:00:00.000Z" });
  services.piSessionReconciler.interruptStaleRuns(new Set(["run-b"]));
  services.piSessionReconciler.interruptStaleRuns(new Set(["run-b"]));

  const taskAEvents = services.uow.events.getByTask(taskA.id, { limit: 50 });
  const taskBEvents = services.uow.events.getByTask(taskB.id, { limit: 50 });
  assert.equal(taskAEvents.filter((entry) => entry.event.type === "run.interrupted").length, 1);
  assert.equal(taskBEvents.filter((entry) => entry.event.type === "run.interrupted").length, 0);

  const taskAOnly = services.uow.events.getByTask(taskA.id, { runId: contextA.runId, limit: 50 });
  assert.ok(taskAOnly.every((entry) => entry.event.taskId === taskA.id));
});
