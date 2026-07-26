import assert from "node:assert/strict";
import test from "node:test";

const subjectPromise = import("../pi-event-adapter.ts");

test("normalizes legacy and modern compaction start events", async () => {
  const { normalizePiEvent } = await subjectPromise;
  assert.equal(normalizePiEvent({ type: "auto_compaction_start" }).type, "compaction_start");
  assert.equal(normalizePiEvent({ type: "compaction_start" }).type, "compaction_start");
});

test("normalizes legacy and modern compaction end events", async () => {
  const { normalizePiEvent } = await subjectPromise;
  assert.equal(normalizePiEvent({ type: "auto_compaction_end" }).type, "compaction_end");
  assert.equal(normalizePiEvent({ type: "compaction_end" }).type, "compaction_end");
});

test("keeps unrelated event types unchanged", async () => {
  const { normalizePiEvent } = await subjectPromise;
  const event = { type: "message_update", chunk: "ok" };
  assert.deepEqual(normalizePiEvent(event), event);
});
