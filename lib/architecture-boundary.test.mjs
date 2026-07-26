import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function walk(dir, fileList = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(absolute, fileList);
      continue;
    }
    if (entry.isFile() && (absolute.endsWith(".ts") || absolute.endsWith(".tsx"))) {
      fileList.push(absolute);
    }
  }
  return fileList;
}

test("kernel layer does not import pi/react/next/node-only modules", async () => {
  const kernelDir = path.join(repoRoot, "lib", "kernel");
  const files = await walk(kernelDir);
  for (const file of files) {
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(source, /@earendil-works\/pi-/, file);
    assert.doesNotMatch(source, /from\s+["']react["']/, file);
    assert.doesNotMatch(source, /from\s+["']next\//, file);
    assert.doesNotMatch(source, /from\s+["'](fs|path|node:fs|node:path|crypto|node:crypto|node:sqlite)["']/, file);
  }
});

test("application ports stay free of pi/react/next/sqlite imports", async () => {
  const portsDir = path.join(repoRoot, "lib", "application", "ports");
  const files = await walk(portsDir);
  for (const file of files) {
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(source, /@earendil-works\/pi-/, file);
    assert.doesNotMatch(source, /from\s+["']react["']/, file);
    assert.doesNotMatch(source, /from\s+["']next\//, file);
    assert.doesNotMatch(source, /from\s+["']node:sqlite["']/, file);
  }
});

test("persistence layer stays server-only and does not import React", async () => {
  const persistenceDir = path.join(repoRoot, "lib", "persistence");
  const files = await walk(persistenceDir);
  for (const file of files) {
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(source, /from\s+["']react["']/, file);
  }
});

test("artifact components do not import pi sdk", async () => {
  const artifactDir = path.join(repoRoot, "components", "artifacts");
  const files = await walk(artifactDir);
  for (const file of files) {
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(source, /@earendil-works\/pi-/, file);
  }
});

test("useAgentSession no longer defines untyped AgentEvent", async () => {
  const source = await readFile(path.join(repoRoot, "hooks", "useAgentSession.ts"), "utf8");
  assert.doesNotMatch(source, /interface\s+AgentEvent\s*\{[^}]*type:\s*string/s);
});

test("AppShell no longer projects Pi sessions directly into active tasks", async () => {
  const source = await readFile(path.join(repoRoot, "components", "AppShell.tsx"), "utf8");
  assert.doesNotMatch(source, /projectPiSession\(/);
  assert.match(source, /\/api\/tasks\/resolve/);
});

test("FileViewer root no longer uses hardcoded if/else type dispatch chain", async () => {
  const source = await readFile(path.join(repoRoot, "components", "FileViewer.tsx"), "utf8");
  assert.doesNotMatch(source, /if\s*\(isImagePath\(filePath\)\)\s*\{/);
  assert.match(source, /FILE_ARTIFACT_RENDERERS/);
});
