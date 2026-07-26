import assert from "node:assert/strict";
import test from "node:test";

const subjectPromise = import("../pi-extension-adapter.ts");

test("extension adapter keeps requested coding tools and appends extension tools", async () => {
  const { withExtensionTools } = await subjectPromise;
  const merged = withExtensionTools(
    {
      getAllTools: () => [
        { name: "read", description: "" },
        { name: "bash", description: "" },
        { name: "mcp", description: "" },
        { name: "custom", description: "" },
      ],
    },
    ["read", "bash"],
  );
  assert.deepEqual(merged, ["read", "bash", "mcp", "custom"]);
});
