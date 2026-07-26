import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { createFileArtifact } = await jiti.import("./artifacts/file-artifact.ts");

test("creates stable artifact ids for the same file path", () => {
  const a = createFileArtifact("C:\\Repo\\src\\a.ts");
  const b = createFileArtifact("C:\\Repo\\src\\a.ts");
  assert.equal(a.id, b.id);
});

test("uses different ids for different paths", () => {
  const a = createFileArtifact("/repo/src/a.ts");
  const b = createFileArtifact("/repo/src/b.ts");
  assert.notEqual(a.id, b.id);
});

test("detects image/audio/document/text artifact media types", () => {
  assert.equal(createFileArtifact("/repo/a.PNG").mediaType, "image/png");
  assert.equal(createFileArtifact("/repo/a.Mp3").mediaType, "audio/mpeg");
  assert.equal(createFileArtifact("/repo/a.pdf").mediaType, "application/pdf");
  assert.equal(createFileArtifact("/repo/a.docx").mediaType, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  assert.equal(createFileArtifact("/repo/a.md").mediaType, "text/markdown");
  assert.equal(createFileArtifact("/repo/a.ts").mediaType, "text/typescript");
});

test("keeps source session and cwd metadata", () => {
  const artifact = createFileArtifact("/repo/a.ts", { sourceSessionId: "sid-1", cwd: "/repo" });
  assert.equal(artifact.provenance.sourceSessionId, "sid-1");
  assert.equal(artifact.metadata.cwd, "/repo");
});

test("handles files without extension with fallback type", () => {
  const artifact = createFileArtifact("/repo/Makefile");
  assert.equal(artifact.type, "unknown");
});
