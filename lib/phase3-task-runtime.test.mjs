import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });

async function withRuntimeHarness(t) {
  const root = await mkdtemp(join(tmpdir(), "pi-web-phase3-runtime-"));
  const agentDir = join(root, "agent");
  const dataDir = join(root, "data");
  const repoA = join(root, "repo-a");
  const repoB = join(root, "repo-b");
  await mkdir(agentDir, { recursive: true });
  await mkdir(repoA, { recursive: true });
  await mkdir(repoB, { recursive: true });

  const previousDataDir = process.env.PI_WEB_DATA_DIR;
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_WEB_DATA_DIR = dataDir;
  process.env.PI_CODING_AGENT_DIR = agentDir;

  const persistence = await jiti.import("./persistence/index.ts");
  const servicesModule = await jiti.import("./application/services/index.ts");

  globalThis.__piSessionListCache = {
    data: [],
    ts: Date.now(),
  };
  globalThis.__piSessionListGeneration = 0;
  globalThis.__piSessionListPromise = undefined;
  globalThis.__piSessionListPromiseGeneration = undefined;

  const cleanup = async () => {
    delete globalThis.__piSessionListCache;
    delete globalThis.__piSessionListGeneration;
    delete globalThis.__piSessionListPromise;
    delete globalThis.__piSessionListPromiseGeneration;
    servicesModule.resetKernelServicesForTests();
    servicesModule.resetKernelStartupRecoveryForTests?.();
    persistence.resetKernelDatabaseForTests({ removeFiles: true, path: join(dataDir, "kernel.sqlite") });
    if (previousDataDir === undefined) delete process.env.PI_WEB_DATA_DIR;
    else process.env.PI_WEB_DATA_DIR = previousDataDir;
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
    await rm(root, { recursive: true, force: true });
  };
  t.after(() => cleanup());

  return { root, dataDir, repoA, repoB, servicesModule };
}

test("Pi session reconciliation imports sessions idempotently, preserves user title overrides, and closes missing runs", async (t) => {
  const { repoA, servicesModule } = await withRuntimeHarness(t);
  const services = servicesModule.getKernelServices();

  globalThis.__piSessionListCache = {
    data: [
      {
        id: "session-root",
        path: join(repoA, "root.jsonl"),
        cwd: repoA,
        name: "Root Session",
        created: "2026-01-01T00:00:00.000Z",
        modified: "2026-01-01T00:00:00.000Z",
        messageCount: 2,
        firstMessage: "Plan work",
        projectRoot: repoA,
      },
      {
        id: "session-child",
        path: join(repoA, "child.jsonl"),
        cwd: repoA,
        name: undefined,
        created: "2026-01-02T00:00:00.000Z",
        modified: "2026-01-02T00:00:00.000Z",
        messageCount: 1,
        firstMessage: "Child task",
        parentSessionId: "session-root",
        projectRoot: repoA,
      },
    ],
    ts: Date.now(),
  };

  await services.piSessionReconciler.reconcileAll({ runningSessionIds: new Set(["session-root"]) });
  await services.piSessionReconciler.reconcileAll({ runningSessionIds: new Set(["session-root"]) });

  const rootContext = services.runService.getRuntimeContext("pi", "session-root");
  const childContext = services.runService.getRuntimeContext("pi", "session-child");
  assert.ok(rootContext);
  assert.ok(childContext);

  const rootTask = services.taskService.getTask(rootContext.taskId);
  const childTask = services.taskService.getTask(childContext.taskId);
  assert.equal(rootTask?.title, "Root Session");
  assert.equal(rootTask?.status, "active");
  assert.equal(childTask?.parentTaskId, rootTask?.id);

  const updatedRoot = services.taskService.updateTask(rootTask.id, {
    title: "User renamed task",
    expectedUpdatedAt: rootTask.updatedAt,
  });
  assert.equal(updatedRoot.title, "User renamed task");

  globalThis.__piSessionListCache = {
    data: [
      {
        ...globalThis.__piSessionListCache.data[0],
        name: "Renamed by session",
        modified: "2026-01-03T00:00:00.000Z",
      },
    ],
    ts: Date.now(),
  };
  await services.piSessionReconciler.reconcileAll();

  const preserved = services.taskService.getTask(rootTask.id);
  assert.equal(preserved?.title, "User renamed task");

  const childRun = services.runService.listByTask(childTask.id)[0];
  assert.equal(childRun.status, "closed");
});

