import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("quick changes opens files in diff mode and shows line totals", async () => {
  const explorerSource = await readFile(
    new URL("../components/FileExplorer.tsx", import.meta.url),
    "utf8",
  );
  const appShellSource = await readFile(
    new URL("../components/AppShell.tsx", import.meta.url),
    "utf8",
  );

  assert.match(explorerSource, /modeHint: "diff"/);
  assert.match(explorerSource, /gitLineStats\.additions/);
  assert.match(explorerSource, /gitLineStats\.deletions/);
  assert.match(appShellSource, /initialDisplayMode=\{activeFileTab\.initialDisplayMode\}/);
});

test("deleted files stay in diff-only mode without download or live watching", async () => {
  const viewerSource = await readFile(
    new URL("../components/FileViewer.tsx", import.meta.url),
    "utf8",
  );
  const routeSource = await readFile(
    new URL("../app/api/git/diff/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(viewerSource, /isDeletedDiff \? "diff" : displayMode/);
  assert.match(viewerSource, /!isDeletedDiff && \(/);
  assert.doesNotMatch(
    routeSource,
    /isExistingFilePathAllowed\(filePath, allowedRoots\)/,
  );
});
