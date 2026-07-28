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

function collectModuleSpecifiers(source) {
  const pattern = /(?:from\s+|import\s*\(\s*)["']([^"']+)["']/g;
  return [...source.matchAll(pattern)].map((match) => match[1]);
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

test("application services keep runtime adapters behind the approved boundary", async () => {
  const servicesDir = path.join(repoRoot, "lib", "application", "services");
  const allowedAdapterImports = new Map([
    [
      path.join(servicesDir, "pi-session-reconciler.ts"),
      new Set(["@/lib/adapters/pi/pi-task-projector"]),
    ],
  ]);
  const files = await walk(servicesDir);

  for (const file of files) {
    const source = await readFile(file, "utf8");
    const allowed = allowedAdapterImports.get(file) ?? new Set();
    const adapterImports = collectModuleSpecifiers(source).filter((specifier) => (
      specifier.includes("/adapters/")
      || specifier.startsWith("./adapters/")
      || specifier.startsWith("../adapters/")
    ));

    for (const specifier of adapterImports) {
      assert.ok(
        allowed.has(specifier),
        `${file} must not import runtime adapter ${specifier}`,
      );
    }
    assert.doesNotMatch(source, /@earendil-works\/pi-/, file);
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

test("shared workspace state stays narrow and is not relayed through component props", async () => {
  const storeSource = await readFile(path.join(repoRoot, "lib", "workspace-store.ts"), "utf8");
  const appShellSource = await readFile(path.join(repoRoot, "components", "AppShell.tsx"), "utf8");
  const sidebarSource = await readFile(path.join(repoRoot, "components", "SessionSidebar.tsx"), "utf8");
  const chatWindowSource = await readFile(path.join(repoRoot, "components", "ChatWindow.tsx"), "utf8");
  const sidebarProps = sidebarSource.match(/interface Props \{[\s\S]*?\n\}/)?.[0] ?? "";
  const chatWindowProps = chatWindowSource.match(/interface Props \{[\s\S]*?\n\}/)?.[0] ?? "";

  for (const field of ["selectedSession", "newSessionCwd", "activeCwd", "activeProjectRoot"]) {
    assert.match(storeSource, new RegExp(`\\b${field}\\b`));
  }
  for (const localField of ["unreadSessionIds", "worktreeState", "modelsConfigOpen", "messages"]) {
    assert.doesNotMatch(storeSource, new RegExp(`\\b${localField}\\b`));
  }

  assert.match(appShellSource, /useWorkspaceStore/);
  assert.match(sidebarSource, /useWorkspaceStore/);
  assert.match(chatWindowSource, /useWorkspaceStore/);
  assert.notEqual(sidebarProps, "");
  assert.notEqual(chatWindowProps, "");
  assert.doesNotMatch(sidebarProps, /selectedSessionId:\s*string\s*\|\s*null/);
  assert.doesNotMatch(sidebarProps, /selectedCwd\??:\s*string/);
  assert.doesNotMatch(sidebarProps, /onCwdChange\??:/);
  assert.doesNotMatch(chatWindowProps, /session:\s*SessionInfo\s*\|\s*null/);
  assert.doesNotMatch(chatWindowProps, /newSessionCwd:\s*string\s*\|\s*null/);
});

test("FileViewer root no longer uses hardcoded if/else type dispatch chain", async () => {
  const source = await readFile(path.join(repoRoot, "components", "FileViewer.tsx"), "utf8");
  assert.doesNotMatch(source, /if\s*\(isImagePath\(filePath\)\)\s*\{/);
  assert.match(source, /FILE_ARTIFACT_RENDERERS/);
});
