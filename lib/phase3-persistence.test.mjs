import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });

async function withIsolatedKernel(t) {
  const root = await mkdtemp(join(tmpdir(), "pi-web-phase3-persistence-"));
  const agentDir = join(root, "agent");
  const dataDir = join(root, "data");
  const cwd = join(root, "repo");
  await mkdir(agentDir, { recursive: true });
  await mkdir(cwd, { recursive: true });

  const previousDataDir = process.env.PI_WEB_DATA_DIR;
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_WEB_DATA_DIR = dataDir;
  process.env.PI_CODING_AGENT_DIR = agentDir;

  const persistence = await jiti.import("./persistence/index.ts");
  const servicesModule = await jiti.import("./application/services/index.ts");

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

  return { root, agentDir, dataDir, cwd, persistence, servicesModule };
}

test("kernel persistence honors PI_WEB_DATA_DIR and applies schema migrations once", async (t) => {
  const { dataDir, persistence } = await withIsolatedKernel(t);
  const db = persistence.getKernelDatabase();
  assert.equal(db.path, join(dataDir, "kernel.sqlite"));

  const migrationRow = db.connection.prepare("SELECT COUNT(*) AS count, MAX(version) AS version FROM schema_migrations").get();
  assert.equal(migrationRow.count, persistence.getKernelSchemaVersion());
  assert.equal(migrationRow.version, persistence.getKernelSchemaVersion());

  persistence.resetKernelDatabaseForTests();
  const reopened = persistence.getKernelDatabase();
  const reopenedRow = reopened.connection.prepare("SELECT COUNT(*) AS count, MAX(version) AS version FROM schema_migrations").get();
  assert.equal(reopenedRow.count, persistence.getKernelSchemaVersion());
  assert.equal(reopenedRow.version, persistence.getKernelSchemaVersion());
});

test("task, run, artifact, and event repositories round-trip durable state", async (t) => {
  const { cwd, servicesModule } = await withIsolatedKernel(t);
  const services = servicesModule.getKernelServices();

  const task = services.taskService.createTask({
    title: "Native task",
    goal: "Ship phase 3",
    constraints: ["No real user data"],
    scope: { cwd, projectRoot: cwd },
  });
  const runtimeA = services.piSessionReconciler.ensureStartedPiSession({ sessionId: "sess-a", cwd, taskId: task.id });
  const runtimeB = services.piSessionReconciler.ensureStartedPiSession({ sessionId: "sess-b", cwd, taskId: task.id });

  const artifactPath = join(cwd, "notes.txt");
  await writeFile(artifactPath, "hello", "utf8");
  const { createKernelEvent } = await jiti.import("./kernel/index.ts");
  const { createFileArtifact } = await jiti.import("./artifacts/index.ts");

  const attachment = services.artifactService.registerArtifact({
    taskId: task.id,
    runId: runtimeA.runId,
    sourceSessionId: "sess-a",
    artifact: createFileArtifact(artifactPath, { sourceSessionId: "sess-a", cwd }),
  });
  assert.equal(attachment.taskId, task.id);

  const durableEvent = createKernelEvent(
    "operation.started",
    task.id,
    runtimeA.runId,
    { operationKind: "prompt" },
    { kind: "runtime", adapter: "pi", nativeType: "prompt" },
  );
  services.eventService.appendIfDurable(durableEvent);

  const runs = services.runService.listByTask(task.id);
  assert.equal(runs.length, 2);
  assert.equal(runs[0].nativeRuntimeId, "sess-a");
  assert.equal(runs[1].nativeRuntimeId, "sess-b");

  const artifacts = services.artifactService.listByTask(task.id);
  assert.equal(artifacts.length, 1);
  assert.equal(artifacts[0].artifact.representations[0].kind, "file");

  const events = services.uow.events.getByTask(task.id, { limit: 50 });
  assert.ok(events.some((entry) => entry.event.type === "task.created"));
  assert.ok(events.some((entry) => entry.event.type === "run.created"));
  assert.ok(events.some((entry) => entry.event.type === "artifact.registered"));
  assert.ok(events.some((entry) => entry.event.type === "operation.started"));

  assert.equal(runtimeA.taskId, task.id);
  assert.equal(runtimeB.taskId, task.id);
});

test("unit of work rolls back failed transactions and malformed JSON does not crash task listing", async (t) => {
  const { persistence, servicesModule } = await withIsolatedKernel(t);
  const services = servicesModule.getKernelServices();

  assert.throws(() => {
    services.uow.transaction(({ tasks }) => {
      tasks.create({
        id: "task_deadbeef",
        title: "Rollback",
        status: "draft",
        origin: { kind: "native" },
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      });
      throw new Error("boom");
    });
  }, /boom/);
  assert.equal(services.taskService.getTask("task_deadbeef"), null);

  const db = persistence.getKernelDatabase();
  db.connection.prepare(`
    INSERT INTO tasks (
      id, title, status, contract_json, scope_json, origin_kind, origin_external_id,
      parent_task_id, default_run_id, title_source, metadata_json, created_at, updated_at, archived_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    "task_badjson",
    "Bad JSON",
    "idle",
    "{not valid",
    null,
    "native",
    null,
    null,
    null,
    "native",
    "{still bad",
    "2026-01-01T00:00:00.000Z",
    "2026-01-01T00:00:00.000Z",
    null,
  );

  const listed = services.taskService.listTasks({ includeArchived: true });
  const badTask = listed.find((item) => item.id === "task_badjson");
  assert.equal(badTask?.title, "Bad JSON");
  assert.equal(badTask?.contract, undefined);
  assert.equal(badTask?.metadata, undefined);
});
