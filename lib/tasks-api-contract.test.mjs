import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("tasks api routes use durable services instead of direct Pi projections", async () => {
  const listRoute = await readFile(new URL("../server/api/tasks/route.ts", import.meta.url), "utf8");
  const detailRoute = await readFile(new URL("../server/api/tasks/[id]/route.ts", import.meta.url), "utf8");
  const resolveRoute = await readFile(new URL("../server/api/tasks/resolve/route.ts", import.meta.url), "utf8");

  assert.match(listRoute, /getKernelServices/);
  assert.match(detailRoute, /getKernelServices/);
  assert.match(resolveRoute, /reconcileSession/);

  assert.doesNotMatch(listRoute, /projectPiSessions/);
  assert.doesNotMatch(detailRoute, /projectPiSession/);
  assert.doesNotMatch(resolveRoute, /projectPiSession/);
});
