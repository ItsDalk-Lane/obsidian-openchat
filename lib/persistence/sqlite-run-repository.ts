import type { RunRepository } from "@/lib/application/ports/run-repository";
import type { Run, RunId, RuntimeKind, TaskId } from "@/lib/kernel";
import type { DatabaseSync } from "node:sqlite";
import { parseJsonRecord, stringifyJson } from "./sqlite-helpers";

type RunRow = {
  id: string;
  task_id: string;
  runtime_kind: RuntimeKind;
  native_runtime_id: string;
  status: Run["status"];
  metadata_json: string | null;
  created_at: string;
  updated_at: string;
  last_seen_at: string | null;
};

function mapRow(row: RunRow | undefined): Run | null {
  if (!row) return null;
  return {
    id: row.id as RunId,
    taskId: row.task_id as TaskId,
    runtimeKind: row.runtime_kind,
    nativeRuntimeId: row.native_runtime_id,
    status: row.status,
    metadata: parseJsonRecord(row.metadata_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastSeenAt: row.last_seen_at ?? undefined,
  };
}

export class SqliteRunRepository implements RunRepository {
  constructor(private readonly db: DatabaseSync) {}

  getById(id: RunId): Run | null {
    const row = this.db.prepare("SELECT id, task_id, runtime_kind, native_runtime_id, status, metadata_json, created_at, updated_at, last_seen_at FROM runs WHERE id = ?").get(id) as RunRow | undefined;
    return mapRow(row);
  }

  listByTask(taskId: TaskId): Run[] {
    const rows = this.db.prepare("SELECT id, task_id, runtime_kind, native_runtime_id, status, metadata_json, created_at, updated_at, last_seen_at FROM runs WHERE task_id = ? ORDER BY created_at ASC").all(taskId) as RunRow[];
    return rows.map((row) => mapRow(row)).filter((run): run is Run => run !== null);
  }

  findByNativeRuntime(runtimeKind: RuntimeKind, nativeRuntimeId: string): Run | null {
    const row = this.db.prepare("SELECT id, task_id, runtime_kind, native_runtime_id, status, metadata_json, created_at, updated_at, last_seen_at FROM runs WHERE runtime_kind = ? AND native_runtime_id = ?").get(runtimeKind, nativeRuntimeId) as RunRow | undefined;
    return mapRow(row);
  }

  create(run: Run): Run {
    this.db.prepare("INSERT INTO runs (id, task_id, runtime_kind, native_runtime_id, status, metadata_json, created_at, updated_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
      run.id,
      run.taskId,
      run.runtimeKind,
      run.nativeRuntimeId,
      run.status,
      stringifyJson(run.metadata),
      run.createdAt,
      run.updatedAt,
      run.lastSeenAt ?? null,
    );
    return run;
  }

  update(run: Run): Run {
    this.db.prepare("UPDATE runs SET task_id = ?, status = ?, metadata_json = ?, updated_at = ?, last_seen_at = ? WHERE id = ?").run(
      run.taskId,
      run.status,
      stringifyJson(run.metadata),
      run.updatedAt,
      run.lastSeenAt ?? null,
      run.id,
    );
    return run;
  }

  updateStatus(id: RunId, status: Run["status"], updatedAt: string, lastSeenAt?: string): Run | null {
    this.db.prepare("UPDATE runs SET status = ?, updated_at = ?, last_seen_at = COALESCE(?, last_seen_at) WHERE id = ?").run(
      status,
      updatedAt,
      lastSeenAt ?? null,
      id,
    );
    return this.getById(id);
  }

  upsertImportedRun(run: Run): Run {
    this.db.prepare(`
      INSERT INTO runs (id, task_id, runtime_kind, native_runtime_id, status, metadata_json, created_at, updated_at, last_seen_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        task_id = excluded.task_id,
        status = excluded.status,
        metadata_json = excluded.metadata_json,
        updated_at = excluded.updated_at,
        last_seen_at = excluded.last_seen_at
    `).run(
      run.id,
      run.taskId,
      run.runtimeKind,
      run.nativeRuntimeId,
      run.status,
      stringifyJson(run.metadata),
      run.createdAt,
      run.updatedAt,
      run.lastSeenAt ?? null,
    );
    return this.getById(run.id) ?? run;
  }

  listByStatus(status: Run["status"]): Run[] {
    const rows = this.db.prepare("SELECT id, task_id, runtime_kind, native_runtime_id, status, metadata_json, created_at, updated_at, last_seen_at FROM runs WHERE status = ? ORDER BY updated_at ASC").all(status) as RunRow[];
    return rows.map((row) => mapRow(row)).filter((run): run is Run => run !== null);
  }
}
