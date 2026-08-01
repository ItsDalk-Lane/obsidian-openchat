import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});
const { ChatWindow } = await jiti.import("./ChatWindow.tsx");
const { I18nProvider } = await jiti.import("@/hooks/useI18n.tsx");
const { useWorkspaceStore } = await jiti.import("@/lib/workspace-store.ts");

// 服务端渲染会读取仓库创建时的快照；把真实快照设成一个零消息的新会话。
Object.assign(useWorkspaceStore.getInitialState(), {
  selectedSession: null,
  newSessionCwd: "/tmp/pi-web-empty-chat",
  activeCwd: "/tmp/pi-web-empty-chat",
  activeProjectRoot: "/tmp/pi-web-empty-chat",
});

function renderEmptyChat(props = {}) {
  return renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      null,
      React.createElement(ChatWindow, props),
    ),
  );
}

test("renders the real empty new-session shell", () => {
  const html = renderEmptyChat();

  assert.match(html, /class="pi-chat-empty [^"]*"/);
  assert.match(html, />π<\/span><span[^>]*>Pi Web<\/span>/);
  assert.doesNotMatch(html, /class="pi-chat-scroll /);
});

test("renders an enabled empty-state composer", () => {
  const html = renderEmptyChat();

  assert.match(html, /<textarea class="pi-chat-textarea"[^>]*placeholder="Message… Type \/ for commands, @ for files"/);
  assert.match(html, /<button class="pi-send-button" disabled=""/);
  assert.match(html, /<input type="file" accept="image\/\*" multiple=""/);
});

test("keeps task and run identity on the empty chat window", () => {
  const html = renderEmptyChat({
    task: { id: "task-empty-state" },
    run: { id: "run-empty-state" },
  });

  assert.match(html, /^<div data-task-id="task-empty-state" data-run-id="run-empty-state" class="pi-chat-window /);
  assert.match(html, />web <span[^>]*>v0\.0\.0<\/span><\/span>/);
  assert.match(html, />pi <span[^>]*>v0\.0\.0<\/span><\/span>/);
});
