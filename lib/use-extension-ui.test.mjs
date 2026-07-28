import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const {
  extensionUiReducer,
  initialExtensionUiState,
} = await jiti.import("../hooks/useExtensionUi.ts");

test("syncs only snapshot fields supplied by the server", () => {
  const state = {
    ...initialExtensionUiState,
    statuses: [{ key: "old", text: "old" }],
    widgets: [{ key: "keep", lines: ["keep"], placement: "belowEditor" }],
  };

  const next = extensionUiReducer(state, {
    type: "sync_snapshot",
    statuses: [{ key: "new", text: "new" }],
  });

  assert.deepEqual(next.statuses, [{ key: "new", text: "new" }]);
  assert.deepEqual(next.widgets, state.widgets);
});

test("replaces and removes extension statuses by key", () => {
  const withStatus = extensionUiReducer(initialExtensionUiState, {
    type: "set_status",
    key: "build",
    text: "running",
  });
  const replaced = extensionUiReducer(withStatus, {
    type: "set_status",
    key: "build",
    text: "done",
  });
  const removed = extensionUiReducer(replaced, {
    type: "set_status",
    key: "build",
  });

  assert.deepEqual(replaced.statuses, [{ key: "build", text: "done" }]);
  assert.deepEqual(removed.statuses, []);
});

test("updates widgets and closes only the matching custom request", () => {
  const custom = {
    type: "extension_ui_request",
    method: "custom",
    id: "custom-1",
    lines: ["panel"],
  };
  let state = extensionUiReducer(initialExtensionUiState, {
    type: "set_widget",
    key: "progress",
    lines: ["50%"],
    placement: "belowEditor",
  });
  state = extensionUiReducer(state, { type: "set_custom", request: custom });
  state = extensionUiReducer(state, {
    type: "set_custom",
    request: { ...custom, id: "other", closed: true },
  });

  assert.deepEqual(state.widgets, [{
    key: "progress",
    lines: ["50%"],
    placement: "belowEditor",
  }]);
  assert.equal(state.customUi?.id, "custom-1");

  state = extensionUiReducer(state, {
    type: "set_custom",
    request: { ...custom, closed: true },
  });
  assert.equal(state.customUi, null);
});
