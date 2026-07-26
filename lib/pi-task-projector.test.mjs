import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { projectPiSession, getPiTaskId, getPiRunId } = await jiti.import("./adapters/pi/pi-task-projector.ts");

function baseSession(overrides = {}) {
  return {
    path: "/tmp/s1.jsonl",
    id: "session-a",
    cwd: "/repo",
    created: "2026-01-01T00:00:00.000Z",
    modified: "2026-01-01T00:00:00.000Z",
    messageCount: 1,
    firstMessage: "hello",
    ...overrides,
  };
}

test("projects session to stable task and run ids", () => {
  const a = projectPiSession(baseSession());
  const b = projectPiSession(baseSession());
  assert.equal(a.task.id, b.task.id);
  assert.equal(a.run.id, b.run.id);
  assert.equal(a.run.taskId, a.task.id);
  assert.equal(a.run.nativeRuntimeId, "session-a");
});

test("projects fork parent task id from parent session id", () => {
  const projection = projectPiSession(baseSession({ id: "child", parentSessionId: "parent" }));
  assert.equal(projection.task.parentTaskId, getPiTaskId("parent"));
});

test("uses title fallback order name -> firstMessage -> default", () => {
  const named = projectPiSession(baseSession({ name: "Named Session", firstMessage: "ignored" }));
  assert.equal(named.task.title, "Named Session");
  const firstMessage = projectPiSession(baseSession({ name: undefined, firstMessage: "First prompt" }));
  assert.equal(firstMessage.task.title, "First prompt");
  const fallback = projectPiSession(baseSession({ name: undefined, firstMessage: "(no messages)", id: "abcdefff1122" }));
  assert.equal(fallback.task.title, "Session abcdefff");
});

test("marks running sessions as active/running", () => {
  const running = new Set(["session-a"]);
  const projection = projectPiSession(baseSession(), running);
  assert.equal(projection.task.status, "active");
  assert.equal(projection.run.status, "running");
});

test("keeps run id stable helper", () => {
  assert.equal(getPiRunId("abc"), getPiRunId("abc"));
  assert.notEqual(getPiRunId("abc"), getPiRunId("def"));
});
