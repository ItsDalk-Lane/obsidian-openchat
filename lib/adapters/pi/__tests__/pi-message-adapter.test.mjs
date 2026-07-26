import assert from "node:assert/strict";
import test from "node:test";

const subjectPromise = import("../pi-message-adapter.ts");

test("normalizes tool call id/name/arguments fields", async () => {
  const { normalizePiMessage } = await subjectPromise;
  const message = {
    role: "assistant",
    content: [
      { type: "text", text: "running tool" },
      { type: "toolCall", id: "tool-1", name: "bash", arguments: { command: "pwd" } },
    ],
    model: "test",
    provider: "test",
  };

  const normalized = normalizePiMessage(message);
  assert.deepEqual(normalized.content[1], {
    type: "toolCall",
    toolCallId: "tool-1",
    toolName: "bash",
    input: { command: "pwd" },
  });
});

test("leaves non-assistant messages untouched", async () => {
  const { normalizePiMessage } = await subjectPromise;
  const message = { role: "user", content: "hello" };
  assert.strictEqual(normalizePiMessage(message), message);
});
