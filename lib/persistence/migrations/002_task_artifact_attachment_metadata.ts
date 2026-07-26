import type { DatabaseSync } from "node:sqlite";

type TableInfoRow = { name: string };

function hasColumn(db: DatabaseSync, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as TableInfoRow[];
  return rows.some((row) => row.name === column);
}

export const migration002TaskArtifactAttachmentMetadata = {
  version: 2,
  description: "Task artifact attachment metadata",
  apply(db: DatabaseSync): void {
    if (!hasColumn(db, "task_artifacts", "status")) {
      db.exec("ALTER TABLE task_artifacts ADD COLUMN status TEXT");
      db.exec("UPDATE task_artifacts SET status = 'ready' WHERE status IS NULL");
    }
    if (!hasColumn(db, "task_artifacts", "title_override")) {
      db.exec("ALTER TABLE task_artifacts ADD COLUMN title_override TEXT");
    }
    if (!hasColumn(db, "task_artifacts", "role")) {
      db.exec("ALTER TABLE task_artifacts ADD COLUMN role TEXT");
    }
    if (!hasColumn(db, "task_artifacts", "provenance_json")) {
      db.exec("ALTER TABLE task_artifacts ADD COLUMN provenance_json TEXT");
    }
    if (!hasColumn(db, "task_artifacts", "metadata_json")) {
      db.exec("ALTER TABLE task_artifacts ADD COLUMN metadata_json TEXT");
    }
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_task_artifacts_task_attached
        ON task_artifacts(task_id, attached_at);
    `);
  },
} as const;
