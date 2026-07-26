import type { EventJournal, EventQueryFilters } from "@/lib/application/ports/event-journal";
import {
  decodeKernelEvent,
  type KernelEvent,
  type KernelEventDurability,
  type RunId,
  type StoredKernelEvent,
  type TaskId,
} from "@/lib/kernel";
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
  const decoded = decodeKernelEvent({
    schemaVersion: 1,
    id: row.event_id,
    type: row.type,
    occurredAt: row.occurred_at,
    taskId: row.task_id,
    ...(row.run_id ? { runId: row.run_id } : {}),
    ...(row.operation_id ? { operationId: row.operation_id } : {}),
    source,
    payload,
  }, {
    taskId: row.task_id as TaskId,
    runId: (row.run_id ?? "run_00000000") as RunId,
  });
  if (!decoded) return null;
  return {
    sequence: row.sequence,
    durability: row.durability,
    event: decoded,
  };
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`);
  return `{${entries.join(",")}}`;
}

function isIdempotentDuplicate(row: EventRow, event: KernelEvent, durability: KernelEventDurability): boolean {
  return row.task_id === event.taskId
    && (row.run_id ?? null) === (event.runId ?? null)
    && (row.operation_id ?? null) === (event.operationId ?? null)
    && row.type === event.type
    && row.occurred_at === event.occurredAt
    && row.durability === durability
    && canonicalize(parseJsonValue(row.source_json)) === canonicalize(event.source)
    && canonicalize(parseJsonValue(row.payload_json)) === canonicalize(event.payload);
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
    try {
      this.db.prepare(`
        INSERT INTO kernel_events (
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
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("UNIQUE constraint failed: kernel_events.event_id")) {
        throw error;
      }
      const existing = this.db.prepare(`
        SELECT sequence, event_id, task_id, run_id, operation_id, type, occurred_at, source_json, payload_json, durability
        FROM kernel_events
        WHERE event_id = ?
      `).get(event.id) as EventRow | undefined;
      if (!existing) {
        throw new Error("Kernel event id conflict");
      }
      if (!isIdempotentDuplicate(existing, event, durability)) {
        throw new Error(`Kernel event id conflict for ${event.id}`);
      }
      return mapRow(existing);
    }

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
    const mapped = rows.map((row) => mapRow(row)).filter((event): event is StoredKernelEvent => event !== null);
    if (mapped.length !== rows.length) {
      console.warn(`[pi-web] ignored ${rows.length - mapped.length} corrupted kernel events for task ${taskId}`);
    }
    return mapped;
  }

  getByRun(runId: RunId, filters?: Omit<EventQueryFilters, "runId">): StoredKernelEvent[] {
    const where = buildWhere("run_id = ?", runId, filters);
    const rows = this.db.prepare(`
      SELECT sequence, event_id, task_id, run_id, operation_id, type, occurred_at, source_json, payload_json, durability
      FROM kernel_events
      ${where.sql}
    `).all(...(where.values as Array<string | number | null>)) as EventRow[];
    const mapped = rows.map((row) => mapRow(row)).filter((event): event is StoredKernelEvent => event !== null);
    if (mapped.length !== rows.length) {
      console.warn(`[pi-web] ignored ${rows.length - mapped.length} corrupted kernel events for run ${runId}`);
    }
    return mapped;
  }

  readAfter(sequence: number, limit = 100): StoredKernelEvent[] {
    const rows = this.db.prepare(`
      SELECT sequence, event_id, task_id, run_id, operation_id, type, occurred_at, source_json, payload_json, durability
      FROM kernel_events
      WHERE sequence > ?
      ORDER BY sequence ASC
      LIMIT ?
    `).all(sequence, Math.min(Math.max(limit, 1), 500)) as EventRow[];
    const mapped = rows.map((row) => mapRow(row)).filter((event): event is StoredKernelEvent => event !== null);
    if (mapped.length !== rows.length) {
      console.warn(`[pi-web] ignored ${rows.length - mapped.length} corrupted kernel events during readAfter`);
    }
    return mapped;
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
