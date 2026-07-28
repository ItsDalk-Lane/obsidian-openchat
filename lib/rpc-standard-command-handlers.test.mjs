import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });

function createContext(overrides = {}) {
  return {
    inner: {},
    runtime: {
      getState: () => ({ isStreaming: false }),
      setThinkingLevel: () => {},
      getTools: () => [],
      setTools: () => {},
    },
    extensionUi: {
      getStatuses: () => [],
      getWidgets: () => [],
      clearDecorations: () => {},
      createContext: () => ({}),
      resolveResponse: () => {},
      handleInput: () => {},
    },
    isPromptRunning: () => false,
    getMcpStatus: () => null,
    waitForExtensionsBound: async () => {},
    setForceEmptySystemPrompt: () => {},
    applyForcedEmptySystemPrompt: () => {},
    ...overrides,
  };
}

test("standard command dispatcher distinguishes null results from unhandled commands", async () => {
  const {
    dispatchStandardCommand,
    STANDARD_COMMAND_NOT_HANDLED,
  } = await jiti.import("./rpc/standard-command-handlers.ts");
  const context = createContext({
    inner: {
      setAutoRetryEnabled: () => {},
    },
  });

  assert.equal(
    await dispatchStandardCommand({ type: "set_auto_retry", enabled: true }, context),
    null,
  );
  assert.equal(
    await dispatchStandardCommand({ type: "prompt", message: "你好" }, context),
    STANDARD_COMMAND_NOT_HANDLED,
  );
});

test("standard command dispatcher assembles state through narrow collaborators", async () => {
  const { dispatchStandardCommand } = await jiti.import("./rpc/standard-command-handlers.ts");
  const context = createContext({
    runtime: {
      getState: (promptRunning) => ({ isStreaming: promptRunning }),
      setThinkingLevel: () => {},
      getTools: () => [],
      setTools: () => {},
    },
    extensionUi: {
      getStatuses: () => [{ key: "sync", text: "同步中" }],
      getWidgets: () => [{ key: "usage", lines: ["一行"], placement: "aboveEditor" }],
    },
    isPromptRunning: () => true,
    getMcpStatus: () => ({ servers: [] }),
  });

  const state = await dispatchStandardCommand({ type: "get_state" }, context);

  assert.deepEqual(state, {
    isStreaming: true,
    messageCount: 0,
    extensionStatuses: [{ key: "sync", text: "同步中" }],
    extensionWidgets: [{ key: "usage", lines: ["一行"], placement: "aboveEditor" }],
    mcpStatus: { servers: [] },
  });
});

test("set tools preserves force-empty and runtime update order", async () => {
  const { dispatchStandardCommand } = await jiti.import("./rpc/standard-command-handlers.ts");
  const calls = [];
  const context = createContext({
    runtime: {
      getState: () => ({}),
      setThinkingLevel: () => {},
      getTools: () => [],
      setTools: (toolNames) => calls.push(["tools", toolNames]),
    },
    setForceEmptySystemPrompt: (force) => calls.push(["force", force]),
    applyForcedEmptySystemPrompt: () => calls.push(["apply"]),
  });

  assert.equal(await dispatchStandardCommand({ type: "set_tools", toolNames: [] }, context), null);
  assert.deepEqual(calls, [
    ["force", true],
    ["tools", []],
    ["apply"],
  ]);
});
