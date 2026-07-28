import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});
const {
  ExtensionStatusBar,
  formatExtensionStatusLine,
  sanitizeExtensionStatusText,
} = await jiti.import("./ExtensionStatusBar.tsx");

test("sorts extension status text by hidden key", () => {
  const statuses = [
    { key: "20-memory", text: "memory" },
    { key: "90-notify", text: "notify" },
    { key: "10-permissions", text: "permissions" },
    { key: "05-ponytail", text: "ponytail" },
  ];

  assert.equal(
    formatExtensionStatusLine(statuses),
    "ponytail permissions memory notify",
  );
});

test("sanitizes extension status text for one line", () => {
  assert.equal(
    sanitizeExtensionStatusText("  first\tsecond \r\n third  "),
    "first second third",
  );
});

test("renders a pinned status line without identifier keys", () => {
  const html = renderToStaticMarkup(
    React.createElement(ExtensionStatusBar, {
      statuses: [
        { key: "20-memory", text: "\x1b[32mmemory\x1b[0m" },
        { key: "05-ponytail", text: "ponytail" },
      ],
    }),
  );

  assert.match(html, /aria-label="ponytail memory"/);
  assert.match(html, /height:36px/);
  assert.match(html, /border-top:1px solid var\(--border\)/);
  assert.match(html, /background:var\(--bg-panel\)/);
  assert.doesNotMatch(html, /05-ponytail|20-memory/);
});
