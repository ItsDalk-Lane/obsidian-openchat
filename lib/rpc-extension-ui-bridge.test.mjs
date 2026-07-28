import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });

test("extension UI bridge owns decorations and emits kernel events", async () => {
  const { ExtensionUiBridge } = await jiti.import("./rpc/extension-ui-bridge.ts");
  const emitted = [];
  const bridge = new ExtensionUiBridge({
    inner: {},
    runtimeContext: {
      taskId: "task_test",
      runId: "run_test",
      runtimeKind: "pi",
      nativeRuntimeId: "session_test",
    },
    getOperationId: () => "operation_test",
    emit: (event) => emitted.push(event),
    applyForcedEmptySystemPrompt: () => {},
  });

  const context = bridge.createContext();
  context.setStatus("sync", "正在同步");
  context.setWidget("usage", ["一行"], { placement: "belowEditor" });
  context.notify("已连接", "info");

  assert.deepEqual(bridge.getStatuses(), [{ key: "sync", text: "正在同步" }]);
  assert.deepEqual(bridge.getWidgets(), [{
    key: "usage",
    lines: ["一行"],
    placement: "belowEditor",
  }]);
  assert.deepEqual(emitted.map((event) => event.type), [
    "extension.ui.requested",
    "extension.ui.requested",
    "extension.ui.requested",
  ]);
  assert.equal(emitted[0].operationId, "operation_test");

  bridge.clearDecorations();
  assert.deepEqual(bridge.getStatuses(), []);
  assert.deepEqual(bridge.getWidgets(), []);
});

test("extension UI bridge resolves a pending confirmation once", async () => {
  const { ExtensionUiBridge } = await jiti.import("./rpc/extension-ui-bridge.ts");
  const emitted = [];
  const bridge = new ExtensionUiBridge({
    inner: {},
    runtimeContext: {
      taskId: "task_test",
      runId: "run_test",
      runtimeKind: "pi",
      nativeRuntimeId: "session_test",
    },
    getOperationId: () => undefined,
    emit: (event) => emitted.push(event),
    applyForcedEmptySystemPrompt: () => {},
  });

  const confirmation = bridge.createContext().confirm("确认", "继续吗");
  const request = emitted[0].payload.request;
  bridge.resolveResponse({
    type: "extension_ui_response",
    id: request.id,
    confirmed: true,
  });

  assert.equal(await confirmation, true);
  const replayed = [];
  bridge.replayPendingRequests((event) => replayed.push(event));
  assert.deepEqual(replayed, []);
});
