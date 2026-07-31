"use client";

import { useEffect } from "react";
import { useI18n } from "@/hooks/useI18n";

/**
 * Choice dialog shown when deleting a session that has forked branch
 * sessions: delete only this session (branches are re-attached to its
 * parent), or delete it together with the whole branch subtree.
 */
export function DeleteSessionDialog({
  title,
  branchCount,
  busy,
  onDeleteOnly,
  onDeleteAll,
  onCancel,
}: {
  title: string;
  branchCount: number;
  busy: boolean;
  onDeleteOnly: () => void;
  onDeleteAll: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onCancel]);

  return (
    <div
      role="presentation"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        background: "rgba(0,0,0,0.4)",
      }}
      onClick={(event) => {
        if (!busy && event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-session-dialog-title"
        style={{
          width: 440,
          maxWidth: "100%",
          border: "1px solid var(--border)",
          borderRadius: 8,
          background: "var(--bg-panel)",
          boxShadow: "0 12px 36px rgba(0,0,0,0.24)",
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", gap: 12, padding: "18px 18px 14px" }}>
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#ef4444"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            style={{ flexShrink: 0, marginTop: 1 }}
          >
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6M14 11v6" />
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
          </svg>
          <div style={{ minWidth: 0 }}>
            <div
              id="delete-session-dialog-title"
              style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}
            >
              {t("sidebar.deleteBranchTitle")}
            </div>
            <div
              style={{
                marginTop: 7,
                fontSize: 12,
                lineHeight: 1.6,
                color: "var(--text-muted)",
              }}
            >
              {t("sidebar.deleteBranchBody", {
                title: `${title.slice(0, 40)}${title.length > 40 ? "…" : ""}`,
                count: branchCount,
              })}
            </div>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            padding: "10px 18px",
            borderTop: "1px solid var(--border)",
          }}
        >
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            style={{
              height: 32,
              padding: "0 12px",
              border: "1px solid var(--border)",
              borderRadius: 5,
              background: "transparent",
              color: "var(--text-muted)",
              cursor: busy ? "not-allowed" : "pointer",
              fontSize: 12,
            }}
          >
            {t("sidebar.cancel")}
          </button>
          <button
            type="button"
            onClick={onDeleteOnly}
            disabled={busy}
            style={{
              height: 32,
              padding: "0 12px",
              border: "1px solid var(--border)",
              borderRadius: 5,
              background: "transparent",
              color: "var(--text)",
              cursor: busy ? "wait" : "pointer",
              opacity: busy ? 0.7 : 1,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {t("sidebar.deleteOnlyThis")}
          </button>
          <button
            type="button"
            onClick={onDeleteAll}
            disabled={busy}
            style={{
              height: 32,
              padding: "0 12px",
              border: "1px solid #ef4444",
              borderRadius: 5,
              background: "#ef4444",
              color: "white",
              cursor: busy ? "wait" : "pointer",
              opacity: busy ? 0.7 : 1,
              fontSize: 12,
              fontWeight: 600,
              whiteSpace: "nowrap",
            }}
          >
            {t("sidebar.deleteWithBranches", { count: branchCount })}
          </button>
        </div>
      </div>
    </div>
  );
}
