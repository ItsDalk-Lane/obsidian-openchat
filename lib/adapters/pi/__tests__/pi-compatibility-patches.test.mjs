import assert from "node:assert/strict";
import test from "node:test";

const subjectPromise = import("../compatibility/patches.ts");

function createFakeSession(overrides = {}) {
  return {
    agent: { state: { systemPrompt: "keep", thinkingLevel: "high" } },
    model: { compat: { thinkingFormat: "deepseek" } },
    sessionManager: { flushed: false },
    ...overrides,
  };
}

test("empty-system-prompt patch only applies when enabled", async () => {
  const { applyEmptySystemPromptPatch } = await subjectPromise;
  const session = createFakeSession();
  applyEmptySystemPromptPatch(session, false);
  assert.equal(session.agent.state.systemPrompt, "keep");
  applyEmptySystemPromptPatch(session, true);
  assert.equal(session.agent.state.systemPrompt, "");
});

test("flushed patch is guarded and idempotent", async () => {
  const { applySessionManagerFlushedPatch } = await subjectPromise;
  const session = createFakeSession();
  assert.equal(applySessionManagerFlushedPatch(session), true);
  assert.equal(session.sessionManager.flushed, true);
  assert.equal(applySessionManagerFlushedPatch(session), true);
  assert.equal(session.sessionManager.flushed, true);
});

test("thinking-level patch applies only for deepseek xhigh compatibility", async () => {
  const { applyThinkingLevelPatch } = await subjectPromise;
  const deepseek = createFakeSession();
  applyThinkingLevelPatch(deepseek, "xhigh");
  assert.equal(deepseek.agent.state.thinkingLevel, "xhigh");

  const nonDeepseek = createFakeSession({ model: { compat: { thinkingFormat: "anthropic" } } });
  nonDeepseek.agent.state.thinkingLevel = "high";
  applyThinkingLevelPatch(nonDeepseek, "xhigh");
  assert.equal(nonDeepseek.agent.state.thinkingLevel, "high");
});
