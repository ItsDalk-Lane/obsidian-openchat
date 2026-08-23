"use client";

import { create } from "zustand";
import type { SessionInfo } from "./types";

type StateUpdate<T> = T | ((current: T) => T);

type WorkspaceState = {
  selectedSession: SessionInfo | null;
  newSessionCwd: string | null;
  activeCwd: string | null;
  activeProjectRoot: string | null;
  /** Stable server-computed project identity for the active cwd. */
  activeProjectKey: string | null;
};

type WorkspaceActions = {
  setSelectedSession: (update: StateUpdate<SessionInfo | null>) => void;
  setNewSessionCwd: (update: StateUpdate<string | null>) => void;
  setActiveWorkspace: (
    cwd: string | null,
    projectRoot?: string | null,
    projectKey?: string | null,
  ) => void;
  selectSession: (session: SessionInfo) => void;
  startNewSession: (cwd: string, projectRoot?: string | null, projectKey?: string | null) => void;
  resetWorkspace: () => void;
};

export type WorkspaceStore = WorkspaceState & WorkspaceActions;

export const initialWorkspaceState: WorkspaceState = {
  selectedSession: null,
  newSessionCwd: null,
  activeCwd: null,
  activeProjectRoot: null,
  activeProjectKey: null,
};

function resolveUpdate<T>(update: StateUpdate<T>, current: T): T {
  return typeof update === "function"
    ? (update as (value: T) => T)(current)
    : update;
}

export const useWorkspaceStore = create<WorkspaceStore>()((set) => ({
  ...initialWorkspaceState,
  setSelectedSession: (update) => {
    set((state) => ({ selectedSession: resolveUpdate(update, state.selectedSession) }));
  },
  setNewSessionCwd: (update) => {
    set((state) => ({ newSessionCwd: resolveUpdate(update, state.newSessionCwd) }));
  },
  setActiveWorkspace: (cwd, projectRoot, projectKey) => {
    set({
      activeCwd: cwd,
      activeProjectRoot: cwd ? (projectRoot ?? cwd) : null,
      activeProjectKey: cwd ? (projectKey ?? projectRoot ?? cwd) : null,
    });
  },
  selectSession: (session) => {
    set({
      selectedSession: session,
      newSessionCwd: null,
      activeCwd: session.cwd || null,
      activeProjectRoot: session.projectRoot ?? session.cwd ?? null,
      activeProjectKey: session.projectKey ?? session.projectRoot ?? session.cwd ?? null,
    });
  },
  startNewSession: (cwd, projectRoot, projectKey) => {
    set({
      selectedSession: null,
      newSessionCwd: cwd,
      activeCwd: cwd,
      activeProjectRoot: projectRoot ?? cwd,
      activeProjectKey: projectKey ?? projectRoot ?? cwd,
    });
  },
  resetWorkspace: () => set(initialWorkspaceState),
}));
