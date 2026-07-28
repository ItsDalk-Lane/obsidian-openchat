import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { initialWorkspaceState, useWorkspaceStore } = await jiti.import("./workspace-store.ts");

test.beforeEach(() => {
  useWorkspaceStore.setState(initialWorkspaceState);
});

test("selecting a session updates the shared workspace atomically", () => {
  const session = {
    id: "session_1",
    path: "/tmp/session.jsonl",
    cwd: "/repo/worktree",
    projectRoot: "/repo",
    created: "2026-07-28T00:00:00.000Z",
    modified: "2026-07-28T00:00:00.000Z",
    messageCount: 1,
    firstMessage: "hello",
  };

  useWorkspaceStore.getState().selectSession(session);

  const state = useWorkspaceStore.getState();
  assert.equal(state.selectedSession, session);
  assert.equal(state.newSessionCwd, null);
  assert.equal(state.activeCwd, "/repo/worktree");
  assert.equal(state.activeProjectRoot, "/repo");
});

test("starting a new session clears the old session and keeps the project boundary", () => {
  useWorkspaceStore.setState({
    selectedSession: {
      id: "old",
      path: "",
      cwd: "/old",
      created: "",
      modified: "",
      messageCount: 0,
      firstMessage: "",
    },
  });

  useWorkspaceStore.getState().startNewSession("/repo/worktree", "/repo");

  const state = useWorkspaceStore.getState();
  assert.equal(state.selectedSession, null);
  assert.equal(state.newSessionCwd, "/repo/worktree");
  assert.equal(state.activeCwd, "/repo/worktree");
  assert.equal(state.activeProjectRoot, "/repo");
});

test("workspace setters support focused updates without replacing unrelated state", () => {
  useWorkspaceStore.getState().setNewSessionCwd("/repo");
  useWorkspaceStore.getState().setSelectedSession(null);
  useWorkspaceStore.getState().setNewSessionCwd((cwd) => `${cwd}/child`);
  useWorkspaceStore.getState().setActiveWorkspace(null);

  const state = useWorkspaceStore.getState();
  assert.equal(state.newSessionCwd, "/repo/child");
  assert.equal(state.activeCwd, null);
  assert.equal(state.activeProjectRoot, null);
});
