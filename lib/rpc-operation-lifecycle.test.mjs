import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });

test("operation lifecycle accepts one terminal transition per active operation", async () => {
  const { OperationLifecycleTracker } = await jiti.import("./rpc/operation-lifecycle.ts");
  const tracker = new OperationLifecycleTracker();

  tracker.begin("prompt", "op_prompt");
  assert.equal(tracker.current("prompt"), "op_prompt");
  assert.equal(tracker.finish("prompt", "op_stale"), false);
  assert.equal(tracker.finish("prompt", "op_prompt"), true);
  assert.equal(tracker.finish("prompt", "op_prompt"), false);
  assert.equal(tracker.current("prompt"), undefined);
});

test("operation lifecycle abort returns only the current operation", async () => {
  const { OperationLifecycleTracker } = await jiti.import("./rpc/operation-lifecycle.ts");
  const tracker = new OperationLifecycleTracker();

  tracker.begin("bash", "op_bash");
  assert.equal(tracker.abort("bash"), "op_bash");
  assert.equal(tracker.abort("bash"), undefined);
  assert.equal(tracker.finish("bash", "op_bash"), false);
});
