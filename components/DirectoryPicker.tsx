"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { requestJson } from "@/lib/api-client";
import type {
  CwdMkdirResponse,
  CwdQuickLinksResponse,
  HomeResponse,
} from "@/lib/api-types";
import { useI18n } from "@/hooks/useI18n";
import { displayCwd } from "./session-sidebar/SidebarPrimitives";

interface DirectoryEntry {
  name: string;
  path: string;
}

interface BrowseResponse {
  path?: string;
  parentPath?: string | null;
  directories?: DirectoryEntry[];
  drives?: DirectoryEntry[];
}

interface Props {
  onCancel: () => void;
  onSelect: (path: string) => void;
  busy?: boolean;
  error?: string | null;
  initialPath?: string;
}

function lastPathSegment(path: string): string {
  const clean = path.replace(/\/+$/, "");
  const pieces = clean.split("/").filter(Boolean);
  return pieces[pieces.length - 1] ?? path;
}

function pathToSegments(path: string, homeDir: string): Array<{ key: string; label: string; path: string }> {
  if (!path.startsWith("/")) return [{ key: path, label: path, path }];
  const parts = path.split("/").filter(Boolean);
  const segments: Array<{ key: string; label: string; path: string }> = [];
  if (parts.length === 0) {
    return [{ key: "/", label: "/", path: "/" }];
  }

  let cursor = "";
  parts.forEach((part, index) => {
    cursor += `/${part}`;
    const isFirstHome = index === 0 && homeDir === cursor;
    segments.push({
      key: cursor,
      label: isFirstHome ? "⌂" : part,
      path: cursor,
    });
  });
  return segments;
}

function FolderIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <path d="M1.5 3.5h4l1.4 1.8h7.6v7.2h-13z" />
    </svg>
  );
}

async function loadDirectories(directory?: string): Promise<BrowseResponse> {
  const query = directory ? `?path=${encodeURIComponent(directory)}` : "";
  return requestJson<BrowseResponse>(`/api/cwd/browse${query}`);
}

