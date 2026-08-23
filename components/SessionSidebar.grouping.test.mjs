import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});
const { ProjectRow } = await jiti.import("./session-sidebar/ProjectRow.tsx");
const { getRecentProjects } = await jiti.import("./SessionSidebar.tsx");
const { I18nProvider } = await jiti.import("@/hooks/useI18n");

function session(id, cwd, modified, projectRoot) {
  return {
    path: `/sessions/${id}.jsonl`,
    id,
    cwd,
    created: modified,
    modified,
    messageCount: 1,
    firstMessage: id,
    projectRoot,
  };
}

function renderProjectGroups(sessions, selectedProject = null) {
  const projects = getRecentProjects(sessions);
  const html = renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      null,
      React.createElement(
        "div",
        { className: "project-groups" },
        projects.map((project) => React.createElement(ProjectRow, {
          key: project,
          project,
          label: project,
          sessionCount: 0,
          selected: project === selectedProject,
          onSelect() {},
          async onDelete() {},
        })),
      ),
    ),
  );
  return { projects, html };
}

test("renders sessions from different project roots as separate project rows", () => {
  const { projects, html } = renderProjectGroups([
    session("alpha", "/repos/alpha", "2026-08-01T10:00:00.000Z", "/repos/alpha"),
    session("beta", "/repos/beta", "2026-08-01T09:00:00.000Z", "/repos/beta"),
  ]);

  assert.deepEqual(projects, ["/repos/alpha", "/repos/beta"]);
  assert.match(html, /title="\/repos\/alpha"/);
  assert.match(html, /title="\/repos\/beta"/);
  assert.equal((html.match(/border-bottom:1px solid var\(--border\)/g) ?? []).length, 2);
});

test("renders worktree sessions grouped under their shared project root", () => {
  const { projects, html } = renderProjectGroups([
    session("main", "/repos/alpha", "2026-08-01T08:00:00.000Z", "/repos/alpha"),
    session("feature", "/repos/alpha-worktrees/feature", "2026-08-01T11:00:00.000Z", "/repos/alpha"),
  ]);

  assert.deepEqual(projects, ["/repos/alpha"]);
  assert.equal((html.match(/title="\/repos\/alpha"/g) ?? []).length, 1);
  assert.doesNotMatch(html, /alpha-worktrees\/feature/);
});

test("sorts by latest activity and marks only the selected project", () => {
  const { projects, html } = renderProjectGroups([
    session("alpha-old", "/repos/alpha", "2026-08-01T08:00:00.000Z", "/repos/alpha"),
    session("beta", "/repos/beta", "2026-08-01T10:00:00.000Z", "/repos/beta"),
    session("alpha-new", "/repos/alpha-worktrees/new", "2026-08-01T12:00:00.000Z", "/repos/alpha"),
  ], "/repos/beta");

  assert.deepEqual(projects, ["/repos/alpha", "/repos/beta"]);
  assert.ok(html.indexOf('title="/repos/alpha"') < html.indexOf('title="/repos/beta"'));
  assert.equal((html.match(/stroke="var\(--accent\)"/g) ?? []).length, 1);
  assert.match(html, /title="\/repos\/beta"[^>]*>[\s\S]*?stroke="var\(--accent\)"/);
});
