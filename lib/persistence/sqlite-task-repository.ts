import type { TaskRepository, TaskListFilters } from "@/lib/application/ports/task-repository";
import type { Task, TaskId } from "@/lib/kernel";
import type { DatabaseSync } from "node:sqlite";
import { parseJsonRecord, parseJsonValue, stringifyJson } from "./sqlite-helpers";

type TaskRow = {
  id: string;
  title: string;
  status: Task["status"];
  contract_json: string | null;
  scope_json: string | null;
  origin_kind: Task["origin"]["kind"];
  origin_external_id: string | null;
  parent_task_id: string | null;
  default_run_id: string | null;
  title_source: Task["titleSource"] | null;
  metadata_json: string | null;
  created_at: string;
  updated_at: string;
};

function mapRow(row: TaskRow | undefined): Task | null {
  if (!row) return null;
  return {
    id: row.id as TaskId,
    title: row.title,
    status: row.status,
    contract: parseJsonValue(row.contract_json) as Task["contract"] | undefined,
    scope: parseJsonValue(row.scope_json) as Task["scope"] | undefined,
    origin: {
      kind: row.origin_kind,
      externalId: row.origin_external_id ?? undefined,
    },
    parentTaskId: (row.parent_task_id ?? undefined) as Task["parentTaskId"],
    defaultRunId: (row.default_run_id ?? undefined) as Task["defaultRunId"],
    titleSource: row.title_source ?? undefined,
    metadata: parseJsonRecord(row.metadata_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function buildListQuery(filters?: TaskListFilters): { sql: string; values: unknown[] } {
  const clauses: string[] = [];
  const values: unknown[] = [];
  if (!filters?.includeArchived) {
    clauses.push("status != ?");
    values.push("archived");
  }
  if (filters?.originKind) {
    clauses.push("origin_kind = ?");
    values.push(filters.originKind);
  }
  if (filters?.status) {
    clauses.push("status = ?");
    values.push(filters.status);
  }
  if (filters?.projectRoot) {
    clauses.push("json_extract(scope_json, '$.projectRoot') = ?");
    values.push(filters.projectRoot);
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  return {
    sql: `SELECT id, title, status, contract_json, scope_json, origin_kind, origin_external_id, parent_task_id, default_run_id, title_source, metadata_json, created_at, updated_at FROM tasks ${where} ORDER BY updated_at DESC, created_at DESC`,
    values,
  };
}

export class SqliteTaskRepository implements TaskRepository {
  constructor(private readonly db: DatabaseSync) {}

  getById(id: TaskId): Task | null {
    const row = this.db.prepare(
      "SELECT id, title, status, contract_json, scope_json, origin_kind, origin_external_id, parent_task_id, default_run_id, title_source, metadata_json, created_at, updated_at FROM tasks WHERE id = ?",
    ).get(id) as TaskRow | undefined;
    return mapRow(row);
  }

  list(filters?: TaskListFilters): Task[] {
    const query = buildListQuery(filters);
    const rows = this.db.prepare(query.sql).all(...(query.values as Array<string | number | null>)) as TaskRow[];
    return rows.map((row) => mapRow(row)).filter((task): task is Task => task !== null);
  }

  create(task: Task): Task {
    this.db.prepare(`
      INSERT INTO tasks (
        id, title, status, contract_json, scope_json, origin_kind, origin_external_id,
        parent_task_id, default_run_id, title_source, metadata_json, created_at, updated_at, archived_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      task.id,
      task.title,
      task.status,
      stringifyJson(task.contract),
      stringifyJson(task.scope),
      task.origin.kind,
      task.origin.externalId ?? null,
      task.parentTaskId ?? null,
      task.defaultRunId ?? null,
      task.titleSource ?? null,
      stringifyJson(task.metadata),
      task.createdAt,
      task.updatedAt,
      task.status === "archived" ? task.updatedAt : null,
    );
    return task;
  }

  update(task: Task): Task {
    this.db.prepare(`
      UPDATE tasks
      SET title = ?, status = ?, contract_json = ?, scope_json = ?, default_run_id = ?,
          title_source = ?, metadata_json = ?, updated_at = ?, archived_at = ?
      WHERE id = ?
    `).run(
      task.title,
      task.status,
      stringifyJson(task.contract),
      stringifyJson(task.scope),
      task.defaultRunId ?? null,
      task.titleSource ?? null,
      stringifyJson(task.metadata),
      task.updatedAt,
      task.status === "archived" ? task.updatedAt : null,
      task.id,
    );
    return task;
  }

  findByOrigin(origin: Task["origin"]): Task | null {
    if (!origin.externalId) return null;
    const row = this.db.prepare(
      "SELECT id, title, status, contract_json, scope_json, origin_kind, origin_external_id, parent_task_id, default_run_id, title_source, metadata_json, created_at, updated_at FROM tasks WHERE origin_kind = ? AND origin_external_id = ?",
    ).get(origin.kind, origin.externalId) as TaskRow | undefined;
    return mapRow(row);
  }

  upsertImportedTask(task: Task): Task {
    this.db.prepare(`
      INSERT INTO tasks (
        id, title, status, contract_json, scope_json, origin_kind, origin_external_id,
        parent_task_id, default_run_id, title_source, metadata_json, created_at, updated_at, archived_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        status = excluded.status,
        contract_json = COALESCE(tasks.contract_json, excluded.contract_json),
        scope_json = excluded.scope_json,
        default_run_id = COALESCE(tasks.default_run_id, excluded.default_run_id),
        title_source = excluded.title_source,
        metadata_json = excluded.metadata_json,
        updated_at = excluded.updated_at
    `).run(
      task.id,
      task.title,
      task.status,
      stringifyJson(task.contract),
      stringifyJson(task.scope),
      task.origin.kind,
      task.origin.externalId ?? null,
      task.parentTaskId ?? null,
      task.defaultRunId ?? null,
      task.titleSource ?? null,
      stringifyJson(task.metadata),
      task.createdAt,
      task.updatedAt,
      task.status === "archived" ? task.updatedAt : null,
    );
    return this.getById(task.id) ?? task;
  }
}