export function DirectoryPicker({
  onCancel,
  onSelect,
  busy = false,
  error,
  initialPath,
}: Props) {
  const { t } = useI18n();
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const [homeDir, setHomeDir] = useState<string>("");
  const [currentPath, setCurrentPath] = useState("");
  const [parentDirectory, setParentDirectory] = useState<string | null>(null);
  const [directories, setDirectories] = useState<DirectoryEntry[]>([]);
  const [drives, setDrives] = useState<DirectoryEntry[] | null>(null);

  function isWindowsDriveRoot(directory: string): boolean {
    return /^[a-zA-Z]:[\/]{0,2}$/.test(directory);
  }
  const [selectedPath, setSelectedPath] = useState<string>("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showHidden, setShowHidden] = useState(false);
  const [filterText, setFilterText] = useState("");
  const [pathEditing, setPathEditing] = useState(false);
  const [pathInput, setPathInput] = useState("");
  const [quickLinks, setQuickLinks] = useState<CwdQuickLinksResponse>({
    places: [],
    recents: [],
  });
  const [quickLinksError, setQuickLinksError] = useState<string | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const pathInputRef = useRef<HTMLInputElement | null>(null);
  const createInputRef = useRef<HTMLInputElement | null>(null);

  const navigateTo = useCallback(async (directory?: string) => {
    setLoading(true);
    setLoadError(null);
    setCreateError(null);
    try {
      const data = await loadDirectories(directory);
      const nextPath = data.path ?? directory ?? "/";
      setCurrentPath(nextPath);
      setParentDirectory(data.parentPath ?? null);
      setDirectories(data.directories ?? []);
      setDrives(data.drives ?? null);
      setSelectedPath(nextPath);
      setPathInput(nextPath);
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setPortalTarget(document.body);
    void requestJson<HomeResponse>("/api/home")
      .then((data) => setHomeDir(data.home ?? ""))
      .catch(() => {});
    void requestJson<CwdQuickLinksResponse>("/api/cwd/quick-links")
      .then((data) => {
        setQuickLinks(data);
        setQuickLinksError(null);
      })
      .catch((cause) => {
        setQuickLinksError(cause instanceof Error ? cause.message : String(cause));
      });
    void navigateTo(initialPath?.trim() || undefined);
  }, [initialPath, navigateTo]);

  useEffect(() => {
    if (pathEditing && pathInputRef.current) pathInputRef.current.focus();
  }, [pathEditing]);

  useEffect(() => {
    if (creatingFolder && createInputRef.current) createInputRef.current.focus();
  }, [creatingFolder]);

  const visibleDirectories = useMemo(() => {
    let items = directories;
    if (!showHidden) {
      items = items.filter((entry) => !entry.name.startsWith("."));
    }
    const filter = filterText.trim().toLowerCase();
    if (!filter) return items;
    return items.filter((entry) => entry.name.toLowerCase().includes(filter));
  }, [directories, filterText, showHidden]);

  const segments = useMemo(() => pathToSegments(currentPath, homeDir), [currentPath, homeDir]);
  const selectedName = selectedPath ? lastPathSegment(selectedPath) : "";
  const selectLabel = selectedName
    ? t("directoryPicker.selectNamedFolder", { name: selectedName })
    : t("directoryPicker.selectThisFolder");

  const handlePathSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const candidate = pathInput.trim();
    if (!candidate) return;
    setPathEditing(false);
    void navigateTo(candidate);
  };

  const handleCreateFolder = async () => {
    const folderName = newFolderName.trim();
    if (!folderName) return;
    setCreateError(null);
    try {
      const base = currentPath.endsWith("/") ? currentPath.slice(0, -1) : currentPath;
      const target = `${base}/${folderName}`;
      const data = await requestJson<CwdMkdirResponse>("/api/cwd/mkdir", {
        method: "POST",
        json: { path: target },
      });
      setCreatingFolder(false);
      setNewFolderName("");
      await navigateTo(data.cwd);
    } catch (cause) {
      setCreateError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  if (!portalTarget) return null;

  return createPortal(
    <div
      className="directory-picker-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={t("directoryPicker.selectDirectory")}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !busy) {
          if (pathEditing) {
            setPathEditing(false);
            setPathInput(currentPath);
            return;
          }
          if (creatingFolder) {
            setCreatingFolder(false);
            setNewFolderName("");
            return;
          }
          onCancel();
        }
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.35)",
      }}
    >
      <div
        className="directory-picker-panel"
        style={{
          width: 760,
          maxWidth: "calc(100vw - 16px)",
          height: "min(620px, calc(100dvh - 16px))",
          maxHeight: "calc(100dvh - 16px)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-strong)",
          borderRadius: "var(--ui-radius-lg)",
          boxShadow: "var(--shadow-panel)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, padding: "12px 18px", borderBottom: "1px solid var(--border)", background: "var(--bg-panel)" }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ color: "var(--text)", fontWeight: 700, fontSize: 15 }}>{t("directoryPicker.selectDirectory")}</div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            title={t("common.close")}
            aria-label={t("common.close")}
            style={{ padding: "2px 6px", border: 0, background: "none", color: "var(--text-muted)", fontSize: 20, lineHeight: 1, cursor: busy ? "default" : "pointer", opacity: busy ? 0.5 : 1 }}
          >
            ×
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "220px minmax(0,1fr)", minHeight: 0, flex: 1 }}>
          <aside className="directory-picker-sidebar" style={{ borderRight: "1px solid var(--border)", padding: "10px", overflow: "auto", background: "var(--bg-subtle)" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {quickLinks.places.map((place) => (
                <button
                  key={`${place.name}:${place.path}`}
                  type="button"
                  onClick={() => void navigateTo(place.path)}
                  className="directory-picker-quick-link"
                  style={{
                    width: "100%",
                    height: 30,
                    border: "none",
                    borderRadius: 6,
                    background: "none",
                    color: "var(--text-muted)",
                    fontSize: 12,
                    textAlign: "left",
                    padding: "0 8px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span aria-hidden="true">{place.name === "home" ? "⌂" : "▤"}</span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {t(`directoryPicker.place.${place.name}`)}
                  </span>
                </button>
              ))}
            </div>

            {quickLinks.recents.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div style={{ padding: "0 8px", color: "var(--text-dim)", fontSize: 11, marginBottom: 6 }}>
                  {t("directoryPicker.recentProjects")}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {quickLinks.recents.map((recentPath) => (
                    <button
                      key={recentPath}
                      type="button"
                      onClick={() => void navigateTo(recentPath)}
                      className="directory-picker-quick-link"
                      style={{
                        width: "100%",
                        height: 30,
                        border: "none",
                        borderRadius: 6,
                        background: "none",
                        color: "var(--text-muted)",
                        fontSize: 12,
                        textAlign: "left",
                        padding: "0 8px",
                        cursor: "pointer",
                      }}
                      title={recentPath}
                    >
                      <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {displayCwd(recentPath, homeDir)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {quickLinksError && (
              <div style={{ marginTop: 8, padding: "6px 8px", borderRadius: "var(--ui-radius-sm)", background: "var(--danger-soft)", color: "var(--danger)", fontSize: 11, lineHeight: 1.4 }}>
                {quickLinksError}
              </div>
            )}
          </aside>

          <section style={{ minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderBottom: "1px solid var(--border)", background: "var(--bg-panel)" }}>
              <button
                className="directory-picker-back"
                type="button"
                onClick={() => parentDirectory && void navigateTo(parentDirectory)}
                disabled={loading || (!parentDirectory && !isWindowsDriveRoot(currentPath))}
                title={t("directoryPicker.goToParent")}
                aria-label={t("directoryPicker.goToParent")}
                style={{ width: 30, height: 30, padding: 0, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, border: "1px solid var(--border-strong)", borderRadius: "var(--ui-radius-sm)", background: "var(--bg-hover)", color: "var(--text-muted)", cursor: parentDirectory ? "pointer" : "default", opacity: parentDirectory ? 1 : 0.45 }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m18 15-6-6-6 6" />
                </svg>
              </button>

              {pathEditing ? (
                <form onSubmit={handlePathSubmit} style={{ minWidth: 0, flex: 1 }}>
                  <input
                    ref={pathInputRef}
                    className="directory-picker-path"
                    type="text"
                    value={pathInput}
                    autoComplete="off"
                    spellCheck={false}
                    onChange={(event) => {
                      setPathInput(event.target.value);
                      setLoadError(null);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        event.preventDefault();
                        setPathEditing(false);
                        setPathInput(currentPath);
                      }
                    }}
                    style={{ minWidth: 0, width: "100%", height: 30, padding: "0 10px", border: "1px solid var(--border-strong)", borderRadius: "var(--ui-radius-sm)", outline: "none", background: "var(--bg)", color: "var(--text)", fontSize: 12 }}
                  />
                </form>
              ) : (
                <div style={{ minWidth: 0, flex: 1, display: "flex", alignItems: "center", gap: 5, overflowX: "auto", whiteSpace: "nowrap" }}>
                  {segments.map((segment, index) => (
                    <span key={segment.key} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                      <button
                        type="button"
                        onClick={() => void navigateTo(segment.path)}
                        className="directory-picker-breadcrumb"
                        style={{
                          border: "none",
                          background: "none",
                          color: "var(--text-muted)",
                          fontSize: 12,
                          padding: "3px 4px",
                          borderRadius: 5,
                          cursor: "pointer",
                        }}
                      >
                        {segment.label}
                      </button>
                      {index < segments.length - 1 && <span style={{ color: "var(--text-dim)", fontSize: 11 }}>/</span>}
                    </span>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  setPathEditing((prev) => !prev);
                  setPathInput(currentPath);
                }}
                title={t("directoryPicker.editPath")}
                className="directory-picker-small-btn"
                style={{
                  height: 30,
                  minWidth: 30,
                  padding: "0 7px",
                  border: "1px solid var(--border-strong)",
                  borderRadius: "var(--ui-radius-sm)",
                  background: "var(--bg-hover)",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                }}
              >
                ✏
              </button>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderBottom: "1px solid var(--border)", background: "var(--bg-subtle)" }}>
              <input
                type="text"
                value={filterText}
                onChange={(event) => setFilterText(event.target.value)}
                placeholder={t("directoryPicker.filterPlaceholder")}
                className="directory-picker-path"
                style={{ minWidth: 0, flex: 1, height: 30, padding: "0 10px", border: "1px solid var(--border-strong)", borderRadius: "var(--ui-radius-sm)", outline: "none", background: "var(--bg)", color: "var(--text)", fontSize: 12 }}
              />
              <button
                type="button"
                className="directory-picker-small-btn"
                onClick={() => setShowHidden((prev) => !prev)}
                style={{
                  height: 30,
                  padding: "0 10px",
                  border: `1px solid ${showHidden ? "var(--focus-ring)" : "var(--border-strong)"}`,
                  borderRadius: "var(--ui-radius-sm)",
                  background: showHidden ? "var(--accent-soft)" : "var(--bg-hover)",
                  color: showHidden ? "var(--accent)" : "var(--text-muted)",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                {t("directoryPicker.showHidden")}
              </button>
              <button
                type="button"
                className="directory-picker-small-btn"
                onClick={() => {
                  setCreatingFolder(true);
                  setNewFolderName("");
                  setCreateError(null);
                }}
                style={{
                  height: 30,
                  minWidth: 30,
                  padding: "0 8px",
                  border: "1px solid var(--border-strong)",
                  borderRadius: "var(--ui-radius-sm)",
                  background: "var(--bg-hover)",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  fontSize: 14,
                }}
                title={t("directoryPicker.newFolder")}
              >
                +
              </button>
            </div>

            <div className="directory-picker-list" style={{ flex: 1, minHeight: 0, overflow: "auto", padding: "8px" }}>
              {creatingFolder && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: "var(--ui-radius-sm)", border: "1px solid var(--border-strong)", background: "var(--bg-subtle)", marginBottom: 8 }}>
                  <FolderIcon />
                  <input
                    ref={createInputRef}
                    type="text"
                    value={newFolderName}
                    onChange={(event) => setNewFolderName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void handleCreateFolder();
                      }
                      if (event.key === "Escape") {
                        event.preventDefault();
                        setCreatingFolder(false);
                        setNewFolderName("");
                      }
                    }}
                    placeholder={t("directoryPicker.newFolderPlaceholder")}
                    className="directory-picker-path"
                    style={{ flex: 1, minWidth: 0, height: 28, padding: "0 8px", border: "1px solid var(--border-strong)", borderRadius: "var(--ui-radius-sm)", background: "var(--bg)", color: "var(--text)", fontSize: 12 }}
                  />
                  <button
                    type="button"
                    className="directory-picker-small-btn"
                    onClick={() => void handleCreateFolder()}
                    style={{
                      height: 28,
                      padding: "0 9px",
                      border: "1px solid var(--border-strong)",
                      borderRadius: "var(--ui-radius-sm)",
                      background: "var(--bg-hover)",
                      color: "var(--text-muted)",
                      cursor: "pointer",
                      fontSize: 12,
                    }}
                  >
                    {t("common.create")}
                  </button>
                </div>
              )}

              {loading ? (
                <div style={{ padding: 8, color: "var(--text-dim)", fontSize: 12 }}>{t("directoryPicker.loadingDirectories")}</div>
              ) : drives !== null && drives.length >= 0 && !currentPath ? (
                drives.length > 0 ? (
                  drives.map((drive) => (
                    <button
                      key={drive.path}
                      type="button"
                      onClick={() => void navigateTo(drive.path)}
                      title={drive.path}
                      style={{ width: "100%", minHeight: 34, display: "flex", alignItems: "center", gap: 7, padding: "6px 8px", border: 0, borderRadius: "var(--ui-radius-sm)", background: "none", color: "var(--text-muted)", cursor: "pointer", textAlign: "left", fontFamily: "var(--font-mono)", fontSize: 12 }}
                    >
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
                        <rect x="2" y="3" width="12" height="10" rx="1.5" />
                        <path d="M2 9h12" />
                        <circle cx="11.5" cy="11" r="0.6" fill="currentColor" stroke="none" />
                      </svg>
                      <span>{drive.name}</span>
                    </button>
                  ))
                ) : (
                  <div style={{ padding: 8, color: "var(--text-dim)", fontSize: 12 }}>{t("directoryPicker.noDrives")}</div>
                )
              ) : visibleDirectories.length > 0 ? (
                visibleDirectories.map((entry) => {
                  const active = selectedPath === entry.path;
                  return (
                    <div
                      key={entry.path}
                      className="directory-picker-entry-row"
                      style={{
                        width: "100%",
                        minHeight: 30,
                        display: "flex",
                        alignItems: "center",
                        gap: 7,
                        padding: "5px 8px",
                        borderRadius: "var(--ui-radius-sm)",
                        background: active ? "var(--accent-soft)" : "none",
                        color: active ? "var(--text)" : "var(--text-muted)",
                        fontSize: 12,
                        cursor: "pointer",
                        border: active ? "1px solid color-mix(in srgb, var(--accent) 28%, var(--border))" : "1px solid transparent",
                      }}
                      onClick={() => setSelectedPath(entry.path)}
                      onDoubleClick={() => void navigateTo(entry.path)}
                      title={entry.path}
                    >
                      <FolderIcon />
                      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.name}</span>
                      <button
                        type="button"
                        className="directory-picker-enter"
                        onClick={(event) => {
                          event.stopPropagation();
                          void navigateTo(entry.path);
                        }}
                        style={{
                          border: "none",
                          background: "none",
                          color: "var(--text-dim)",
                          fontSize: 14,
                          cursor: "pointer",
                          padding: "0 2px",
                        }}
                        title={t("directoryPicker.enterFolder")}
                      >
                        ›
                      </button>
                    </div>
                  );
                })
              ) : (
                <div style={{ padding: 8, color: "var(--text-dim)", fontSize: 12 }}>{t("directoryPicker.noSubdirectories")}</div>
              )}

              {(loadError || createError || error) && (
                <div style={{ padding: "8px", borderRadius: "var(--ui-radius-sm)", background: "var(--danger-soft)", color: "var(--danger)", fontSize: 11 }}>
                  {loadError ?? createError ?? error}
                </div>
              )}
            </div>
          </section>
        </div>

        <div className="directory-picker-footer" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexShrink: 0, padding: "10px 18px", borderTop: "1px solid var(--border)", background: "var(--bg-panel)" }}>
          <span style={{ minWidth: 0, flex: 1, color: "var(--text-dim)", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={selectedPath || currentPath}>
            {displayCwd(selectedPath || currentPath, homeDir)}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button className="directory-picker-action" type="button" onClick={onCancel} disabled={busy} style={{ padding: "6px 14px", border: "1px solid var(--border-strong)", borderRadius: "var(--ui-radius-sm)", background: "var(--bg-hover)", color: "var(--text-muted)", cursor: busy ? "default" : "pointer", fontSize: 13 }}>
              {t("sidebar.cancel")}
            </button>
            <button
              className="directory-picker-action"
              type="button"
              onClick={() => onSelect(selectedPath || currentPath)}
              disabled={busy || !currentPath}
              title={t("directoryPicker.selectCurrentDirectory")}
              style={{ padding: "6px 16px", border: "1px solid var(--accent)", borderRadius: "var(--ui-radius-sm)", background: "var(--accent)", color: "var(--text-on-accent)", fontSize: 13, fontWeight: 600, opacity: busy || !currentPath ? 0.6 : 1, cursor: busy || !currentPath ? "default" : "pointer" }}
            >
              {busy ? t("sidebar.checking") : selectLabel}
            </button>
          </div>
        </div>
      </div>
    </div>,
    portalTarget,
  );
}
