"use client";

import { useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { PathLabel } from "./SidebarPrimitives";

/**
 * One project row inside the sidebar project dropdown. Hovering reveals a
 * trash action that deletes every session of the project (session records
 * only — files on disk are kept); the row then swaps to an inline confirm.
 */
export function ProjectRow({
  project,
  label,
  selected,
  sessionCount,
  onSelect,
  onDelete,
}: {
  project: string;
  label: string;
  selected: boolean;
  sessionCount: number;
  onSelect: () => void;
  onDelete: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [hovered, setHovered] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await onDelete();
    } catch {
      setDeleting(false);
      setConfirming(false);
    }
  };

  if (confirming) {
    return (
      <div
        style={{
          padding: "8px 10px",
          borderBottom: "1px solid var(--border)",
          background: "rgba(239,68,68,0.06)",
        }}
      >
        <div style={{ fontSize: 11, color: "var(--text)", lineHeight: 1.5 }}>
          {t("sidebar.deleteProjectConfirm", { count: sessionCount })}
        </div>
        <div style={{ marginTop: 2, fontSize: 10, color: "var(--text-dim)", lineHeight: 1.5 }}>
          {t("sidebar.deleteProjectNote")}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 6 }}>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={deleting}
            style={{
              padding: "3px 9px",
              background: "var(--bg-hover)",
              border: "1px solid var(--border)",
              borderRadius: 5,
              color: "var(--text-muted)",
              fontSize: 11,
              cursor: deleting ? "not-allowed" : "pointer",
              flexShrink: 0,
            }}
          >
            {t("sidebar.cancel")}
          </button>
          <button
            type="button"
            onClick={() => void handleDelete()}
            disabled={deleting}
            style={{
              padding: "3px 9px",
              background: "#ef4444",
              border: "none",
              borderRadius: 5,
              color: "#fff",
              fontSize: 11,
              fontWeight: 600,
              cursor: deleting ? "wait" : "pointer",
              opacity: deleting ? 0.7 : 1,
              flexShrink: 0,
            }}
          >
            {t("sidebar.delete")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ display: "flex", alignItems: "center", borderBottom: "1px solid var(--border)" }}
    >
      <button
        type="button"
        onClick={onSelect}
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          alignItems: "center",
          gap: 7,
          padding: "8px 10px",
          background: "var(--bg)",
          border: "none",
          color: selected ? "var(--text)" : "var(--text-muted)",
          cursor: "pointer",
          textAlign: "left",
          fontSize: 11,
          fontFamily: "var(--font-mono)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={project}
      >
        {selected ? (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <polyline points="1.5 5 4 7.5 8.5 2.5" />
          </svg>
        ) : (
          <span style={{ width: 10, flexShrink: 0 }} />
        )}
        <PathLabel text={label} style={{ flex: 1 }} />
      </button>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setConfirming(true);
        }}
        title={t("sidebar.deleteProject")}
        aria-label={t("sidebar.deleteProject")}
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
          opacity: hovered ? 1 : 0,
          transition: "color 0.12s, background 0.12s, opacity 0.12s",
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
    </div>
  );
}
