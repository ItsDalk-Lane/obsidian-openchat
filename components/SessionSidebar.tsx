"use client";

import { useEffect, useLayoutEffect, useMemo, useState, useCallback, useRef } from "react";
import type { SessionInfo } from "@/lib/types";
import { requestJson } from "@/lib/api-client";
import type {
  CwdValidateResponse,
  DefaultCwdResponse,
  DeleteSessionsResponse,
  HomeResponse,
  SessionsResponse,
  WorktreesResponse,
} from "@/lib/api-types";
import { buildSessionTree, type SessionListTreeNode } from "@/lib/session-list-tree";
import { pickNativeDirectory } from "@/lib/native-directory-picker";
import {
  FileExplorer,
  type FileExplorerHandle,
  type OpenFileOptions,
} from "./FileExplorer";
import {
  AnimatedDropdown,
  displayCwd,
  PathLabel,
} from "./session-sidebar/SidebarPrimitives";
import {
  WorktreeSwitcher,
  type WorktreeState,
} from "./session-sidebar/WorktreeSwitcher";
import { DeleteSessionDialog } from "./session-sidebar/DeleteSessionDialog";
import { ProjectRow } from "./session-sidebar/ProjectRow";
import { useWorkspaceStore } from "@/lib/workspace-store";
import { useI18n } from "@/hooks/useI18n";
import { formatRelativeTime as formatLocaleRelativeTime } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/types";

interface Props {
  onSelectSession: (session: SessionInfo, isRestore?: boolean) => void;
  onNewSession?: (sessionId: string, cwd: string) => void;
  initialSessionId?: string | null;
  skipInitialProjectSelection?: boolean;
  onInitialRestoreDone?: () => void;
  refreshKey?: number;
  onSessionDeleted?: (sessionId: string, deletedIds?: string[]) => void;
  onProjectDeleted?: (projectRoot: string, deletedIds: string[]) => void;
  onOpenFile?: (
    filePath: string,
    fileName: string,
    options?: OpenFileOptions,
  ) => void;
  explorerRefreshKey?: number;
  onExplorerRefresh?: () => void;
  onAtMention?: (relativePath: string, isDir: boolean) => void;
  onAtMentions?: (relativePaths: string[]) => void;
}

const UNREAD_SESSIONS_STORAGE_KEY = "pi-web:unread-session-ids";

function loadUnreadSessionIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(UNREAD_SESSIONS_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return new Set(parsed.filter((id): id is string => typeof id === "string"));
    return new Set();
  } catch {
    return new Set();
  }
}

function saveUnreadSessionIds(ids: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    if (ids.size === 0) window.localStorage.removeItem(UNREAD_SESSIONS_STORAGE_KEY);
    else window.localStorage.setItem(UNREAD_SESSIONS_STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // ignore storage quota / privacy-mode errors
  }
}

function formatRelativeTime(dateStr: string, locale: Locale): string {
  return formatLocaleRelativeTime(dateStr, locale);
}

/**
 * Return all projects (deduped by projectRoot so worktrees collapse into their
 * main repo) sorted by most recent session activity.
 */
export function getRecentProjects(sessions: SessionInfo[]): string[] {
  const latestByRoot = new Map<string, string>(); // projectRoot -> most recent modified
  for (const s of sessions) {
    const root = s.projectRoot ?? s.cwd;
    if (!root) continue;
    const prev = latestByRoot.get(root);
    if (!prev || s.modified > prev) {
      latestByRoot.set(root, s.modified);
    }
  }
  return [...latestByRoot.entries()]
    .sort((a, b) => b[1].localeCompare(a[1]))
    .map(([root]) => root);
}

const SCRAMBLE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";

function useScramble(target: string, running: boolean): string {
  const [display, setDisplay] = useState(target);
  const frameRef = useRef<number | null>(null);
  const iterRef = useRef(0);

  useEffect(() => {
    if (!running) {
      setDisplay(target);
      return;
    }
    iterRef.current = 0;
    const totalFrames = target.length * 4;

    const step = () => {
      iterRef.current += 1;
      const progress = iterRef.current / totalFrames;
      const resolved = Math.floor(progress * target.length);

      setDisplay(
        target
          .split("")
          .map((char, i) => {
            if (char === " ") return " ";
            if (i < resolved) return char;
            return SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
          })
          .join("")
      );

      if (iterRef.current < totalFrames) {
        frameRef.current = requestAnimationFrame(step);
      } else {
        setDisplay(target);
      }
    };

    frameRef.current = requestAnimationFrame(step);
    return () => { if (frameRef.current) cancelAnimationFrame(frameRef.current); };
  }, [target, running]);

  return display;
}

function PiWebTitle() {
  const [showVersion, setShowVersion] = useState(false);
  const [scrambling, setScrambling] = useState(false);
  const revertTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const target = showVersion ? `${import.meta.env.VITE_APP_VERSION ?? "0.0.0"}p${import.meta.env.VITE_PI_VERSION ?? "0.0.0"}` : "Pi Web";
  const display = useScramble(target, scrambling);

  const triggerScramble = useCallback((toVersion: boolean) => {
    setShowVersion(toVersion);
    setScrambling(true);
    setTimeout(() => setScrambling(false), (toVersion ? 6 : 8) * 4 * (1000 / 60) + 100);
  }, []);

  const handleClick = useCallback(() => {
    if (revertTimerRef.current) clearTimeout(revertTimerRef.current);

    const next = !showVersion;
    triggerScramble(next);

    if (next) {
      revertTimerRef.current = setTimeout(() => triggerScramble(false), 3000);
    }
  }, [showVersion, triggerScramble]);

  useEffect(() => () => { if (revertTimerRef.current) clearTimeout(revertTimerRef.current); }, []);

  return (
    <button
      className="pi-sidebar-brand"
      onClick={handleClick}
      style={{
        background: "none", border: "none", padding: 0, cursor: "default",
        fontWeight: 700, fontSize: 15, letterSpacing: "-0.01em",
        color: showVersion ? "var(--accent)" : "var(--text)",
        fontFamily: "var(--font-mono)",
        minWidth: "6ch",
      }}
    >
      {display}
    </button>
  );
}

