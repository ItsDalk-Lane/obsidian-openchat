import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { hasDeepseekCompat, setDeepseekCompat } = await jiti.import("./model-config.ts");

test("enables DeepSeek compatibility without dropping other settings", () => {
  const source = { id: "model", compat: { tokenizer: "custom" } };
  const updated = setDeepseekCompat(source, true);

  assert.deepEqual(updated, {
    id: "model",
    compat: {
      tokenizer: "custom",
      thinkingFormat: "deepseek",
      requiresReasoningContentOnAssistantMessages: true,
    },
  });
  assert.equal(hasDeepseekCompat(updated), true);
  assert.deepEqual(source, { id: "model", compat: { tokenizer: "custom" } });
});

test("disables only the DeepSeek compatibility settings", () => {
  const updated = setDeepseekCompat({
    id: "model",
    compat: {
      tokenizer: "custom",
      thinkingFormat: "deepseek",
      requiresReasoningContentOnAssistantMessages: true,
    },
  }, false);

  assert.deepEqual(updated, { id: "model", compat: { tokenizer: "custom" } });
  assert.equal(hasDeepseekCompat(updated), false);
});

test("removes an empty compat object and preserves an untouched model", () => {
  const enabled = {
    id: "model",
    compat: {
      thinkingFormat: "deepseek",
      requiresReasoningContentOnAssistantMessages: true,
    },
  };
  assert.deepEqual(setDeepseekCompat(enabled, false), { id: "model", compat: undefined });

  const plain = { id: "plain" };
  assert.equal(setDeepseekCompat(plain, false), plain);
});
