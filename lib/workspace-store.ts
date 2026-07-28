"use client";

import { create } from "zustand";
import type { SessionInfo } from "./types";

type StateUpdate<T> = T | ((current: T) => T);

type WorkspaceState = {
  selectedSession: SessionInfo | null;
  newSessionCwd: string | null;
  activeCwd: string | null;
  activeProjectRoot: string | null;
};

type WorkspaceActions = {
  setSelectedSession: (update: StateUpdate<SessionInfo | null>) => void;
  setNewSessionCwd: (update: StateUpdate<string | null>) => void;
  setActiveWorkspace: (cwd: string | null, projectRoot?: string | null) => void;
  selectSession: (session: SessionInfo) => void;
  startNewSession: (cwd: string, projectRoot?: string | null) => void;
  resetWorkspace: () => void;
};

export type WorkspaceStore = WorkspaceState & WorkspaceActions;

export const initialWorkspaceState: WorkspaceState = {
  selectedSession: null,
  newSessionCwd: null,
  activeCwd: null,
  activeProjectRoot: null,
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
  setActiveWorkspace: (cwd, projectRoot) => {
    set({
      activeCwd: cwd,
      activeProjectRoot: cwd ? (projectRoot ?? cwd) : null,
    });
  },
  selectSession: (session) => {
    set({
      selectedSession: session,
      newSessionCwd: null,
      activeCwd: session.cwd || null,
      activeProjectRoot: session.projectRoot ?? session.cwd ?? null,
    });
  },
  startNewSession: (cwd, projectRoot) => {
    set({
      selectedSession: null,
      newSessionCwd: cwd,
      activeCwd: cwd,
      activeProjectRoot: projectRoot ?? cwd,
    });
  },
  resetWorkspace: () => set(initialWorkspaceState),
}));
