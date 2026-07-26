import { existsSync, mkdirSync, rmSync } from "fs";
import { dirname } from "path";
import { DatabaseSync } from "node:sqlite";
import { resolveKernelDatabasePath } from "./data-directory";
import { migration001Initial } from "./migrations/001_initial";
import { migration002TaskArtifactAttachmentMetadata } from "./migrations/002_task_artifact_attachment_metadata";
import { migration003CapabilityPolicyEvaluationWorkspace } from "./migrations/003_capability_policy_evaluation_workspace";

const MIGRATIONS = [
  migration001Initial,
  migration002TaskArtifactAttachmentMetadata,
  migration003CapabilityPolicyEvaluationWorkspace,
] as const;

const SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

declare global {
  var __piWebKernelDb: KernelDatabase | undefined;
}

function applyMigrations(db: DatabaseSync): void {
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const row = db.prepare("SELECT MAX(version) AS version FROM schema_migrations").get() as { version?: number } | undefined;
  const currentVersion = typeof row?.version === "number" ? row.version : 0;

  if (currentVersion > SCHEMA_VERSION) {
    throw new Error(
      `Kernel database schema ${currentVersion} is newer than supported ${SCHEMA_VERSION}. `
      + "Please upgrade pi-web or restore from a compatible backup.",
    );
  }
  if (currentVersion === SCHEMA_VERSION) return;

  const insert = db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)");
  for (const migration of MIGRATIONS) {
    if (migration.version <= currentVersion) continue;
    db.exec("BEGIN IMMEDIATE");
    try {
      migration.apply(db);
      insert.run(migration.version, new Date().toISOString());
      db.exec("COMMIT");
    } catch {
      db.exec("ROLLBACK");
      throw new Error(
        `Failed to apply kernel migration ${migration.version} (${migration.description}). `
        + "Database was not modified. Restore from backup if this persists.",
      );
    }
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
    try {
      applyMigrations(this.connection);
    } catch (error) {
      this.connection.close();
      throw error;
    }
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
