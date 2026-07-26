import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true, jsx: { runtime: "automatic" } });
const { selectArtifactRenderer } = await jiti.import("./artifact-renderer-registry.tsx");
const { createFileArtifact } = await jiti.import("@/lib/artifacts/file-artifact.ts");

test("selects image renderer for image artifact", () => {
  const artifact = createFileArtifact("/repo/a.png");
  const renderer = selectArtifactRenderer(artifact, [
    { id: "text", priority: 100, canRender: () => true, render: () => null },
    { id: "image", priority: 300, canRender: (a) => a.type === "image", render: () => null },
  ]);
  assert.equal(renderer?.id, "image");
});

test("falls back to lower-priority renderer when specific one does not match", () => {
  const artifact = createFileArtifact("/repo/a.unknown");
  const renderer = selectArtifactRenderer(artifact, [
    { id: "text", priority: 100, canRender: () => true, render: () => null },
    { id: "image", priority: 300, canRender: (a) => a.type === "image", render: () => null },
  ]);
  assert.equal(renderer?.id, "text");
});

test("breaks priority ties deterministically by id", () => {
  const artifact = createFileArtifact("/repo/a.md");
  const renderer = selectArtifactRenderer(artifact, [
    { id: "b", priority: 100, canRender: () => true, render: () => null },
    { id: "a", priority: 100, canRender: () => true, render: () => null },
  ]);
  assert.equal(renderer?.id, "a");
});

test("returns null when no renderer matches", () => {
  const artifact = createFileArtifact("/repo/a.md");
  const renderer = selectArtifactRenderer(artifact, [
    { id: "never", priority: 1, canRender: () => false, render: () => null },
  ]);
  assert.equal(renderer, null);
});
