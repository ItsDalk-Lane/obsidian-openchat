import { existsSync, mkdirSync, rmSync } from "fs";
import { dirname } from "path";
import { DatabaseSync } from "node:sqlite";
import { resolveKernelDatabasePath } from "./data-directory";

const SCHEMA_VERSION = 1;

declare global {
  var __piWebKernelDb: KernelDatabase | undefined;
}

function applyMigrations(db: DatabaseSync): void {
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );

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

    CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_origin
      ON tasks(origin_kind, origin_external_id)
      WHERE origin_external_id IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_project_root
      ON tasks(json_extract(scope_json, '$.projectRoot'));

    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      runtime_kind TEXT NOT NULL,
      native_runtime_id TEXT NOT NULL,
      status TEXT NOT NULL,
      metadata_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_seen_at TEXT,
      FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE RESTRICT
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_runs_runtime
      ON runs(runtime_kind, native_runtime_id);
    CREATE INDEX IF NOT EXISTS idx_runs_task_id ON runs(task_id);
    CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);

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
      PRIMARY KEY(task_id, artifact_id),
      FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE RESTRICT,
      FOREIGN KEY(artifact_id) REFERENCES artifacts(id) ON DELETE RESTRICT,
      FOREIGN KEY(run_id) REFERENCES runs(id) ON DELETE SET NULL
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

    CREATE INDEX IF NOT EXISTS idx_kernel_events_task_sequence
      ON kernel_events(task_id, sequence);
    CREATE INDEX IF NOT EXISTS idx_kernel_events_run_sequence
      ON kernel_events(run_id, sequence);
    CREATE INDEX IF NOT EXISTS idx_kernel_events_type_sequence
      ON kernel_events(type, sequence);
  `);

  const row = db.prepare("SELECT MAX(version) AS version FROM schema_migrations").get() as { version?: number } | undefined;
  const currentVersion = typeof row?.version === "number" ? row.version : 0;
  if (currentVersion >= SCHEMA_VERSION) return;

  const insert = db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)");
  for (let version = currentVersion + 1; version <= SCHEMA_VERSION; version += 1) {
    insert.run(version, new Date().toISOString());
  }
}

export class KernelDatabase {
  private disposed = false;
  readonly path: string;
  readonly connection: DatabaseSync;
  private transactionDepth = 0;

  constructor(path = resolveKernelDatabasePath()) {
    this.path = path;
    mkdirSync(dirname(path), { recursive: true });
    this.connection = new DatabaseSync(path);
    applyMigrations(this.connection);
  }

  transaction<T>(work: () => T): T {
    if (this.transactionDepth > 0) {
      this.transactionDepth += 1;
      try {
        return work();
      } finally {
        this.transactionDepth -= 1;
      }
    }

    this.connection.exec("BEGIN IMMEDIATE");
    this.transactionDepth = 1;
    try {
      const result = work();
      this.connection.exec("COMMIT");
      return result;
    } catch (error) {
      this.connection.exec("ROLLBACK");
      throw error;
    } finally {
      this.transactionDepth = 0;
    }
  }

  close(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.connection.close();
  }
}

export function getKernelDatabase(): KernelDatabase {
  if (!globalThis.__piWebKernelDb) {
    globalThis.__piWebKernelDb = new KernelDatabase();
  }
  return globalThis.__piWebKernelDb;
}

export function resetKernelDatabaseForTests(options: { removeFiles?: boolean; path?: string } = {}): void {
  globalThis.__piWebKernelDb?.close();
  globalThis.__piWebKernelDb = undefined;
  if (!options.removeFiles) return;

  const dbPath = options.path ?? resolveKernelDatabasePath();
  const walPath = `${dbPath}-wal`;
  const shmPath = `${dbPath}-shm`;
  if (existsSync(dbPath)) rmSync(dbPath, { force: true });
  if (existsSync(walPath)) rmSync(walPath, { force: true });
  if (existsSync(shmPath)) rmSync(shmPath, { force: true });
}

export function getKernelSchemaVersion(): number {
  return SCHEMA_VERSION;
}
