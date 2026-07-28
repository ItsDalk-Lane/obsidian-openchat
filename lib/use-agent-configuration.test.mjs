import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const {
  pickNewSessionDefaultModel,
  resolveDisplayModel,
} = await jiti.import("../hooks/useAgentConfiguration.ts");

const first = { id: "first", name: "First", provider: "provider-a" };
const configured = { id: "configured", name: "Configured", provider: "provider-b" };

test("uses the configured default model when it exists in the visible model list", () => {
  assert.deepEqual(
    pickNewSessionDefaultModel({
      models: {},
      modelList: [first, configured],
      defaultModel: { provider: "provider-b", modelId: "configured" },
    }),
    { provider: "provider-b", modelId: "configured" },
  );
});

test("falls back to the first visible model when the configured default is unavailable", () => {
  assert.deepEqual(
    pickNewSessionDefaultModel({
      models: {},
      modelList: [first],
      defaultModel: { provider: "missing", modelId: "missing" },
    }),
    { provider: "provider-a", modelId: "first" },
  );
  assert.equal(pickNewSessionDefaultModel({ models: {}, modelList: [] }), null);
});

test("keeps explicit selections ahead of defaults and live session models", () => {
  const newSession = resolveDisplayModel({
    isNew: true,
    newSessionModel: { provider: "chosen", modelId: "chosen" },
    newSessionDefaultModel: { provider: "default", modelId: "default" },
    currentModelOverride: null,
    currentSessionModel: null,
    pendingModel: null,
  });
  const existingSession = resolveDisplayModel({
    isNew: false,
    newSessionModel: null,
    newSessionDefaultModel: null,
    currentModelOverride: { provider: "override", modelId: "override" },
    currentSessionModel: { provider: "session", modelId: "session" },
    pendingModel: { provider: "pending", modelId: "pending" },
  });

  assert.deepEqual(newSession.displayModel, { provider: "chosen", modelId: "chosen" });
  assert.deepEqual(existingSession.currentModel, { provider: "override", modelId: "override" });
  assert.deepEqual(existingSession.displayModel, existingSession.currentModel);
});
