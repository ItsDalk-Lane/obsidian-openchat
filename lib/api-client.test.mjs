import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { ApiRequestError, requestJson } = await jiti.import("./api-client.ts");

function stubFetch(t, implementation) {
  const original = globalThis.fetch;
  globalThis.fetch = implementation;
  t.after(() => {
    globalThis.fetch = original;
  });
}

test("serializes JSON input and returns the parsed response", async (t) => {
  let captured;
  stubFetch(t, async (input, init) => {
    captured = { input, init };
    return Response.json({ success: true });
  });

  const result = await requestJson("/api/example", {
    method: "POST",
    json: { name: "pi" },
  });

  assert.deepEqual(result, { success: true });
  assert.equal(captured.input, "/api/example");
  assert.equal(captured.init.method, "POST");
  assert.equal(captured.init.body, '{"name":"pi"}');
  assert.equal(new Headers(captured.init.headers).get("Content-Type"), "application/json");
});

test("preserves an explicitly supplied content type", async (t) => {
  let contentType;
  stubFetch(t, async (_input, init) => {
    contentType = new Headers(init.headers).get("Content-Type");
    return Response.json({ ok: true });
  });

  await requestJson("/api/example", {
    method: "POST",
    headers: { "Content-Type": "application/merge-patch+json" },
    json: { enabled: true },
  });

  assert.equal(contentType, "application/merge-patch+json");
});

test("throws an API error with status and parsed response data", async (t) => {
  stubFetch(t, async () => Response.json(
    { error: "Worktree is dirty", dirty: true },
    { status: 409 },
  ));

  await assert.rejects(
    requestJson("/api/worktrees", { method: "DELETE" }),
    (error) => {
      assert.ok(error instanceof ApiRequestError);
      assert.equal(error.message, "Worktree is dirty");
      assert.equal(error.status, 409);
      assert.deepEqual(error.data, { error: "Worktree is dirty", dirty: true });
      return true;
    },
  );
});

test("treats an error field in a successful response as a failure", async (t) => {
  stubFetch(t, async () => Response.json({ error: "Model unavailable" }));

  await assert.rejects(
    requestJson("/api/models-config/test"),
    (error) => error instanceof ApiRequestError
      && error.status === 200
      && error.message === "Model unavailable",
  );
});

test("accepts an empty successful response", async (t) => {
  stubFetch(t, async () => new Response(null, { status: 204 }));

  assert.equal(await requestJson("/api/example", { method: "DELETE" }), undefined);
});

test("rejects malformed JSON without hiding the HTTP status", async (t) => {
  stubFetch(t, async () => new Response("not-json", { status: 200 }));

  await assert.rejects(
    requestJson("/api/example"),
    (error) => error instanceof ApiRequestError
      && error.status === 200
      && error.data === "not-json",
  );
});
