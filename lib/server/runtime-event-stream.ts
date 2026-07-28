import type { EventJournal } from "@/lib/application/ports/event-journal";
import type { KernelEvent, RuntimeContext, StoredKernelEvent } from "@/lib/kernel";

export type EventCursorResult =
  | { ok: true; cursor: number | undefined }
  | { ok: false; error: string };

export function resolveEventCursor(request: Request): EventCursorResult {
  const url = new URL(request.url);
  const queryCursor = url.searchParams.get("since");
  const rawCursor = queryCursor ?? request.headers.get("last-event-id");
  if (rawCursor === null || rawCursor.trim() === "") {
    return { ok: true, cursor: undefined };
  }
  if (!/^\d+$/.test(rawCursor)) {
    return { ok: false, error: "Invalid event cursor" };
  }
  const cursor = Number(rawCursor);
  if (!Number.isSafeInteger(cursor)) {
    return { ok: false, error: "Invalid event cursor" };
  }
  return { ok: true, cursor };
}

export function encodeKernelEventSse(event: KernelEvent, sequence?: number): string {
  const id = sequence === undefined ? "" : `id: ${sequence}\n`;
  return `${id}data: ${JSON.stringify(event)}\n\n`;
}

export function replayDurableRuntimeEvents(
  journal: EventJournal,
  runtimeContext: RuntimeContext,
  afterSequence: number,
  emit: (entry: StoredKernelEvent) => void,
  batchSize = 500,
): number {
  const limit = Math.min(Math.max(Math.trunc(batchSize), 1), 500);
  let cursor = afterSequence;

  while (true) {
    const batch = journal.getByTask(runtimeContext.taskId, {
      afterSequence: cursor,
      limit,
      runId: runtimeContext.runId,
    });
    if (batch.length === 0) return cursor;

    const previousCursor = cursor;
    for (const entry of batch) {
      emit(entry);
      cursor = entry.sequence;
    }
    if (cursor <= previousCursor) {
      throw new Error("Event journal did not advance the replay cursor");
    }
    if (batch.length < limit) return cursor;
  }
}
