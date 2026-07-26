import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
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
    servicesModule.resetKernelStartupRecoveryForTests?.();
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

test("kernel persistence upgrades v1 schema to latest", async (t) => {
  const { dataDir, persistence, servicesModule } = await withIsolatedKernel(t);
  await mkdir(dataDir, { recursive: true });
  const dbPath = join(dataDir, "kernel.sqlite");

  const seed = new DatabaseSync(dbPath);
  seed.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
    INSERT INTO schema_migrations (version, applied_at) VALUES (1, '2026-01-01T00:00:00.000Z');
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      status TEXT NOT NULL,
      contract_json TEXT,
      scope_json TEXT,
      origin_kind TEXT NOT NULL,
      origin_external_id TEXT,
      parent_task_id TEXT,
      default_run_id TEXT,
      title_source TEXT,
      metadata_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      archived_at TEXT
    );
    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      runtime_kind TEXT NOT NULL,
      native_runtime_id TEXT NOT NULL,
      status TEXT NOT NULL,
      metadata_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_seen_at TEXT
    );
    CREATE TABLE IF NOT EXISTS artifacts (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      media_type TEXT,
      version INTEGER NOT NULL,
      status TEXT NOT NULL,
      representations_json TEXT NOT NULL,
      provenance_json TEXT,
      metadata_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS task_artifacts (
      task_id TEXT NOT NULL,
      artifact_id TEXT NOT NULL,
      run_id TEXT,
      source_session_id TEXT,
      attached_at TEXT NOT NULL,
      PRIMARY KEY(task_id, artifact_id)
    );
    CREATE TABLE IF NOT EXISTS kernel_events (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT NOT NULL UNIQUE,
      task_id TEXT NOT NULL,
      run_id TEXT,
      operation_id TEXT,
      type TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      source_json TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      durability TEXT NOT NULL
    );
  `);
  seed.close();

  persistence.resetKernelDatabaseForTests();
  servicesModule.resetKernelServicesForTests();
  const db = persistence.getKernelDatabase();
  const migrationRow = db.connection.prepare("SELECT MAX(version) AS version FROM schema_migrations").get();
  assert.equal(migrationRow.version, persistence.getKernelSchemaVersion());

  const artifactColumns = db.connection.prepare("PRAGMA table_info(task_artifacts)").all();
  const columnNames = new Set(artifactColumns.map((column) => column.name));
  assert.equal(columnNames.has("status"), true);
  assert.equal(columnNames.has("title_override"), true);
  assert.equal(columnNames.has("role"), true);
});

test("kernel persistence rejects newer unknown schema versions", async (t) => {
  const { dataDir, persistence, servicesModule } = await withIsolatedKernel(t);
  await mkdir(dataDir, { recursive: true });
  const dbPath = join(dataDir, "kernel.sqlite");
  const seed = new DatabaseSync(dbPath);
  seed.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
    INSERT INTO schema_migrations (version, applied_at) VALUES (999, '2026-01-01T00:00:00.000Z');
  `);
  seed.close();

  persistence.resetKernelDatabaseForTests();
  servicesModule.resetKernelServicesForTests();
  assert.throws(() => persistence.getKernelDatabase(), /newer than supported/);
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

test("task artifact attachment status is isolated per task for shared artifact", async (t) => {
  const { cwd, servicesModule } = await withIsolatedKernel(t);
  const services = servicesModule.getKernelServices();
  const { createFileArtifact } = await jiti.import("./artifacts/index.ts");

  const taskA = services.taskService.createTask({ title: "Task A", scope: { cwd, projectRoot: cwd } });
  const taskB = services.taskService.createTask({ title: "Task B", scope: { cwd, projectRoot: cwd } });
  const runA = services.piSessionReconciler.ensureStartedPiSession({ sessionId: "attach-a", cwd, taskId: taskA.id });
  const runB = services.piSessionReconciler.ensureStartedPiSession({ sessionId: "attach-b", cwd, taskId: taskB.id });

  const artifactPath = join(cwd, "shared.txt");
  await writeFile(artifactPath, "shared", "utf8");
  const artifact = createFileArtifact(artifactPath, { cwd });

  services.artifactService.registerArtifact({ taskId: taskA.id, runId: runA.runId, artifact });
  services.artifactService.registerArtifact({ taskId: taskB.id, runId: runB.runId, artifact });

  const updatedA = services.artifactService.updateArtifact({
    taskId: taskA.id,
    artifactId: artifact.id,
    status: "archived",
    titleOverride: "Task A title",
  });
  assert.equal(updatedA.status, "archived");
  assert.equal(updatedA.titleOverride, "Task A title");

  const recordsA = services.artifactService.listByTask(taskA.id);
  const recordsB = services.artifactService.listByTask(taskB.id);
  assert.equal(recordsA[0].status, "archived");
  assert.equal(recordsB[0].status, "ready");
  assert.equal(recordsB[0].titleOverride, undefined);
  assert.equal(recordsA[0].artifact.id, recordsB[0].artifact.id);
});

test("kernel maintenance can create backups and prune old events with per-task guard", async (t) => {
  const { dataDir, persistence } = await withIsolatedKernel(t);
  const db = persistence.getKernelDatabase();
  const maintenance = await jiti.import("./server/kernel-maintenance.ts");

  db.connection.prepare(`
    INSERT INTO kernel_events (
      event_id, task_id, run_id, operation_id, type, occurred_at, source_json, payload_json, durability
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    "event-new-1",
    "task_alpha",
    null,
    null,
    "task.updated",
    new Date().toISOString(),
    JSON.stringify({ kind: "system" }),
    JSON.stringify({ changedFields: ["title"] }),
    "durable",
  );
  for (let i = 0; i < 5; i += 1) {
    db.connection.prepare(`
      INSERT INTO kernel_events (
        event_id, task_id, run_id, operation_id, type, occurred_at, source_json, payload_json, durability
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      `event-old-${i}`,
      "task_alpha",
      null,
      null,
      "task.updated",
      "2020-01-01T00:00:00.000Z",
      JSON.stringify({ kind: "system" }),
      JSON.stringify({ changedFields: ["contract"] }),
      "durable",
    );
  }

  const retention = maintenance.applyKernelEventRetention({ olderThanDays: 365, keepLatestPerTask: 2 });
  assert.equal(retention.beforeCount, 6);
  assert.equal(retention.afterCount, 3);
  assert.equal(retention.deletedCount, 3);

  const backup = maintenance.createKernelBackup();
  assert.equal(backup.backupPath.startsWith(join(dataDir, "backups")), true);
  const backupStats = await stat(backup.backupPath);
  assert.equal(backupStats.size > 0, true);
});
