import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { createJiti } from "jiti";

const execFileAsync = promisify(execFile);
const jiti = createJiti(import.meta.url, { tsconfigPaths: true });

async function createGitFixture(t) {
  const cwd = await mkdtemp(join(tmpdir(), "pi-web-git-changes-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  await execFileAsync("git", ["init", cwd]);
  await execFileAsync("git", ["-C", cwd, "config", "user.email", "test@example.com"]);
  await execFileAsync("git", ["-C", cwd, "config", "user.name", "Pi Web Test"]);
  return realpath(cwd);
}

async function commitAll(cwd, message) {
  await execFileAsync("git", ["-C", cwd, "add", "."]);
  await execFileAsync("git", ["-C", cwd, "commit", "-m", message]);
}

async function loadSubject() {
  return import("./git-status.ts");
}

test("parses null-delimited Git status entries including renames", async () => {
  const { parseGitPorcelainV1 } = await loadSubject();
  const entries = parseGitPorcelainV1([
    " M components/App.tsx",
    "?? notes.txt",
    "R  src/new-name.ts",
    "src/old-name.ts",
    "",
  ].join("\0"));

  assert.deepEqual(entries, [
    {
      path: "components/App.tsx",
      indexStatus: " ",
      worktreeStatus: "M",
    },
    {
      path: "notes.txt",
      indexStatus: "?",
      worktreeStatus: "?",
    },
    {
      path: "src/new-name.ts",
      originalPath: "src/old-name.ts",
      indexStatus: "R",
      worktreeStatus: " ",
    },
  ]);
});

test("classifies Git status for explorer badges", async () => {
  const { classifyGitStatus } = await loadSubject();
  const classify = (pair) => classifyGitStatus({
    path: "file.ts",
    indexStatus: pair[0],
    worktreeStatus: pair[1],
  });

  assert.deepEqual(classify(" M"), { status: "modified", code: "M" });
  assert.deepEqual(classify("??"), { status: "untracked", code: "U" });
  assert.deepEqual(classify("A "), { status: "added", code: "A" });
  assert.deepEqual(classify("R "), { status: "renamed", code: "R" });
  assert.deepEqual(classify("UU"), { status: "conflict", code: "C" });
  assert.deepEqual(classify(" D"), { status: "deleted", code: "D" });
});

test("git status reports tracked and untracked line totals", async (t) => {
  const cwd = await createGitFixture(t);
  await writeFile(join(cwd, "tracked.txt"), "one\ntwo\n");
  await commitAll(cwd, "initial");

  await writeFile(join(cwd, "tracked.txt"), "one\nchanged\nthree\n");
  await mkdir(join(cwd, "notes"));
  await writeFile(join(cwd, "notes", "new.txt"), "alpha\nbeta\n");

  const { getGitStatus } = await jiti.import("./git-changes.ts");
  const status = await getGitStatus(cwd);

  assert.equal(status.isGitRepository, true);
  assert.equal(status.files.length, 2);
  assert.equal(status.additions, 4);
  assert.equal(status.deletions, 1);
});

test("deleted tracked files still return a readable diff", async (t) => {
  const cwd = await createGitFixture(t);
  const filePath = join(cwd, "removed.txt");
  await writeFile(filePath, "first\nsecond\n");
  await commitAll(cwd, "initial");
  await unlink(filePath);

  const { getGitFileDiff } = await jiti.import("./git-changes.ts");
  const diff = await getGitFileDiff(cwd, filePath);

  assert.equal(diff.supported, true);
  assert.equal(diff.status, "deleted");
  assert.match(diff.patch, /-first/);
  assert.match(diff.patch, /-second/);
});