test("a native task can own multiple Pi runs and resolver routes return durable task ids", async (t) => {
  const { repoA, repoB, servicesModule } = await withRuntimeHarness(t);
  const services = servicesModule.getKernelServices();

  const nativeTask = services.taskService.createTask({
    title: "Coordinator task",
    goal: "Own multiple runs",
    scope: { cwd: repoA, projectRoot: repoA },
  });
  const contextA = services.piSessionReconciler.ensureStartedPiSession({ sessionId: "pi-run-a", cwd: repoA, taskId: nativeTask.id });
  const contextB = services.piSessionReconciler.ensureStartedPiSession({ sessionId: "pi-run-b", cwd: repoB, taskId: nativeTask.id });

  const runs = services.runService.listByTask(nativeTask.id);
  assert.equal(runs.length, 2);
  assert.equal(new Set(runs.map((run) => run.nativeRuntimeId)).size, 2);
  assert.deepEqual(new Set(runs.map((run) => run.taskId)), new Set([nativeTask.id]));
  assert.equal(contextA.taskId, nativeTask.id);
  assert.equal(contextB.taskId, nativeTask.id);

  const { GET: resolveRoute } = await jiti.import("../app/api/tasks/resolve/route.ts");
  const response = await resolveRoute(new Request("http://localhost/api/tasks/resolve?runtimeKind=pi&nativeRuntimeId=pi-run-a"));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.task.id, nativeTask.id);
  assert.equal(body.run.id, contextA.runId);

  const cleared = services.taskService.updateTask(nativeTask.id, {
    goal: "",
    constraints: [],
    nonGoals: [],
    expectedUpdatedAt: body.task.updatedAt,
  });
  assert.equal(cleared.contract?.goal, undefined);
  assert.equal(cleared.contract?.constraints, undefined);
});

