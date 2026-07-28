"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiRequestError, requestJson } from "@/lib/api-client";
import type {
  CreateWorktreeResponse,
  SuccessResponse,
  WorktreeDeleteErrorResponse,
  WorktreeEntry,
} from "@/lib/api-types";
import { AnimatedDropdown, displayCwd, PathLabel } from "./SidebarPrimitives";

export interface WorktreeState {
  forCwd: string;
  projectRoot: string;
  isGit: boolean;
  isTopLevel: boolean;
  worktrees: WorktreeEntry[];
}

export interface InactiveWorktreeSelector {
  label: string;
  title: string;
}

export function WorktreeSwitcher({
  state,
  selectedCwd,
  homeDir,
  active,
  inactive,
  onSelect,
  onCreated,
  onRemoved,
}: {
  state: WorktreeState | null;
  selectedCwd: string | null;
  homeDir: string;
  active: boolean;
  inactive: InactiveWorktreeSelector | null;
  onSelect: (path: string) => void;
  onCreated: (path: string, branch: string) => void;
  onRemoved: (path: string) => void;
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [newBranch, setNewBranch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const newInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
        setNewOpen(false);
        setNewBranch("");
        setError(null);
        setConfirmRemove(null);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const handleCreate = useCallback(async () => {
    const branch = newBranch.trim();
    if (!branch || busy || !state) return;
    setBusy(true);
    setError(null);
    try {
      const data = await requestJson<CreateWorktreeResponse>("/api/worktrees", {
        method: "POST",
        json: { cwd: state.projectRoot, branch },
      });
      setNewOpen(false);
      setNewBranch("");
      setDropdownOpen(false);
      onCreated(data.path!, branch);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    } finally {
      setBusy(false);
    }
  }, [busy, newBranch, onCreated, state]);

  const handleRemove = useCallback(async (path: string, force: boolean) => {
    if (!state || busy) return;
    setBusy(true);
    setError(null);
    try {
      await requestJson<SuccessResponse>("/api/worktrees", {
        method: "DELETE",
        json: { cwd: state.projectRoot, path, force },
      });
      setConfirmRemove(null);
      onRemoved(path);
    } catch (requestError) {
      if (
        requestError instanceof ApiRequestError
        && (requestError.data as WorktreeDeleteErrorResponse | undefined)?.dirty
        && !force
      ) {
        setConfirmRemove(path);
        return;
      }
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    } finally {
      setBusy(false);
    }
  }, [busy, onRemoved, state]);

  if (active && state) {
    const currentWorktree = state.worktrees.find((worktree) => worktree.path === selectedCwd)
      ?? state.worktrees.find((worktree) => worktree.isMain);

    return (
      <div ref={dropdownRef} style={{ position: "relative", marginTop: 6 }}>
        <button
          onClick={() => setDropdownOpen((current) => !current)}
          title={currentWorktree ? `切换 worktree: ${currentWorktree.path}` : "切换 worktree"}
          style={{
            width: "100%",
            height: 29,
            boxSizing: "border-box",
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "0 10px",
            background: "var(--bg-hover)",
            border: "1px solid var(--border)",
            borderRadius: 7,
            cursor: "pointer",
            fontSize: 11,
            lineHeight: 1.35,
            color: "var(--text-muted)",
            textAlign: "left",
          }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: currentWorktree && !currentWorktree.isMain ? "var(--accent)" : "var(--text-dim)" }}>
            <line x1="6" y1="3" x2="6" y2="15" />
            <circle cx="18" cy="6" r="3" />
            <circle cx="6" cy="18" r="3" />
            <path d="M18 9a9 9 0 0 1-9 9" />
          </svg>
          <PathLabel
            text={currentWorktree
              ? (currentWorktree.branch ?? displayCwd(currentWorktree.path, homeDir))
              : "…"}
            style={{ flex: 1, fontFamily: "var(--font-mono)", color: "var(--text)" }}
          />
          {currentWorktree?.isMain && (
            <span style={{ flexShrink: 0, color: "var(--text-dim)", fontSize: 10 }}>main</span>
          )}
          {state.worktrees.length > 1 && (
            <span style={{ flexShrink: 0, color: "var(--text-dim)", fontSize: 10 }}>
              {state.worktrees.length}
            </span>
          )}
          <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <polyline points="2 3.5 5 6.5 8 3.5" />
          </svg>
        </button>

        <AnimatedDropdown
          open={dropdownOpen}
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            zIndex: 100,
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            boxShadow: "0 6px 20px rgba(0,0,0,0.10)",
            overflow: "hidden",
          }}
        >
          <div style={{ maxHeight: "min(40vh, 300px)", overflowY: "auto" }}>
            {state.worktrees.map((worktree) => {
              const current = worktree.path === selectedCwd
                || (worktree.isMain && !state.worktrees.some((entry) => entry.path === selectedCwd));

              if (confirmRemove === worktree.path) {
                return (
                  <div
                    key={worktree.path}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "7px 10px",
                      borderBottom: "1px solid var(--border)",
                      background: "rgba(239,68,68,0.06)",
                    }}
                  >
                    <span style={{ flex: 1, fontSize: 11, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      有未提交更改。强制移除检出？
                    </span>
                    <button
                      onClick={() => void handleRemove(worktree.path, true)}
                      disabled={busy}
                      style={{ padding: "3px 9px", background: "#ef4444", border: "none", borderRadius: 5, color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}
                    >
                      强制
                    </button>
                    <button
                      onClick={() => setConfirmRemove(null)}
                      style={{ padding: "3px 9px", background: "var(--bg-hover)", border: "1px solid var(--border)", borderRadius: 5, color: "var(--text-muted)", fontSize: 11, cursor: "pointer", flexShrink: 0 }}
                    >
                      取消
                    </button>
                  </div>
                );
              }

              return (
                <div
                  key={worktree.path}
                  className="wt-row"
                  style={{ display: "flex", alignItems: "center", borderBottom: "1px solid var(--border)" }}
                >
                  <button
                    onClick={() => {
                      onSelect(worktree.path);
                      setDropdownOpen(false);
                      setError(null);
                    }}
                    title={worktree.path}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      display: "flex",
                      alignItems: "center",
                      gap: 7,
                      padding: "8px 10px",
                      background: "var(--bg)",
                      border: "none",
                      color: current ? "var(--text)" : "var(--text-muted)",
                      cursor: "pointer",
                      textAlign: "left",
                      fontSize: 11,
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    {current ? (
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                        <polyline points="1.5 5 4 7.5 8.5 2.5" />
                      </svg>
                    ) : (
                      <span style={{ width: 10, flexShrink: 0 }} />
                    )}
                    <PathLabel
                      text={worktree.branch ?? displayCwd(worktree.path, homeDir)}
                      style={{ flex: 1 }}
                    />
                    {worktree.isMain && (
                      <span style={{ flexShrink: 0, color: "var(--text-dim)", fontSize: 10 }}>main</span>
                    )}
                  </button>
                  {!worktree.isMain && (
                    <button
                      onClick={() => void handleRemove(worktree.path, false)}
                      disabled={busy}
                      title={`移除 worktree 检出 ${worktree.path}；分支会保留`}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 34,
                        height: 28,
                        padding: 0,
                        marginRight: 4,
                        background: "none",
                        border: "none",
                        color: "var(--text-dim)",
                        cursor: "pointer",
                        borderRadius: 5,
                        flexShrink: 0,
                        transition: "color 0.12s, background 0.12s",
                      }}
                      onMouseEnter={(event) => {
                        event.currentTarget.style.color = "#ef4444";
                        event.currentTarget.style.background = "rgba(239,68,68,0.08)";
                      }}
                      onMouseLeave={(event) => {
                        event.currentTarget.style.color = "var(--text-dim)";
                        event.currentTarget.style.background = "none";
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                        <path d="M10 11v6M14 11v6" />
                        <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                      </svg>
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {!newOpen ? (
            <button
              onClick={(event) => {
                event.stopPropagation();
                setNewOpen(true);
                setError(null);
                setTimeout(() => newInputRef.current?.focus(), 0);
              }}
              title="为分支创建 worktree 检出"
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
              <span>新建 worktree…</span>
            </button>
          ) : (
            <div style={{ padding: "6px 8px" }}>
              <input
                ref={newInputRef}
                value={newBranch}
                onChange={(event) => {
                  setNewBranch(event.target.value);
                  setError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void handleCreate();
                  }
                  if (event.key === "Escape") {
                    setNewOpen(false);
                    setNewBranch("");
                    setError(null);
                  }
                }}
                placeholder="分支名称"
                style={{
                  width: "100%",
                  fontSize: 11,
                  fontFamily: "var(--font-mono)",
                  padding: "5px 8px",
                  border: "1px solid var(--accent)",
                  borderRadius: 5,
                  outline: "none",
                  background: "var(--bg)",
                  color: "var(--text)",
                  boxSizing: "border-box",
                }}
              />
              <div style={{ display: "flex", gap: 5, marginTop: 5 }}>
                <button
                  onClick={() => void handleCreate()}
                  disabled={busy || !newBranch.trim()}
                  style={{
                    flex: 1,
                    padding: "4px 0",
                    background: "var(--accent)",
                    border: "none",
                    borderRadius: 5,
                    color: "#fff",
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: busy || !newBranch.trim() ? "not-allowed" : "pointer",
                    opacity: busy || !newBranch.trim() ? 0.65 : 1,
                  }}
                >
                  {busy ? "创建中…" : "创建"}
                </button>
                <button
                  onClick={() => {
                    setNewOpen(false);
                    setNewBranch("");
                    setError(null);
                  }}
                  style={{
                    flex: 1,
                    padding: "4px 0",
                    background: "var(--bg-hover)",
                    border: "1px solid var(--border)",
                    borderRadius: 5,
                    color: "var(--text-muted)",
                    fontSize: 11,
                    cursor: "pointer",
                  }}
                >
                  取消
                </button>
              </div>
            </div>
          )}
          {error && (
            <div
              style={{
                padding: "5px 10px 8px",
                color: "#dc2626",
                fontSize: 11,
                lineHeight: 1.35,
                overflowWrap: "anywhere",
              }}
            >
              {error}
            </div>
          )}
        </AnimatedDropdown>
      </div>
    );
  }

  if (!inactive) return null;

  return (
    <button
      type="button"
      aria-disabled="true"
      tabIndex={-1}
      title={inactive.title}
      style={{
        width: "100%",
        height: 29,
        boxSizing: "border-box",
        marginTop: 6,
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "0 10px",
        border: "1px solid var(--border)",
        borderRadius: 7,
        background: "var(--bg-hover)",
        color: "var(--text-dim)",
        fontSize: 11,
        lineHeight: 1.35,
        whiteSpace: "nowrap",
        textAlign: "left",
        cursor: "default",
        opacity: 0.82,
      }}
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
        <line x1="6" y1="3" x2="6" y2="15" />
        <circle cx="18" cy="6" r="3" />
        <circle cx="6" cy="18" r="3" />
        <path d="M18 9a9 9 0 0 1-9 9" />
      </svg>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{inactive.label}</span>
    </button>
  );
}
