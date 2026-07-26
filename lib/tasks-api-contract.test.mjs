import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("tasks api routes are read-only projections over sessions", async () => {
  const listRoute = await readFile(new URL("../app/api/tasks/route.ts", import.meta.url), "utf8");
  const detailRoute = await readFile(new URL("../app/api/tasks/[id]/route.ts", import.meta.url), "utf8");

  assert.match(listRoute, /projectPiSessions/);
  assert.match(detailRoute, /projectPiSession/);
  assert.match(listRoute, /listAllSessions/);
  assert.match(detailRoute, /listAllSessions/);

  assert.doesNotMatch(listRoute, /\bPOST\b|\bPATCH\b|\bDELETE\b/);
  assert.doesNotMatch(detailRoute, /\bPOST\b|\bPATCH\b|\bDELETE\b/);
});
