import type { DatabaseSync } from "node:sqlite";

export const migration001Initial = {
  version: 1,
  description: "Initial kernel runtime schema",
  apply(db: DatabaseSync): void {
    db.exec(`
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
  },
} as const;
