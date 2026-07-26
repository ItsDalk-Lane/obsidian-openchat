import assert from "node:assert/strict";
import test from "node:test";

const subjectPromise = import("../pi-runtime-adapter.ts");

function createFakeSession() {
  return {
    sessionId: "s1",
    sessionFile: "f1",
    isStreaming: false,
    isCompacting: false,
    isBashRunning: false,
    autoCompactionEnabled: true,
    autoRetryEnabled: false,
    model: { id: "m1", provider: "p1", compat: { thinkingFormat: "deepseek" } },
    getContextUsage: () => ({ percent: 5, contextWindow: 1000, tokens: 50 }),
    pendingMessageCount: 0,
    getSteeringMessages: () => [],
    getFollowUpMessages: () => [],
    agent: { state: { systemPrompt: "sp", thinkingLevel: "high" } },
    setThinkingLevel(level) { this.agent.state.thinkingLevel = level === "xhigh" ? "high" : level; },
    getAllTools: () => [{ name: "bash", description: "run shell" }, { name: "mcp", description: "proxy" }],
    getActiveToolNames: () => ["bash"],
    setActiveToolsByName(names) { this._tools = names; },
  };
}

test("runtime adapter returns stable state shape", async () => {
  const { PiRuntimeAdapter } = await subjectPromise;
  const adapter = new PiRuntimeAdapter(createFakeSession());
  const state = adapter.getState(true);
  assert.equal(state.isPromptRunning, true);
  assert.equal(state.systemPrompt, "sp");
  assert.deepEqual(state.queuedMessages, { steering: [], followUp: [] });
});

test("runtime adapter applies deepseek xhigh compatibility patch", async () => {
  const { PiRuntimeAdapter } = await subjectPromise;
  const session = createFakeSession();
  const adapter = new PiRuntimeAdapter(session);
  adapter.setThinkingLevel("xhigh");
  assert.equal(session.agent.state.thinkingLevel, "xhigh");
});
