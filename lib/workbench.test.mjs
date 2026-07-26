import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { createFileArtifact } = await jiti.import("./artifacts/file-artifact.ts");

test("artifact workbench tab works with file artifact", async () => {
  const artifact = createFileArtifact("/repo/a.ts");
  const tab = {
    id: "file:/repo/a.ts",
    kind: "artifact",
    label: "a.ts",
    artifact,
    sourceSessionId: "sid-1",
  };
  assert.equal(tab.kind, "artifact");
  assert.equal(tab.artifact.representations[0].kind, "file");
});

test("workspace view tab does not require filePath", () => {
  const tab = {
    id: "view:chat",
    kind: "view",
    label: "Chat",
    view: {
      id: "view_chat_1",
      type: "chat",
      title: "Chat",
      closable: false,
      ref: { sessionId: "sid-1" },
    },
  };
  assert.equal(tab.kind, "view");
  assert.equal("filePath" in tab, false);
});
