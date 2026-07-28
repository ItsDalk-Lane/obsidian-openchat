import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { buildSessionTree } = await jiti.import("./session-list-tree.ts");

function session(id, modified, parentSessionId) {
  return {
    path: `/tmp/${id}.jsonl`,
    id,
    cwd: "/tmp/project",
    created: modified,
    modified,
    messageCount: 0,
    firstMessage: id,
    parentSessionId,
  };
}

test("builds parent-child relationships and sorts every level by recency", () => {
  const roots = buildSessionTree([
    session("root-old", "2026-01-01T00:00:00.000Z"),
    session("child-old", "2026-01-02T00:00:00.000Z", "root-old"),
    session("child-new", "2026-01-03T00:00:00.000Z", "root-old"),
    session("root-new", "2026-01-04T00:00:00.000Z"),
  ]);

  assert.deepEqual(roots.map((node) => node.session.id), ["root-new", "root-old"]);
  assert.deepEqual(
    roots[1].children.map((node) => node.session.id),
    ["child-new", "child-old"],
  );
});

test("keeps a session with an unknown parent as a root", () => {
  const roots = buildSessionTree([
    session("orphan", "2026-01-01T00:00:00.000Z", "missing"),
  ]);

  assert.deepEqual(roots.map((node) => node.session.id), ["orphan"]);
});

test("keeps cyclic sessions visible as roots", () => {
  const roots = buildSessionTree([
    session("first", "2026-01-01T00:00:00.000Z", "second"),
    session("second", "2026-01-02T00:00:00.000Z", "first"),
  ]);

  assert.deepEqual(roots.map((node) => node.session.id), ["second", "first"]);
  assert.ok(roots.every((node) => node.children.length === 0));
});
