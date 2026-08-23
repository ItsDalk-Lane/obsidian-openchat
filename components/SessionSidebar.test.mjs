import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("./SessionSidebar.tsx", import.meta.url),
  "utf8",
);
const sessionItemSource = source.slice(source.indexOf("function SessionItem("));

test("only Shift or an open confirmation bypasses session deletion confirmation", () => {
  assert.match(
    sessionItemSource,
    /const handleKeyDown[\s\S]*?if \(e\.shiftKey \|\| confirmDelete\) \{\s*void performDelete\(false\);/,
  );
});

test("registers row-level keyboard deletion with confirmation flow (upstream 47cc7ef)", () => {
  assert.match(sessionItemSource, /const handleKeyDown/);
  assert.match(sessionItemSource, /onKeyDown=\{handleKeyDown\}/);
  assert.match(sessionItemSource, /tabIndex=\{0\}/);
  // Escape cancels an open confirmation; Enter confirms it.
  assert.match(sessionItemSource, /e\.key === "Escape"[\s\S]*?setConfirmDelete\(false\)/);
  assert.match(sessionItemSource, /e\.key === "Enter"[\s\S]*?void performDelete\(false\)/);
});