export function SessionSidebar({ onSelectSession, onNewSession, initialSessionId, skipInitialProjectSelection, onInitialRestoreDone, refreshKey, onSessionDeleted, onProjectDeleted, onOpenFile, explorerRefreshKey, onExplorerRefresh, onAtMention, onAtMentions }: Props) {
  const { t } = useI18n();
  const selectedSessionId = useWorkspaceStore((state) => state.selectedSession?.id ?? null);
  const selectedCwd = useWorkspaceStore((state) => state.activeCwd);
  const setActiveWorkspace = useWorkspaceStore((state) => state.setActiveWorkspace);
  const [allSessions, setAllSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [homeDir, setHomeDir] = useState<string>("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [projectFilter, setProjectFilter] = useState("");
  const [customPathError, setCustomPathError] = useState<string | null>(null);
  const [customPathValidating, setCustomPathValidating] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [worktreeState, setWorktreeState] = useState<WorktreeState | null>(null);
  const [worktreeLoadingCwd, setWorktreeLoadingCwd] = useState<string | null>(null);
  const [explorerOpen, setExplorerOpen] = useState(true);
  const [explorerKey, setExplorerKey] = useState(0);
  const [explorerUploadBusy, setExplorerUploadBusy] = useState(false);
  const [changesCount, setChangesCount] = useState(0);
  const [changesCollapsed, setChangesCollapsed] = useState(true);
  const [sessionRefreshDone, setSessionRefreshDone] = useState(false);
  const [explorerRefreshDone, setExplorerRefreshDone] = useState(false);
  const [runningSessionIds, setRunningSessionIds] = useState<Set<string>>(() => new Set());
  const [unreadSessionIds, setUnreadSessionIds] = useState<Set<string>>(() => loadUnreadSessionIds());
  const previousRunningSessionIdsRef = useRef<Set<string>>(new Set());
  // Latest known session ids, mirrored into a ref so the running-sessions
  // effect can detect unknown ids without depending on allSessions.
  const allSessionIdsRef = useRef<Set<string>>(new Set());
  // Once the SSE stream has delivered a frame it is the source of truth for
  // running state; late /api/sessions responses must not overwrite it.
  const sseAuthoritativeRef = useRef(false);
  const sessionRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const explorerRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileExplorerRef = useRef<FileExplorerHandle>(null);

  const loadSessions = useCallback(async (showLoading = false) => {
    try {
      if (showLoading) setLoading(true);
      const data = await requestJson<SessionsResponse>("/api/sessions");
      setAllSessions(data.sessions);
      // Treat the fetched running set as an initial fallback only. Once SSE is
      // live it owns this state, so a slow fetch can't revive a stale snapshot.
      if (!sseAuthoritativeRef.current) {
        setRunningSessionIds(new Set(data.runningSessionIds ?? []));
      }
      // Drop unread markers for sessions that no longer exist (e.g. deleted).
      const existingIds = new Set(data.sessions.map((s) => s.id));
      allSessionIdsRef.current = existingIds;
      setUnreadSessionIds((prev) => {
        if (prev.size === 0) return prev;
        const next = new Set([...prev].filter((id) => existingIds.has(id)));
        return next.size === prev.size ? prev : next;
      });
      setError(null);
      if (!showLoading) {
        setSessionRefreshDone(true);
        if (sessionRefreshTimerRef.current) clearTimeout(sessionRefreshTimerRef.current);
        sessionRefreshTimerRef.current = setTimeout(() => setSessionRefreshDone(false), 2000);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  const initialLoadDone = useRef(false);
  useEffect(() => {
    const isFirst = !initialLoadDone.current;
    initialLoadDone.current = true;
    loadSessions(isFirst);
  }, [loadSessions, refreshKey]);

  // Persist unread markers so they survive a browser refresh before the user
  // has actually opened the completed session.
  useEffect(() => {
    saveUnreadSessionIds(unreadSessionIds);
  }, [unreadSessionIds]);

  useEffect(() => {
    // Live running status via SSE — no polling. The server pushes the current
    // set of running session ids whenever any session starts/stops working.
    const source = new EventSource("/api/agent/running/events");

    source.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as { type?: string; runningSessionIds?: string[] };
        if (data.type === "running") {
          sseAuthoritativeRef.current = true;
          setRunningSessionIds(new Set(data.runningSessionIds ?? []));
        }
      } catch {
        // ignore malformed frames
      }
    };

    // On error EventSource auto-reconnects; keep the last known state meanwhile.
    return () => source.close();
  }, []);

  useEffect(() => {
    const previous = previousRunningSessionIdsRef.current;
    const completedInBackground = [...previous].filter((id) => !runningSessionIds.has(id) && id !== selectedSessionId);
    const newlyRunning = [...runningSessionIds];

    if (completedInBackground.length > 0 || newlyRunning.length > 0) {
      setUnreadSessionIds((prev) => {
        const next = new Set(prev);
        newlyRunning.forEach((id) => next.delete(id));
        completedInBackground.forEach((id) => next.add(id));
        return next;
      });
    }
    // A running id we have never seen is a session created elsewhere (another
    // client, or a brand-new session whose refresh raced this event) — reload
    // so its row appears without waiting for the run to finish.
    const unknownRunning = newlyRunning.filter((id) => !allSessionIdsRef.current.has(id));
    if (completedInBackground.length > 0 || unknownRunning.length > 0) {
      loadSessions(false);
    }

    previousRunningSessionIdsRef.current = runningSessionIds;
  }, [runningSessionIds, selectedSessionId, loadSessions]);

  useEffect(() => {
    if (!selectedSessionId) return;
    setUnreadSessionIds((prev) => {
      if (!prev.has(selectedSessionId)) return prev;
      const next = new Set(prev);
      next.delete(selectedSessionId);
      return next;
    });
  }, [selectedSessionId]);

  useEffect(() => {
    if (explorerRefreshKey !== undefined) setExplorerKey((k) => k + 1);
  }, [explorerRefreshKey]);

  useEffect(() => {
    void requestJson<HomeResponse>("/api/home").then((d) => {
      if (d.home) setHomeDir(d.home);
    }).catch(() => {});
  }, []);

  const restoredRef = useRef(false);

  /** Resolve the project root for a cwd from the freshest data available */
  const projectRootFor = useCallback((cwd: string | null): string | null => {
    if (!cwd) return null;
    if (worktreeState && worktreeState.forCwd === cwd) return worktreeState.projectRoot;
    // Any path in the loaded worktree list belongs to that project — covers
    // worktrees without sessions, so switching to them keeps the row mounted.
    if (worktreeState?.worktrees.some((w) => w.path === cwd)) return worktreeState.projectRoot;
    const match = allSessions.find((s) => s.cwd === cwd);
    return match?.projectRoot ?? cwd;
  }, [worktreeState, allSessions]);

  /** Resolve the stable server-computed project identity for a cwd. */
  const projectKeyFor = useCallback((cwd: string | null): string | null => {
    if (!cwd) return null;
    if (worktreeState && worktreeState.forCwd === cwd) return worktreeState.projectKey;
    if (worktreeState?.worktrees.some((w) => w.path === cwd)) return worktreeState.projectKey;
    const match = allSessions.find((s) => s.cwd === cwd);
    return match?.projectKey ?? match?.projectRoot ?? cwd;
  }, [worktreeState, allSessions]);

  const selectCwd = useCallback((cwd: string | null) => {
    setActiveWorkspace(cwd, projectRootFor(cwd), projectKeyFor(cwd));
  }, [projectRootFor, projectKeyFor, setActiveWorkspace]);

  // Load worktrees for the current effective cwd
  const [wtRefreshKey, setWtRefreshKey] = useState(0);
  useLayoutEffect(() => {
    if (!selectedCwd) {
      setWorktreeState(null);
      setWorktreeLoadingCwd(null);
      return;
    }
    let cancelled = false;
    setWorktreeLoadingCwd(selectedCwd);
    void requestJson<WorktreesResponse>(`/api/worktrees?cwd=${encodeURIComponent(selectedCwd)}`)
      .then((d) => {
        if (cancelled) return;
        setWorktreeLoadingCwd(null);
        if (!d.projectRoot) {
          setWorktreeState(null);
          return;
        }
        setWorktreeState({
          forCwd: selectedCwd,
          projectRoot: d.projectRoot,
          projectKey: d.projectKey ?? d.projectRoot,
          isGit: d.isGit ?? false,
          isTopLevel: d.isTopLevel ?? false,
          worktrees: d.worktrees ?? [],
        });
        setActiveWorkspace(selectedCwd, d.projectRoot, d.projectKey ?? d.projectRoot);
      })
      .catch(() => {
        if (!cancelled) {
          setWorktreeLoadingCwd(null);
          setWorktreeState(null);
        }
      });
    return () => { cancelled = true; };
  }, [selectedCwd, wtRefreshKey, refreshKey, setActiveWorkspace]);

  // Auto-select cwd and restore session from URL on first load
  useEffect(() => {
    if (allSessions.length === 0 || skipInitialProjectSelection) return;

    if (selectedCwd === null) {
      // If restoring a session, set cwd to match that session
      if (initialSessionId && !restoredRef.current) {
        restoredRef.current = true;
        const target = allSessions.find((s) => s.id === initialSessionId);
        if (target) {
          setActiveWorkspace(
            target.cwd,
            target.projectRoot ?? target.cwd,
            target.projectKey ?? target.projectRoot ?? target.cwd,
          );
          onSelectSession(target, true);
          return;
        }
        // Session not found — notify parent so it can show the placeholder
        onInitialRestoreDone?.();
      }
      const projects = getRecentProjects(allSessions);
      if (projects.length > 0) selectCwd(projects[0]);
    }
  }, [allSessions, selectedCwd, initialSessionId, skipInitialProjectSelection, onSelectSession, onInitialRestoreDone, selectCwd, setActiveWorkspace]);

  const commitCustomPath = useCallback(async (candidate: string) => {
    const path = candidate.trim();
    if (!path || customPathValidating) return;

    setCustomPathValidating(true);
    setCustomPathError(null);
    try {
      const data = await requestJson<CwdValidateResponse>("/api/cwd/validate", {
        method: "POST",
        json: { cwd: path },
      });
      // /api/cwd/validate resolves identity before the cwd becomes active, so
      // pass projectRoot + projectKey directly instead of relying on a fresh
      // session-list refresh to hydrate them.
      if (data.cwd) {
        useWorkspaceStore.getState().setActiveWorkspace(
          data.cwd,
          data.projectRoot ?? data.cwd,
          data.projectKey ?? data.projectRoot ?? data.cwd,
        );
      }
      setDropdownOpen(false);
    } catch (e) {
      setCustomPathError(e instanceof Error ? e.message : String(e));
    } finally {
      setCustomPathValidating(false);
    }
  }, [customPathValidating]);

  const handleCustomPathClick = useCallback(async () => {
    setCustomPathError(null);
    setDropdownOpen(false);

    const result = await pickNativeDirectory();
    if (result.status === "cancelled") return;
    if (result.status === "unavailable") {
      setCustomPathError(t("directoryPicker.nativeUnavailable"));
      return;
    }
    if (result.status === "error") {
      setCustomPathError(t("directoryPicker.nativeFailed"));
      return;
    }

    await commitCustomPath(result.path);
  }, [commitCustomPath, t]);

  const requestDefaultCwd = useCallback(async (): Promise<string | null> => {
    try {
      const data = await requestJson<DefaultCwdResponse>("/api/default-cwd", { method: "POST" });
      return data.cwd ?? null;
    } catch {
      return null;
    }
  }, []);

  const handleDefaultCwd = useCallback(async () => {
    const cwd = await requestDefaultCwd();
    if (cwd) {
      selectCwd(cwd);
      setCustomPathError(null);
      setDropdownOpen(false);
      return;
    }
    setCustomPathError(t("sidebar.defaultDirectoryFailed"));
  }, [requestDefaultCwd, selectCwd, t]);

  const handleWorktreeCreated = useCallback((path: string, branch: string) => {
    setWorktreeState((current) => current ? {
      ...current,
      forCwd: path,
      worktrees: [...current.worktrees, { path, branch, isMain: false }],
    } : current);
    setActiveWorkspace(path, worktreeState?.projectRoot ?? path, worktreeState?.projectKey ?? worktreeState?.projectRoot ?? path);
    setWtRefreshKey((key) => key + 1);
  }, [setActiveWorkspace, worktreeState?.projectKey, worktreeState?.projectRoot]);

  const handleWorktreeRemoved = useCallback((path: string) => {
    if (selectedCwd === path && worktreeState) {
      setActiveWorkspace(worktreeState.projectRoot, worktreeState.projectRoot, worktreeState.projectKey);
    }
    setWtRefreshKey((key) => key + 1);
  }, [selectedCwd, setActiveWorkspace, worktreeState]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
        setProjectFilter("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Clicking a session moves the effective cwd to that session's worktree.
  // Done on the click path (not via the selectedCwd prop sync) so it also
  // works when the prop value won't change — e.g. re-clicking the already
  // open session after manually switching worktrees.
  const handleSelectSessionFromList = useCallback((s: SessionInfo) => {
    if (s.cwd) setActiveWorkspace(
      s.cwd,
      s.projectRoot ?? s.cwd,
      s.projectKey ?? s.projectRoot ?? s.cwd,
    );
    onSelectSession(s);
  }, [onSelectSession, setActiveWorkspace]);

  const handleNewSession = useCallback(() => {
    if (!selectedCwd) return;
    // Generate a temporary UUID client-side — no backend call needed.
    // Pi will be spawned lazily when the user sends the first message.
    const tempId = typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    onNewSession?.(tempId, selectedCwd);
  }, [selectedCwd, onNewSession]);

  const recentProjects = getRecentProjects(allSessions);
  const showProjectFilter = recentProjects.length > 8;
  const visibleProjects = projectFilter.trim()
    ? recentProjects.filter((p) => p.toLowerCase().includes(projectFilter.trim().toLowerCase()))
    : recentProjects;

  // Sessions of every worktree in the selected project are shown together
  const selectedProject = projectRootFor(selectedCwd);
  const filteredSessions = selectedProject
    ? allSessions.filter((s) => (s.projectRoot ?? s.cwd) === selectedProject)
    : allSessions;
  const showWorktreeSwitcher = Boolean(
    worktreeState?.isGit
    && worktreeState.isTopLevel
    && selectedCwd
    && selectedProject === worktreeState.projectRoot
  );
  const worktreeGuide = selectedCwd
    && worktreeState
    && selectedProject === worktreeState.projectRoot
    && !showWorktreeSwitcher
    ? (worktreeState.isGit
        ? {
            label: t("sidebar.openRepoRoot"),
            title: t("sidebar.openRepoRootTitle"),
          }
        : {
            label: t("sidebar.gitRepoRootOnly"),
            title: t("sidebar.gitRepoRootOnlyTitle"),
          })
    : null;
  const worktreeLoading = Boolean(selectedCwd && worktreeLoadingCwd === selectedCwd);
  const inactiveWorktreeSelector = worktreeGuide
    ?? (worktreeLoading && !showWorktreeSwitcher
      ? {
          label: t("sidebar.worktrees"),
          title: t("sidebar.checkingWorktrees"),
        }
      : null);

  // Total fork-descendant count per session, computed from the unfiltered
  // list so project filtering never hides branches from the delete dialog.
  const descendantCountById = useMemo(() => {
    const childrenByParent = new Map<string, string[]>();
    for (const session of allSessions) {
      if (!session.parentSessionId) continue;
      const siblings = childrenByParent.get(session.parentSessionId) ?? [];
      siblings.push(session.id);
      childrenByParent.set(session.parentSessionId, siblings);
    }
    const counts = new Map<string, number>();
    for (const session of allSessions) {
      let count = 0;
      const queue = [...(childrenByParent.get(session.id) ?? [])];
      const seen = new Set(queue);
      while (queue.length > 0) {
        const current = queue.shift()!;
        count += 1;
        for (const childId of childrenByParent.get(current) ?? []) {
          if (!seen.has(childId)) {
            seen.add(childId);
            queue.push(childId);
          }
        }
      }
      if (count > 0) counts.set(session.id, count);
    }
    return counts;
  }, [allSessions]);

  // Build parent-child tree within the filtered set
  const sessionTree = buildSessionTree(filteredSessions);

  // Session count per project, shown in the dropdown delete confirmation.
  const sessionCountByProject = new Map<string, number>();
  for (const session of allSessions) {
    const key = session.projectRoot ?? session.cwd;
    sessionCountByProject.set(key, (sessionCountByProject.get(key) ?? 0) + 1);
  }

  const handleDeleteProject = async (project: string) => {
    const data = await requestJson<DeleteSessionsResponse>(
      `/api/sessions?projectRoot=${encodeURIComponent(project)}`,
      { method: "DELETE" },
    );
    // When the deleted project was the one on screen, leave it for good:
    // jump into the default scratch directory so the header cannot keep
    // showing a path that no longer has any sessions. The extra cwd checks
    // cover worktree selections where the row key differs from selectedCwd.
    const wasDisplayed = project === selectedProject
      || project === selectedCwd
      || (selectedCwd !== null && allSessions.some(
        (s) => s.cwd === selectedCwd && data.deletedIds.includes(s.id)));
    if (wasDisplayed) {
      let target = await requestDefaultCwd();
      // Deleting today's default directory itself: re-selecting it would just
      // resurrect the same path, so fall back to the next remaining project.
      if (!target || target === project) {
        target = recentProjects.filter((entry) => entry !== project)[0] ?? null;
      }
      selectCwd(target);
      setCustomPathError(null);
      setDropdownOpen(false);
    }
    onProjectDeleted?.(project, data.deletedIds);
    await loadSessions();
  };

  return (
    <div className="pi-session-sidebar" style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div
        className="pi-sidebar-header"
        style={{
          padding: "0 10px 10px",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
        }}
      >
        <div className="pi-sidebar-toolbar" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 36, boxSizing: "border-box", marginBottom: 10 }}>
          <PiWebTitle />
          <div className="pi-sidebar-actions" style={{ display: "flex", gap: 6 }}>
            <button
              className="pi-sidebar-action pi-sidebar-new-session"
              onClick={handleNewSession}
              disabled={!selectedCwd}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                background: "var(--bg-hover)",
                border: "1px solid var(--border)",
                color: selectedCwd ? "var(--text-muted)" : "var(--text-dim)",
                cursor: selectedCwd ? "pointer" : "not-allowed",
                height: 32,
                paddingLeft: 10,
                paddingRight: 12,
                borderRadius: 7,
                fontSize: 12,
                fontWeight: 500,
                letterSpacing: "-0.01em",
                flexShrink: 0,
                transition: "background 0.12s, color 0.12s, border-color 0.12s",
              }}
              title={selectedCwd ? t("sidebar.newSessionTitle", { path: selectedCwd }) : t("sidebar.selectProject")}
              onMouseEnter={(e) => {
                if (!selectedCwd) return;
                e.currentTarget.style.background = "var(--bg-selected)";
                e.currentTarget.style.color = "var(--accent)";
                e.currentTarget.style.borderColor = "var(--focus-ring)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "var(--bg-hover)";
                e.currentTarget.style.color = selectedCwd ? "var(--text-muted)" : "var(--text-dim)";
                e.currentTarget.style.borderColor = "var(--border)";
              }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <line x1="6" y1="1" x2="6" y2="11" />
                <line x1="1" y1="6" x2="11" y2="6" />
              </svg>
              {t("sidebar.new")}
            </button>
            <button
              className={`pi-sidebar-action pi-sidebar-refresh${sessionRefreshDone ? " is-success" : ""}`}
              onClick={() => loadSessions(false)}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                background: sessionRefreshDone ? "var(--success-soft)" : "var(--bg-hover)",
                border: `1px solid ${sessionRefreshDone ? "var(--success)" : "var(--border)"}`,
                color: sessionRefreshDone ? "var(--success)" : "var(--text-muted)",
                cursor: "pointer",
                width: 32, height: 32,
                borderRadius: 7,
                padding: 0,
                flexShrink: 0,
                transition: "background 0.3s, color 0.3s, border-color 0.3s",
              }}
              onMouseEnter={(e) => {
                if (sessionRefreshDone) return;
                e.currentTarget.style.background = "var(--bg-selected)";
                e.currentTarget.style.color = "var(--accent)";
                e.currentTarget.style.borderColor = "var(--focus-ring)";
              }}
              onMouseLeave={(e) => {
                if (sessionRefreshDone) return;
                e.currentTarget.style.background = "var(--bg-hover)";
                e.currentTarget.style.color = "var(--text-muted)";
                e.currentTarget.style.borderColor = "var(--border)";
              }}
              title={t("sidebar.refresh")}
            >
              {sessionRefreshDone ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* CWD picker */}
        <div className="pi-project-selector-wrap" ref={dropdownRef} style={{ position: "relative" }}>
          <button
            className={`pi-project-selector${selectedCwd ? " has-selection" : " is-empty"}`}
            onClick={() => setDropdownOpen((v) => !v)}
            title={selectedProject ?? selectedCwd ?? ""}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              padding: "6px 10px",
              background: selectedCwd ? "var(--bg-hover)" : "var(--accent-soft)",
              border: selectedCwd ? "1px solid var(--border)" : "1px solid var(--focus-ring)",
              borderRadius: 7,
              cursor: "pointer",
              fontSize: 12,
              color: "var(--text)",
              textAlign: "left",
              transition: "border-color 0.15s, background 0.15s",
            }}
          >
            {selectedCwd ? (
              <PathLabel
                text={displayCwd(selectedProject ?? selectedCwd, homeDir)}
                style={{
                  flex: 1,
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  color: "var(--text)",
                }}
              />
            ) : (
              <span
                style={{
                  flex: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  color: "var(--text-dim)",
                }}
              >
                {initialSessionId && !restoredRef.current ? "" : t("sidebar.selectProject")}
              </span>
            )}
          </button>

          <AnimatedDropdown
            open={dropdownOpen}
            style={{
              position: "absolute",
              top: "calc(100% + 4px)",
              left: 0,
              right: 0,
              zIndex: 100,
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              borderRadius: "var(--ui-radius-md)",
              boxShadow: "var(--shadow-panel)",
              overflow: "hidden",
            }}
          >
              {showProjectFilter && (
                <div style={{ padding: "6px 8px", borderBottom: "1px solid var(--border)" }}>
                  <input
                    className="pi-sidebar-filter"
                    value={projectFilter}
                    onChange={(e) => setProjectFilter(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        setProjectFilter("");
                        setDropdownOpen(false);
                      }
                    }}
                    placeholder={t("sidebar.filterProjects")}
                    autoFocus
                    style={{
                      width: "100%",
                      fontSize: 11,
                      fontFamily: "var(--font-mono)",
                      padding: "5px 8px",
                      border: "1px solid var(--border)",
                      borderRadius: 5,
                      outline: "none",
                      background: "var(--bg)",
                      color: "var(--text)",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              )}
              <div style={{ maxHeight: "min(50vh, 380px)", overflowY: "auto" }}>
                {visibleProjects.map((project) => (
                  <ProjectRow
                    key={project}
                    project={project}
                    label={displayCwd(project, homeDir)}
                    selected={project === selectedProject}
                    sessionCount={sessionCountByProject.get(project) ?? 0}
                    onSelect={() => {
                      setActiveWorkspace(project, project, project);
                      setProjectFilter("");
                      setCustomPathError(null);
                      setDropdownOpen(false);
                    }}
                    onDelete={() => handleDeleteProject(project)}
                  />
                ))}
                {visibleProjects.length === 0 && projectFilter.trim() && (
                  <div style={{ padding: "8px 10px", fontSize: 11, color: "var(--text-dim)" }}>{t("sidebar.noMatchingProjects")}</div>
                )}
              </div>

              {/* Default cwd shortcut */}
              <button
                className="pi-sidebar-menu-action"
                onClick={(e) => { e.stopPropagation(); void handleDefaultCwd(); }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  width: "100%",
                  padding: "8px 10px",
                  background: "none",
                  border: "none",
                  borderTop: visibleProjects.length > 0 ? "1px solid var(--border)" : "none",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  textAlign: "left",
                  fontSize: 11,
                }}
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <path d="M1 3A1 1 0 0 1 2 2H4L5 3.5H8.5a.5.5 0 0 1 .5.5v4a.5.5 0 0 1-.5.5h-7A.5.5 0 0 1 1 8V3Z" />
                </svg>
                <span>{t("sidebar.useDefaultDirectory")}</span>
              </button>

              {/* Custom path directory picker */}
              <button
                className="pi-sidebar-menu-action"
                onClick={(e) => {
                  e.stopPropagation();
                  void handleCustomPathClick();
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  width: "100%",
                  padding: "8px 10px",
                  background: "none",
                  border: "none",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  textAlign: "left",
                  fontSize: 11,
                }}
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" style={{ flexShrink: 0 }}>
                  <line x1="5" y1="1" x2="5" y2="9" />
                  <line x1="1" y1="5" x2="9" y2="5" />
                </svg>
                <span>{t("sidebar.customPath")}</span>
              </button>
          </AnimatedDropdown>
        </div>
        {customPathError && (
          <div className="pi-sidebar-state is-error" style={{ marginTop: 6, fontSize: 11, color: "var(--danger)", lineHeight: 1.5 }}>
            {customPathError}
          </div>
        )}

        <WorktreeSwitcher
          state={worktreeState}
          selectedCwd={selectedCwd}
          homeDir={homeDir}
          active={showWorktreeSwitcher}
          inactive={inactiveWorktreeSelector}
          onSelect={selectCwd}
          onCreated={handleWorktreeCreated}
          onRemoved={handleWorktreeRemoved}
        />
      </div>

      {/* Session list */}
      <div className="pi-session-list" style={{ flex: explorerOpen && selectedCwd ? "1 1 0" : "1 1 auto", overflowY: "auto", padding: "0", minHeight: 80 }}>
        {loading && (
          <div className="pi-sidebar-state is-loading" style={{ padding: "16px 14px", color: "var(--text-muted)", fontSize: 12 }}>
            加载中...
          </div>
        )}
        {error && (
          <div className="pi-sidebar-state is-error" style={{ padding: "12px 14px", color: "var(--danger)", fontSize: 12 }}>
            {error}
          </div>
        )}
        {!loading && !error && filteredSessions.length === 0 && (
          <div className="pi-sidebar-state is-empty" style={{ padding: "16px 14px", color: "var(--text-muted)", fontSize: 12 }}>
            未找到会话
          </div>
        )}
        {sessionTree.map((node) => (
          <SessionTreeItem
            key={node.session.id}
            node={node}
            selectedSessionId={selectedSessionId}
            runningSessionIds={runningSessionIds}
            unreadSessionIds={unreadSessionIds}
            descendantCountById={descendantCountById}
            onSelectSession={handleSelectSessionFromList}
            onRenamed={loadSessions}
            onSessionDeleted={(id, deletedIds) => {
              onSessionDeleted?.(id, deletedIds);
              loadSessions();
            }}
            depth={0}
          />
        ))}
      </div>

      {/* File Explorer section */}
      {selectedCwd && (
        <div
          className="pi-sidebar-explorer"
          style={{
            borderTop: "1px solid var(--border)",
            display: "flex",
            flexDirection: "column",
            flex: explorerOpen ? "1 1 0" : "0 0 auto",
            minHeight: 0,
            overflow: "hidden",
          }}
        >
          <div className="pi-sidebar-explorer-header" style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
            <button
              className="pi-sidebar-explorer-toggle"
              onClick={() => setExplorerOpen((v) => !v)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                flex: 1,
                padding: "6px 10px",
                background: "none",
                border: "none",
                color: "var(--text-muted)",
                cursor: "pointer",
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                textAlign: "left",
              }}
            >
              <svg
                width="9" height="9" viewBox="0 0 10 10" fill="none"
                stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
                style={{ transform: explorerOpen ? "rotate(90deg)" : "none", transition: "transform 0.15s", flexShrink: 0 }}
              >
                <polyline points="3 2 7 5 3 8" />
              </svg>
              {t("files.explorer")}
            </button>
            {explorerOpen && changesCount > 0 && (
              <button
                className={`pi-sidebar-action pi-sidebar-compact-action${changesCollapsed ? "" : " is-active"}`}
                type="button"
                onClick={() => setChangesCollapsed((value) => !value)}
                title={t("sidebar.changedFiles", { count: changesCount })}
                aria-label={t("sidebar.changedFiles", { count: changesCount })}
                aria-pressed={!changesCollapsed}
                style={{
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 26,
                  height: 26,
                  padding: 0,
                  border: "none",
                  borderRadius: 5,
                  background: changesCollapsed ? "none" : "var(--bg-hover)",
                  color: changesCollapsed ? "var(--text-dim)" : "var(--accent)",
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="3" />
                  <path d="M3 12h6" />
                  <path d="M15 12h6" />
                </svg>
                <span
                  style={{
                    position: "absolute",
                    top: -3,
                    right: -3,
                    minWidth: 13,
                    height: 13,
                    padding: "0 3px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 7,
                    background: "var(--accent)",
                    color: "var(--text-on-accent)",
                    fontSize: 9,
                    fontWeight: 700,
                    lineHeight: 1,
                  }}
                >
                  {changesCount}
                </span>
              </button>
            )}
            {explorerOpen && (
              <button
                className="pi-sidebar-action pi-sidebar-compact-action"
                onClick={() => fileExplorerRef.current?.openUploadPicker()}
                disabled={explorerUploadBusy}
                title={t("sidebar.uploadFiles")}
                aria-label={t("sidebar.uploadFiles")}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  width: 26, height: 26, padding: 0,
                  background: "none",
                  border: "none",
                  color: "var(--text-dim)",
                  cursor: explorerUploadBusy ? "default" : "pointer",
                  borderRadius: 5,
                  flexShrink: 0,
                  opacity: explorerUploadBusy ? 0.6 : 1,
                  transition: "color 0.3s, background 0.3s",
                }}
                onMouseEnter={(e) => { if (explorerUploadBusy) return; e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.background = "var(--bg-hover)"; }}
                onMouseLeave={(e) => { if (explorerUploadBusy) return; e.currentTarget.style.color = "var(--text-dim)"; e.currentTarget.style.background = "none"; }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <path d="m17 8-5-5-5 5" />
                  <path d="M12 3v12" />
                </svg>
              </button>
            )}
            <button
              className={`pi-sidebar-action pi-sidebar-compact-action${explorerRefreshDone ? " is-success" : ""}`}
              onClick={() => {
                if (onExplorerRefresh) onExplorerRefresh();
                else setExplorerKey((k) => k + 1);
                setExplorerRefreshDone(true);
                if (explorerRefreshTimerRef.current) clearTimeout(explorerRefreshTimerRef.current);
                explorerRefreshTimerRef.current = setTimeout(() => setExplorerRefreshDone(false), 2000);
              }}
              title={t("sidebar.refreshExplorer")}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: 26, height: 26, padding: 0, marginRight: 6,
                background: explorerRefreshDone ? "var(--success-soft)" : "none",
                border: "none",
                color: explorerRefreshDone ? "var(--success)" : "var(--text-dim)",
                cursor: "pointer",
                borderRadius: 5,
                flexShrink: 0,
                transition: "color 0.3s, background 0.3s",
              }}
              onMouseEnter={(e) => { if (explorerRefreshDone) return; e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.background = "var(--bg-hover)"; }}
              onMouseLeave={(e) => { if (explorerRefreshDone) return; e.currentTarget.style.color = "var(--text-dim)"; e.currentTarget.style.background = "none"; }}
            >
              {explorerRefreshDone ? (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                </svg>
              )}
            </button>
          </div>
          {explorerOpen && (
            <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
              <FileExplorer
                ref={fileExplorerRef}
                cwd={selectedCwd}
                onOpenFile={onOpenFile ?? (() => {})}
                refreshKey={explorerKey}
                onAtMention={onAtMention}
                onAtMentions={onAtMentions}
                onUploadBusyChange={setExplorerUploadBusy}
                changesCollapsed={changesCollapsed}
                onChangesCountChange={setChangesCount}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SessionTreeItem({
  node,
  selectedSessionId,
  runningSessionIds,
  unreadSessionIds,
  descendantCountById,
  onSelectSession,
  onRenamed,
  onSessionDeleted,
  depth,
}: {
  node: SessionListTreeNode;
  selectedSessionId: string | null;
  runningSessionIds: Set<string>;
  unreadSessionIds: Set<string>;
  descendantCountById: Map<string, number>;
  onSelectSession: (s: SessionInfo) => void;
  onRenamed?: () => void;
  onSessionDeleted?: (id: string, deletedIds?: string[]) => void;
  depth: number;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const hasChildren = node.children.length > 0;

  return (
    <div className="pi-session-tree-node">
      <div className="pi-session-tree-row" style={{ position: "relative" }}>
        {/* Indent line for child sessions */}
        {depth > 0 && (
          <div style={{
            position: "absolute",
            left: depth * 12 + 6,
            top: 0, bottom: 0,
            width: 1,
            background: "var(--border)",
            pointerEvents: "none",
          }} />
        )}
        <SessionItem
          session={node.session}
          isSelected={node.session.id === selectedSessionId}
          isRunning={runningSessionIds.has(node.session.id)}
          isUnread={unreadSessionIds.has(node.session.id)}
          onClick={() => onSelectSession(node.session)}
          onRenamed={onRenamed}
          onDeleted={(id, deletedIds) => onSessionDeleted?.(id, deletedIds)}
          depth={depth}
          hasChildren={hasChildren}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((v) => !v)}
          descendantCount={descendantCountById.get(node.session.id) ?? 0}
        />
      </div>
      {hasChildren && !collapsed && (
        <div>
          {node.children.map((child) => (
            <SessionTreeItem
              key={child.session.id}
              node={child}
              selectedSessionId={selectedSessionId}
              runningSessionIds={runningSessionIds}
              unreadSessionIds={unreadSessionIds}
              descendantCountById={descendantCountById}
              onSelectSession={onSelectSession}
              onRenamed={onRenamed}
              onSessionDeleted={onSessionDeleted}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RunningSessionIndicator() {
  const { t } = useI18n();
  return (
    <span
      className="pi-session-running-indicator"
      title={t("sidebar.agentRunning")}
      aria-label={t("sidebar.agentRunning")}
      style={{
        width: 14,
        height: 14,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        color: "var(--accent)",
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ display: "block" }}>
        <g>
          <path
            d="M21 12a9 9 0 1 1-3.8-7.4"
            stroke="currentColor"
            strokeWidth="2.8"
            strokeLinecap="round"
          />
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0 12 12"
            to="360 12 12"
            dur="0.9s"
            repeatCount="indefinite"
          />
        </g>
      </svg>
    </span>
  );
}

function UnreadSessionIndicator() {
  const { t } = useI18n();
  return (
    <span
      className="pi-session-unread-indicator"
      title={t("sidebar.newActivity")}
      aria-label={t("sidebar.newActivity")}
      style={{
        width: 14,
        height: 14,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        color: "var(--accent)",
      }}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" style={{ display: "block" }}>
        <circle cx="7" cy="7" r="2.5" fill="currentColor" />
        <circle cx="7" cy="7" r="3" stroke="currentColor" strokeWidth="1.4" opacity="0.32">
          <animate attributeName="r" values="3;6;3" dur="1.6s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.32;0;0.32" dur="1.6s" repeatCount="indefinite" />
        </circle>
      </svg>
    </span>
  );
}

function SessionItem({
  session,
  isSelected,
  isRunning,
  isUnread,
  onClick,
  onRenamed,
  onDeleted,
  depth = 0,
  hasChildren = false,
  collapsed = false,
  onToggleCollapse,
  descendantCount = 0,
}: {
  session: SessionInfo;
  isSelected: boolean;
  isRunning?: boolean;
  isUnread?: boolean;
  onClick: () => void;
  onRenamed?: () => void;
  onDeleted?: (id: string, deletedIds?: string[]) => void;
  depth?: number;
  hasChildren?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  descendantCount?: number;
}) {
  const { locale, t } = useI18n();
  const [hovered, setHovered] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [branchDialogOpen, setBranchDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const title = session.name || session.firstMessage.slice(0, 50) || session.id.slice(0, 12);

  const startRename = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setRenameValue(session.name ?? "");
    setRenaming(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }, [session.name]);

  const commitRename = useCallback(async () => {
    const name = renameValue.trim();
    setRenaming(false);
    if (name === (session.name ?? "")) return;
    try {
      await requestJson<unknown>(`/api/sessions/${encodeURIComponent(session.id)}`, {
        method: "PATCH",
        json: { name },
      });
      onRenamed?.();
    } catch {
      // ignore
    }
  }, [renameValue, session.id, session.name, onRenamed]);

  const performDelete = useCallback(async (recursive = false) => {
    setConfirmDelete(false);
    setBranchDialogOpen(false);
    setDeleting(true);
    try {
      const data = await requestJson<{ deletedIds?: string[] }>(
        `/api/sessions/${encodeURIComponent(session.id)}${recursive ? "?recursive=true" : ""}`,
        { method: "DELETE" },
      );
      onDeleted?.(session.id, data.deletedIds ?? [session.id]);
    } catch {
      setDeleting(false);
    }
  }, [session.id, onDeleted]);

  const handleDeleteClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (e.shiftKey) {
      void performDelete(false);
    } else if (descendantCount > 0) {
      // Sessions with forked branches get a dialog choosing between deleting
      // only this session or the whole branch subtree.
      setBranchDialogOpen(true);
    } else {
      setConfirmDelete(true);
    }
  }, [performDelete, descendantCount]);

  const handleDeleteConfirm = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    void performDelete(false);
  }, [performDelete]);

  const handleDeleteCancel = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDelete(false);
  }, []);

  // Fixed-height outer wrapper — content swaps in place so the list never reflows
  const ITEM_HEIGHT = 54;

  return (
    <>
      {branchDialogOpen && (
        <DeleteSessionDialog
          title={title}
          branchCount={descendantCount}
          busy={deleting}
          onDeleteOnly={() => void performDelete(false)}
          onDeleteAll={() => void performDelete(true)}
          onCancel={() => setBranchDialogOpen(false)}
        />
      )}
      <div
        className={`pi-session-item${isSelected ? " is-selected" : ""}${confirmDelete ? " is-confirming" : ""}${isRunning ? " is-running" : ""}${isUnread ? " is-unread" : ""}`}
        onClick={confirmDelete || renaming ? undefined : onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => { setHovered(false); }}
        style={{
          height: ITEM_HEIGHT,
          display: "flex",
          alignItems: "center",
          paddingLeft: depth > 0 ? depth * 12 + 14 : 14,
          paddingRight: 8,
          cursor: confirmDelete || renaming ? "default" : "pointer",
          background: confirmDelete
            ? "var(--danger-soft)"
            : isSelected ? "var(--bg-selected)" : hovered ? "var(--bg-hover)" : "transparent",
          borderLeft: confirmDelete
            ? "2px solid var(--danger)"
            : isSelected ? "2px solid var(--accent)" : "2px solid transparent",
          transition: "background 0.1s",
          opacity: deleting ? 0.5 : 1,
          gap: 6,
          overflow: "hidden",
        }}
      >
      {confirmDelete ? (
        /* ── Delete confirmation: same height, two flat buttons ── */
        <>
          <div style={{ flex: 1, minWidth: 0, fontSize: 12, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {t("sidebar.deleteSession", {
              title: `${title.slice(0, 22)}${title.length > 22 ? "…" : ""}`,
            })}
          </div>
          <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
            <button
              className="pi-sidebar-action is-danger is-solid"
              onClick={handleDeleteConfirm}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                height: 30, padding: "0 11px",
                background: "var(--danger)", border: "none",
                borderRadius: 6, color: "var(--text-on-accent)",
                cursor: "pointer", fontSize: 12, fontWeight: 600,
                whiteSpace: "nowrap",
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6M14 11v6" />
                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
              </svg>
              {t("sidebar.delete")}
            </button>
            <button
              className="pi-sidebar-action"
              onClick={handleDeleteCancel}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                height: 30, padding: "0 11px",
                background: "var(--bg)", border: "1px solid var(--border)",
                borderRadius: 6, color: "var(--text-muted)",
                cursor: "pointer", fontSize: 12, fontWeight: 500,
                whiteSpace: "nowrap",
              }}
            >
              {t("sidebar.cancel")}
            </button>
          </div>
        </>
      ) : renaming ? (
        /* ── Rename: input fills the same row ── */
        <input
          className="pi-session-rename-input"
          ref={inputRef}
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename();
            if (e.key === "Escape") setRenaming(false);
          }}
          autoFocus
          style={{
            flex: 1,
            fontSize: 12,
            padding: "5px 8px",
            border: "1px solid var(--accent)",
            borderRadius: 5,
            outline: "none",
            background: "var(--bg)",
            color: "var(--text)",
            height: 30,
          }}
        />
      ) : (
        /* ── Normal view ── */
        <>
          {/* Fork indicator for child sessions */}
          {depth > 0 && (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <line x1="6" y1="3" x2="6" y2="15" />
              <circle cx="18" cy="6" r="3" />
              <circle cx="6" cy="18" r="3" />
              <path d="M18 9a9 9 0 0 1-9 9" />
            </svg>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                minWidth: 0,
                fontSize: 12,
                fontWeight: isSelected ? 500 : 400,
                lineHeight: 1.4,
                color: "var(--text)",
              }}
              title={title}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
                {title}
              </span>
            </div>
            <div style={{ marginTop: 2, display: "flex", alignItems: "center", gap: 8, color: "var(--text-dim)", fontSize: 11, minWidth: 0 }}>
              {isRunning ? (
                <RunningSessionIndicator />
              ) : isUnread ? (
                <UnreadSessionIndicator />
              ) : (
                <span title={session.modified}>{formatRelativeTime(session.modified, locale)}</span>
              )}
              <span>{session.messageCount} 条消息</span>
              {session.worktreeBranch && (
                <span
                  title={`Worktree: ${session.cwd}`}
                  style={{ display: "flex", alignItems: "center", gap: 3, color: "var(--accent)", minWidth: 0, overflow: "hidden" }}
                >
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <line x1="6" y1="3" x2="6" y2="15" />
                    <circle cx="18" cy="6" r="3" />
                    <circle cx="6" cy="18" r="3" />
                    <path d="M18 9a9 9 0 0 1-9 9" />
                  </svg>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{session.worktreeBranch}</span>
                </span>
              )}
            </div>
          </div>

          {/* Collapse toggle — always visible when has children */}
          {hasChildren && (
            <button
              className="pi-sidebar-action pi-session-collapse-action"
              onClick={(e) => { e.stopPropagation(); onToggleCollapse?.(); }}
              title={collapsed ? t("sidebar.expandForks") : t("sidebar.collapseForks")}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: 20, height: 20, padding: 0, flexShrink: 0,
                background: "none", border: "none",
                color: "var(--text-dim)", cursor: "pointer",
                transform: collapsed ? "rotate(-90deg)" : "none",
                transition: "transform 0.15s",
              }}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="2 3.5 5 6.5 8 3.5" />
              </svg>
            </button>
          )}

          {/* Action buttons — shown on hover */}
          {hovered && (
            <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
              <button
                className="pi-sidebar-action pi-session-row-action"
                onClick={startRename}
                title={t("sidebar.rename")}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  width: 32, height: 32, padding: 0,
                  background: "var(--bg-hover)", border: "1px solid var(--border)",
                  borderRadius: 7, color: "var(--text-muted)",
                  cursor: "pointer", flexShrink: 0,
                  transition: "background 0.12s, color 0.12s, border-color 0.12s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--bg-selected)";
                  e.currentTarget.style.color = "var(--accent)";
                  e.currentTarget.style.borderColor = "var(--focus-ring)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "var(--bg-hover)";
                  e.currentTarget.style.color = "var(--text-muted)";
                  e.currentTarget.style.borderColor = "var(--border)";
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                </svg>
              </button>
              <button
                className="pi-sidebar-action pi-session-row-action is-danger"
                onClick={handleDeleteClick}
                title={t("sidebar.deleteWithShiftClick")}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  width: 32, height: 32, padding: 0,
                  background: "var(--bg-hover)", border: "1px solid var(--border)",
                  borderRadius: 7, color: "var(--text-muted)",
                  cursor: "pointer", flexShrink: 0,
                  transition: "background 0.12s, color 0.12s, border-color 0.12s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--danger-soft)";
                  e.currentTarget.style.color = "var(--danger)";
                  e.currentTarget.style.borderColor = "var(--danger)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "var(--bg-hover)";
                  e.currentTarget.style.color = "var(--text-muted)";
                  e.currentTarget.style.borderColor = "var(--border)";
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  <path d="M10 11v6M14 11v6" />
                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                </svg>
              </button>
            </div>
          )}
        </>
      )}
    </div>
    </>
  );
}
