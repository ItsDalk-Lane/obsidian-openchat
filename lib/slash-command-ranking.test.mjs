import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { slashMatchRank } = await jiti.import("./slash-command-ranking.ts");

test("ranks exact, prefix, name, description, and missing matches", () => {
  assert.equal(slashMatchRank({ name: "compact", description: "" }, "compact"), 0);
  assert.equal(slashMatchRank({ name: "compact", description: "" }, "com"), 1);
  assert.equal(slashMatchRank({ name: "my-compact", description: "" }, "compact"), 2);
  assert.equal(slashMatchRank({ name: "shrink", description: "Compact context" }, "compact"), 3);
  assert.equal(slashMatchRank({ name: "reload", description: "Refresh resources" }, "compact"), 4);
});

test("matches command metadata case-insensitively", () => {
  assert.equal(slashMatchRank({ name: "Compact", description: "" }, "compact"), 0);
  assert.equal(slashMatchRank({ name: "shrink", description: "Compact Context" }, "compact"), 3);
});
