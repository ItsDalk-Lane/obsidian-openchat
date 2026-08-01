import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});
const { TabBar } = await jiti.import("./TabBar.tsx");
const { I18nProvider } = await jiti.import("@/hooks/useI18n.tsx");

const tabs = [
  {
    id: "view:chat",
    kind: "view",
    label: "Chat",
    view: {
      id: "view-chat",
      type: "chat",
      title: "Chat",
      closable: false,
      ref: { sessionId: "session-1" },
    },
  },
  {
    id: "file:/repo/components/AppShell.tsx",
    kind: "artifact",
    label: "AppShell.tsx",
    artifact: {
      id: "artifact-app-shell",
      type: "file",
      title: "AppShell.tsx",
      version: 1,
      status: "ready",
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
      representations: [
        { kind: "file", path: "/repo/components/AppShell.tsx" },
      ],
    },
  },
];

function renderTabs(activeTabId) {
  return renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      null,
      React.createElement(TabBar, {
        tabs,
        activeTabId,
        onSelectTab() {},
        onCloseTab() {},
      }),
    ),
  );
}

function renderedTabBodies(html) {
  return [...html.matchAll(/<div class="pi-tab(?: is-active)?"[^>]*>([\s\S]*?)<\/div>/g)]
    .map((match) => match[0]);
}

test("renders every tab label and its close label", () => {
  const html = renderTabs("view:chat");

  assert.equal(renderedTabBodies(html).length, 2);
  assert.match(html, /class="pi-tab-label"[^>]*>Chat<\/span>/);
  assert.match(html, /class="pi-tab-label"[^>]*>AppShell\.tsx<\/span>/);
  assert.match(html, /aria-label="Close Chat"/);
  assert.match(html, /aria-label="Close AppShell\.tsx"/);
});

test("marks the requested view tab as active", () => {
  const html = renderTabs("view:chat");
  const [chatTab, fileTab] = renderedTabBodies(html);

  assert.equal((html.match(/class="pi-tab is-active"/g) ?? []).length, 1);
  assert.match(chatTab, /^<div class="pi-tab is-active"/);
  assert.match(chatTab, /background:var\(--bg\).*color:var\(--text\)/);
  assert.doesNotMatch(fileTab, /class="pi-tab is-active"/);
});

test("moves the active state to an artifact tab", () => {
  const html = renderTabs("file:/repo/components/AppShell.tsx");
  const [chatTab, fileTab] = renderedTabBodies(html);

  assert.doesNotMatch(chatTab, /class="pi-tab is-active"/);
  assert.match(fileTab, /^<div class="pi-tab is-active"/);
  assert.match(fileTab, /class="pi-tab-label"[^>]*font-weight:500[^>]*title="\/repo\/components\/AppShell\.tsx"[^>]*>AppShell\.tsx<\/span>/);
});
