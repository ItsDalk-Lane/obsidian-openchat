import type { EventJournal, EventQueryFilters } from "@/lib/application/ports/event-journal";
import type { KernelEvent, KernelEventDurability, RunId, StoredKernelEvent, TaskId } from "@/lib/kernel";
import type { DatabaseSync } from "node:sqlite";
import { parseJsonValue, stringifyJson } from "./sqlite-helpers";

type EventRow = {
  sequence: number;
  event_id: string;
  task_id: string;
  run_id: string | null;
  operation_id: string | null;
  type: KernelEvent["type"];
  occurred_at: string;
  source_json: string;
  payload_json: string;
  durability: KernelEventDurability;
};

function mapRow(row: EventRow | undefined): StoredKernelEvent | null {
  if (!row) return null;
  const payload = parseJsonValue(row.payload_json);
  const source = parseJsonValue(row.source_json);
  if (!payload || !source) return null;
  return {
    sequence: row.sequence,
    durability: row.durability,
    event: {
      schemaVersion: 1,
      id: row.event_id,
      type: row.type,
      occurredAt: row.occurred_at,
      taskId: row.task_id as TaskId,
      ...(row.run_id ? { runId: row.run_id as RunId } : {}),
      ...(row.operation_id ? { operationId: row.operation_id } : {}),
      source: source as KernelEvent["source"],
      payload: payload as KernelEvent["payload"],
    } as KernelEvent,
  };
}

function buildWhere(taskOrRunClause: string, id: string, filters?: EventQueryFilters): { sql: string; values: unknown[] } {
  const clauses = [taskOrRunClause];
  const values: unknown[] = [id];
  if (filters?.afterSequence !== undefined) {
    clauses.push("sequence > ?");
    values.push(filters.afterSequence);
  }
  if (filters?.runId) {
    clauses.push("run_id = ?");
    values.push(filters.runId);
  }
  if (filters?.type) {
    clauses.push("type = ?");
    values.push(filters.type);
  }
  const limit = Math.min(Math.max(filters?.limit ?? 100, 1), 500);
  return {
    sql: `WHERE ${clauses.join(" AND ")} ORDER BY sequence ASC LIMIT ${limit}`,
    values,
  };
}

export class SqliteEventJournal implements EventJournal {
  constructor(private readonly db: DatabaseSync) {}

  append(event: KernelEvent, durability: KernelEventDurability): StoredKernelEvent | null {
    this.db.prepare(`
      INSERT OR IGNORE INTO kernel_events (
        event_id, task_id, run_id, operation_id, type, occurred_at, source_json, payload_json, durability
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      event.id,
      event.taskId,
      event.runId ?? null,
      event.operationId ?? null,
      event.type,
      event.occurredAt,
      stringifyJson(event.source),
      stringifyJson(event.payload),
      durability,
    );

    const row = this.db.prepare(`
      SELECT sequence, event_id, task_id, run_id, operation_id, type, occurred_at, source_json, payload_json, durability
      FROM kernel_events
      WHERE event_id = ?
    `).get(event.id) as EventRow | undefined;
    return mapRow(row);
  }

  appendMany(events: Array<{ event: KernelEvent; durability: KernelEventDurability }>): StoredKernelEvent[] {
    const stored: StoredKernelEvent[] = [];
    for (const entry of events) {
      const appended = this.append(entry.event, entry.durability);
      if (appended) stored.push(appended);
    }
    return stored;
  }

  getByTask(taskId: TaskId, filters?: EventQueryFilters): StoredKernelEvent[] {
    const where = buildWhere("task_id = ?", taskId, filters);
    const rows = this.db.prepare(`
      SELECT sequence, event_id, task_id, run_id, operation_id, type, occurred_at, source_json, payload_json, durability
      FROM kernel_events
      ${where.sql}
    `).all(...(where.values as Array<string | number | null>)) as EventRow[];
    return rows.map((row) => mapRow(row)).filter((event): event is StoredKernelEvent => event !== null);
  }

  getByRun(runId: RunId, filters?: Omit<EventQueryFilters, "runId">): StoredKernelEvent[] {
    const where = buildWhere("run_id = ?", runId, filters);
    const rows = this.db.prepare(`
      SELECT sequence, event_id, task_id, run_id, operation_id, type, occurred_at, source_json, payload_json, durability
      FROM kernel_events
      ${where.sql}
    `).all(...(where.values as Array<string | number | null>)) as EventRow[];
    return rows.map((row) => mapRow(row)).filter((event): event is StoredKernelEvent => event !== null);
  }

  readAfter(sequence: number, limit = 100): StoredKernelEvent[] {
    const rows = this.db.prepare(`
      SELECT sequence, event_id, task_id, run_id, operation_id, type, occurred_at, source_json, payload_json, durability
      FROM kernel_events
      WHERE sequence > ?
      ORDER BY sequence ASC
      LIMIT ?
    `).all(sequence, Math.min(Math.max(limit, 1), 500)) as EventRow[];
    return rows.map((row) => mapRow(row)).filter((event): event is StoredKernelEvent => event !== null);
  }

  hasEvent(eventId: string): boolean {
    const row = this.db.prepare("SELECT 1 AS value FROM kernel_events WHERE event_id = ?").get(eventId) as { value?: number } | undefined;
    return row?.value === 1;
  }

  getLatestSequence(): number {
    const row = this.db.prepare("SELECT MAX(sequence) AS sequence FROM kernel_events").get() as { sequence?: number } | undefined;
    return typeof row?.sequence === "number" ? row.sequence : 0;
  }
}
