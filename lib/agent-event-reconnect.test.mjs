import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("agent event stream subscribes before replay and forwards durable ids", async () => {
  const source = await readFile(
    new URL("../app/api/agent/[id]/events/route.ts", import.meta.url),
    "utf8",
  );
  const streamSource = source.slice(source.indexOf("const stream = new ReadableStream"));

  assert.ok(streamSource.indexOf("session.onEvent") < streamSource.indexOf("replayDurableRuntimeEvents"));
  assert.match(streamSource, /encode\(entry\.event,\s*entry\.sequence\)/);
  assert.match(streamSource, /journal\.getLatestSequence\(\)/);
});

test("agent hook records SSE ids, uses since on manual reconnect, and keeps polling", async () => {
  const source = await readFile(
    new URL("../hooks/useAgentSession.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /eventCursorRef/);
  assert.match(source, /\?since=\$\{cursor\}/);
  assert.match(source, /e\.lastEventId/);
  assert.match(source, /AGENT_STATE_RECONCILE_MS\s*=\s*15_000/);
  assert.match(source, /visibilitychange/);
});
