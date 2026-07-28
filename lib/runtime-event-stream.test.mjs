import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });

function createEvent(sequence, taskId = "task_current", runId = "run_current") {
  return {
    sequence,
    durability: "durable",
    event: {
      schemaVersion: 1,
      id: `event_${sequence}`,
      type: "operation.completed",
      occurredAt: "2026-07-28T00:00:00.000Z",
      taskId,
      runId,
      operationId: `operation_${sequence}`,
      source: { kind: "runtime", adapter: "pi" },
      payload: { operationKind: "prompt" },
    },
  };
}

test("event cursor prefers since and accepts Last-Event-ID fallback", async () => {
  const { resolveEventCursor } = await jiti.import("./server/runtime-event-stream.ts");

  assert.deepEqual(
    resolveEventCursor(new Request("http://localhost/events?since=12", {
      headers: { "Last-Event-ID": "9" },
    })),
    { ok: true, cursor: 12 },
  );
  assert.deepEqual(
    resolveEventCursor(new Request("http://localhost/events", {
      headers: { "Last-Event-ID": "9" },
    })),
    { ok: true, cursor: 9 },
  );
  assert.deepEqual(
    resolveEventCursor(new Request("http://localhost/events?since=-1")),
    { ok: false, error: "Invalid event cursor" },
  );
});

test("durable replay stays inside the current task and run across batches", async () => {
  const { replayDurableRuntimeEvents } = await jiti.import("./server/runtime-event-stream.ts");
  const entries = [
    createEvent(2),
    createEvent(3, "task_current", "run_other"),
    createEvent(4),
    createEvent(5, "task_other", "run_current"),
    createEvent(6),
  ];
  const journal = {
    getByTask(taskId, filters) {
      return entries
        .filter((entry) =>
          entry.sequence > (filters?.afterSequence ?? 0)
          && entry.event.taskId === taskId
          && (!filters?.runId || entry.event.runId === filters.runId))
        .slice(0, filters?.limit ?? 100);
    },
  };
  const replayed = [];

  const cursor = replayDurableRuntimeEvents(
    journal,
    {
      taskId: "task_current",
      runId: "run_current",
      runtimeKind: "pi",
      nativeRuntimeId: "session_current",
    },
    1,
    (entry) => replayed.push(entry.sequence),
    2,
  );

  assert.deepEqual(replayed, [2, 4, 6]);
  assert.equal(cursor, 6);
});

test("SSE encoding adds ids only when a durable sequence exists", async () => {
  const { encodeKernelEventSse } = await jiti.import("./server/runtime-event-stream.ts");
  const event = createEvent(7).event;

  assert.match(encodeKernelEventSse(event, 7), /^id: 7\ndata: /);
  assert.doesNotMatch(encodeKernelEventSse(event), /^id:/);
});

test("runtime event persistence returns the stored sequence to the live channel", async () => {
  const { EventService } = await jiti.import("./application/services/event-service.ts");
  const stored = createEvent(8);
  const journal = {
    append: () => stored,
  };
  const service = new EventService(journal);

  assert.equal(service.tryAppendRuntimeEvent(stored.event)?.sequence, 8);
  assert.equal(service.tryAppendRuntimeEvent({
    ...stored.event,
    type: "message.updated",
    payload: { message: { role: "assistant" } },
  }), null);
});
