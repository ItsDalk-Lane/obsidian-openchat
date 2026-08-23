import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});
const { MessageView } = await jiti.import("./MessageView.tsx");
const { I18nProvider } = await jiti.import("@/hooks/useI18n");

function renderMessage(message, props = {}) {
  return renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      null,
      React.createElement(MessageView, { message, ...props }),
    ),
  );
}

test("renders a user message as a user bubble", () => {
  const html = renderMessage({
    role: "user",
    content: "User role fixture with **bold text**",
  });

  assert.match(html, /class="pi-user-message"/);
  assert.match(html, /class="pi-user-message-bubble"/);
  assert.match(html, /User role fixture with <strong>bold text<\/strong>/);
  assert.doesNotMatch(html, /class="pi-assistant-message"/);
});

test("renders assistant text with its model label", () => {
  const html = renderMessage({
    role: "assistant",
    provider: "fixture-provider",
    model: "fixture-model",
    content: [{ type: "text", text: "Assistant role fixture" }],
  });

  assert.match(html, /class="pi-assistant-message"/);
  assert.match(html, />fixture-model<\/span>/);
  assert.match(html, /Assistant role fixture/);
  assert.doesNotMatch(html, /class="pi-user-message-bubble"/);
});

test("renders a paired tool result through its assistant tool call", () => {
  const toolResult = {
    role: "toolResult",
    toolCallId: "fixture-call",
    toolName: "fixture_lookup",
    content: [{ type: "text", text: "Fixture tool failure" }],
    isError: true,
  };
  const standaloneHtml = renderMessage(toolResult);
  const html = renderMessage(
    {
      role: "assistant",
      provider: "fixture-provider",
      model: "fixture-model",
      content: [{
        type: "toolCall",
        toolCallId: "fixture-call",
        toolName: "fixture_lookup",
        input: { query: "tool result fixture query" },
      }],
    },
    { toolResults: new Map([["fixture-call", toolResult]]) },
  );

  assert.equal(standaloneHtml, "");
  assert.match(html, /class="pi-tool-card"/);
  assert.match(html, />fixture_lookup<\/span>/);
  assert.match(html, /tool result fixture query/);
  assert.match(html, /border:1px solid color-mix\(in srgb, var\(--danger\) 45%, transparent\)/);
});
