import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { toKernelEventFromPiEvent } = await jiti.import("../pi-event-adapter.ts");
const { getPiTaskId, getPiRunId } = await jiti.import("../pi-task-projector.ts");

const taskId = getPiTaskId("session-1");
const runId = getPiRunId("session-1");

test("maps legacy compaction start to kernel compaction.started", () => {
  const event = toKernelEventFromPiEvent({ type: "auto_compaction_start" }, { taskId, runId });
  assert.equal(event.type, "compaction.started");
  assert.equal(event.source.nativeType, "compaction_start");
});

test("maps modern compaction end to kernel compaction.completed", () => {
  const event = toKernelEventFromPiEvent({ type: "compaction_end", aborted: false, reason: "auto" }, { taskId, runId });
  assert.equal(event.type, "compaction.completed");
  assert.equal(event.payload.reason, "auto");
});

test("maps unknown events to native diagnostic", () => {
  const event = toKernelEventFromPiEvent({ type: "something_new" }, { taskId, runId });
  assert.equal(event.type, "native.diagnostic");
  assert.equal(event.payload.nativeType, "something_new");
});
