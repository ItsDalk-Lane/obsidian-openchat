import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("workspace switches preserve worktree tabs and clear cross-project tabs", async () => {
  const source = await readFile(
    new URL("../components/AppShell.tsx", import.meta.url),
    "utf8",
  );

  const sameProjectCheck = source.indexOf("if (currentProject === newProject)");
  const clearTabs = source.indexOf("setFileTabs([])");
  assert.ok(sameProjectCheck >= 0);
  assert.ok(clearTabs > sameProjectCheck);
  assert.match(source, /handleWorkspaceChange\(activeCwd, activeProjectRoot, previous\.projectRoot\)/);
});

test("global skill toggles allow the canonical global skills directory", async () => {
  const source = await readFile(
    new URL("../server/api/skills/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /path\.join\(homedir\(\), "\.agents", "skills"\)/);
  assert.match(source, /allowedRoots\.add\(globalSkillsDir\)/);
  assert.match(source, /isApiRequestAllowed\(req\)/);
  assert.match(source, /hasJsonContentType\(req\)/);
});