test("task detail and artifact routes enforce TaskId semantics and file-access checks", async (t) => {
  const { repoA, servicesModule } = await withRuntimeHarness(t);
  const services = servicesModule.getKernelServices();

  const task = services.taskService.createTask({
    title: "Artifact task",
    scope: { cwd: repoA, projectRoot: repoA },
  });
  const context = services.piSessionReconciler.ensureStartedPiSession({ sessionId: "session-artifact", cwd: repoA, taskId: task.id });
  const otherTask = services.taskService.createTask({
    title: "Other task",
    scope: { cwd: repoA, projectRoot: repoA },
  });
  const otherContext = services.piSessionReconciler.ensureStartedPiSession({ sessionId: "session-other", cwd: repoA, taskId: otherTask.id });
  const allowedFile = join(repoA, "allowed.ts");
  const deniedFile = join(tmpdir(), "pi-web-phase3-denied.ts");
  await writeFile(allowedFile, "export const x = 1;\n", "utf8");
  await writeFile(deniedFile, "nope\n", "utf8");

  globalThis.__piSessionListCache = {
    data: [{
      id: "session-artifact",
      path: join(repoA, "artifact.jsonl"),
      cwd: repoA,
      name: "Artifact Session",
      created: "2026-02-01T00:00:00.000Z",
      modified: "2026-02-01T00:00:00.000Z",
      messageCount: 1,
      firstMessage: "Open file",
      projectRoot: repoA,
    }],
    ts: Date.now(),
  };

  const detailRoute = await jiti.import("../app/api/tasks/[id]/route.ts");
  const invalidResponse = await detailRoute.GET(new Request("http://localhost/api/tasks/session-artifact"), { params: Promise.resolve({ id: "session-artifact" }) });
  assert.equal(invalidResponse.status, 400);

  const artifactRoute = await jiti.import("../app/api/tasks/[id]/artifacts/route.ts");
  const okResponse = await artifactRoute.POST(new Request(`http://localhost/api/tasks/${task.id}/artifacts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filePath: allowedFile,
      sourceSessionId: "session-artifact",
      runId: context.runId,
    }),
  }), { params: Promise.resolve({ id: task.id }) });
  assert.equal(okResponse.status, 201);

  const deniedResponse = await artifactRoute.POST(new Request(`http://localhost/api/tasks/${task.id}/artifacts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filePath: deniedFile,
      sourceSessionId: "session-artifact",
      runId: context.runId,
    }),
  }), { params: Promise.resolve({ id: task.id }) });
  assert.equal(deniedResponse.status, 403);

  const wrongRunResponse = await artifactRoute.POST(new Request(`http://localhost/api/tasks/${task.id}/artifacts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filePath: allowedFile,
      sourceSessionId: "session-artifact",
      runId: otherContext.runId,
    }),
  }), { params: Promise.resolve({ id: task.id }) });
  assert.equal(wrongRunResponse.status, 404);
});

test("startup recovery interrupts stale running runs exactly once", async (t) => {
  const { repoA, servicesModule } = await withRuntimeHarness(t);
  const services = servicesModule.getKernelServices();

  const task = services.taskService.createTask({
    title: "Startup recovery",
    scope: { cwd: repoA, projectRoot: repoA },
  });
  const context = services.piSessionReconciler.ensureStartedPiSession({ sessionId: "stale-run", cwd: repoA, taskId: task.id });
  services.runService.updateRunStatus(context.runId, "running", { lastSeenAt: "2026-03-01T00:00:00.000Z" });

  servicesModule.ensureKernelStartupRecovery();
  servicesModule.ensureKernelStartupRecovery();

  const run = services.runService.listByTask(task.id).find((item) => item.id === context.runId);
  assert.equal(run?.status, "interrupted");
  const events = services.uow.events.getByTask(task.id, { limit: 50 });
  assert.equal(events.filter((entry) => entry.event.type === "run.interrupted").length, 1);
});

test("task contract expectedArtifacts and acceptanceCriteria support create/update/delete with validation", async (t) => {
  const { repoA, servicesModule } = await withRuntimeHarness(t);
  const services = servicesModule.getKernelServices();

  const task = services.taskService.createTask({
    title: "Contract fields",
    scope: { cwd: repoA, projectRoot: repoA },
    expectedArtifacts: [{ id: "a1", title: "Draft spec" }],
    acceptanceCriteria: [{ id: "c1", description: "Spec reviewed" }],
  });
  assert.equal(task.contract?.expectedArtifacts?.length, 1);
  assert.equal(task.contract?.acceptanceCriteria?.length, 1);

  const updated = services.taskService.updateTask(task.id, {
    expectedArtifacts: [
      { id: "a1", title: "Final spec" },
      { id: "a2", title: "Test report" },
    ],
    acceptanceCriteria: [{ id: "c2", description: "All checks pass" }],
    expectedUpdatedAt: task.updatedAt,
  });
  assert.equal(updated.contract?.expectedArtifacts?.[0].title, "Final spec");
  assert.equal(updated.contract?.expectedArtifacts?.length, 2);
  assert.equal(updated.contract?.acceptanceCriteria?.[0].id, "c2");

  const cleared = services.taskService.updateTask(task.id, {
    expectedArtifacts: [],
    acceptanceCriteria: [],
    expectedUpdatedAt: updated.updatedAt,
  });
  assert.equal(cleared.contract?.expectedArtifacts, undefined);
  assert.equal(cleared.contract?.acceptanceCriteria, undefined);

  assert.throws(() => services.taskService.updateTask(task.id, {
    expectedArtifacts: [{ id: "dup", title: "A" }, { id: "dup", title: "B" }],
    expectedUpdatedAt: cleared.updatedAt,
  }), /Duplicate expectedArtifacts id/);
});

test("native task Pi run cannot be silently rebound and keeps default run stable during reconcile", async (t) => {
  const { repoA, servicesModule } = await withRuntimeHarness(t);
  const services = servicesModule.getKernelServices();

  const taskA = services.taskService.createTask({ title: "Task A", scope: { cwd: repoA, projectRoot: repoA } });
  const taskB = services.taskService.createTask({ title: "Task B", scope: { cwd: repoA, projectRoot: repoA } });
  const runA = services.piSessionReconciler.ensureStartedPiSession({ sessionId: "shared-session", cwd: repoA, taskId: taskA.id });

  assert.throws(
    () => services.piSessionReconciler.ensureStartedPiSession({ sessionId: "shared-session", cwd: repoA, taskId: taskB.id }),
    /Run already belongs to another task/,
  );

  const before = services.taskService.getTask(taskA.id);
  const originalDefault = before?.defaultRunId;

  globalThis.__piSessionListCache = {
    data: [{
      id: "shared-session",
      path: join(repoA, "shared-session.jsonl"),
      cwd: repoA,
      name: "Shared Session",
      created: "2026-04-01T00:00:00.000Z",
      modified: "2026-04-01T00:00:00.000Z",
      messageCount: 1,
      firstMessage: "hello",
      projectRoot: repoA,
    }],
    ts: Date.now(),
  };
  await services.piSessionReconciler.reconcileSession("shared-session", { running: true });
  const after = services.taskService.getTask(taskA.id);
  assert.equal(after?.defaultRunId, originalDefault);
  assert.equal(runA.runId, originalDefault);
});

test("missing-session reconciliation also closes Pi runs attached to native tasks", async (t) => {
  const { repoA, servicesModule } = await withRuntimeHarness(t);
  const services = servicesModule.getKernelServices();
  const task = services.taskService.createTask({ title: "Native", scope: { cwd: repoA, projectRoot: repoA } });
  const context = services.piSessionReconciler.ensureStartedPiSession({ sessionId: "native-missing", cwd: repoA, taskId: task.id });
  services.runService.updateRunStatus(context.runId, "running", { lastSeenAt: "2026-05-01T00:00:00.000Z" });

  globalThis.__piSessionListCache = { data: [], ts: Date.now() };
  await services.piSessionReconciler.reconcileAll();

  const run = services.runService.listByTask(task.id).find((item) => item.id === context.runId);
  assert.equal(run?.status, "closed");
  const refreshedTask = services.taskService.getTask(task.id);
  assert.equal(refreshedTask?.metadata?.sourceSessionMissing, true);
});
