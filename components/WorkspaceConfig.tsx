"use client";

import { useEffect, useState } from "react";
import { requestJson } from "@/lib/api-client";
import type { AppSettingsResponse } from "@/lib/api-types";
import { useI18n } from "@/hooks/useI18n";
import { pickNativeDirectory } from "@/lib/native-directory-picker";

export function WorkspaceConfig({
  onClose,
}: {
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<"daily" | "fixed">("daily");
  const [path, setPath] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void requestJson<AppSettingsResponse>("/api/settings")
      .then((data) => {
        if (data.defaultCwd) {
          setMode("fixed");
          setPath(data.defaultCwd);
        } else {
          setMode("daily");
          setPath("");
        }
        setError(null);
      })
      .catch((cause) => {
        setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => setLoading(false));
  }, []);

  const handlePickDirectory = async () => {
    const result = await pickNativeDirectory();
    if (result.status === "cancelled") return;
    if (result.status === "unavailable") {
      setError(t("directoryPicker.nativeUnavailable"));
      return;
    }
    if (result.status === "error") {
      setError(t("directoryPicker.nativeFailed"));
      return;
    }

    setPath(result.path);
    setMode("fixed");
    setError(null);
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      if (mode === "fixed" && !path.trim()) {
        throw new Error(t("workspaceConfig.pathRequired"));
      }

      const payload = mode === "daily"
        ? { defaultCwd: null }
        : { defaultCwd: path.trim() };
      const data = await requestJson<AppSettingsResponse>("/api/settings", {
        method: "PUT",
        json: payload,
      });
      if (data.defaultCwd) setPath(data.defaultCwd);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

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
          if (!saving && event.target === event.currentTarget) onClose();
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="workspace-config-title"
          style={{
            width: 520,
            maxWidth: "100%",
            border: "1px solid var(--border-strong)",
            borderRadius: "var(--ui-radius-lg)",
            background: "var(--bg-elevated)",
            boxShadow: "var(--shadow-panel)",
            overflow: "hidden",
          }}
        >
          <div style={{ display: "flex", gap: 12, padding: "20px 20px 16px" }}>
            <div style={{ minWidth: 0, width: "100%" }}>
              <div
                id="workspace-config-title"
                style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}
              >
                {t("workspaceConfig.title")}
              </div>
              <div
                style={{
                  marginTop: 7,
                  fontSize: 12,
                  lineHeight: 1.6,
                  color: "var(--text-muted)",
                }}
              >
                {t("workspaceConfig.description")}
              </div>

              <div
                style={{
                  marginTop: 12,
                  padding: 12,
                  border: "1px solid var(--border-strong)",
                  borderRadius: "var(--ui-radius-md)",
                  background: "var(--bg-panel)",
                  boxShadow: "var(--shadow-subtle)",
                }}
              >
                <div style={{ fontSize: 13, color: "var(--text)", fontWeight: 600 }}>
                  {t("workspaceConfig.defaultDirectoryLabel")}
                </div>
                <div style={{ marginTop: 4, fontSize: 12, color: "var(--text-dim)" }}>
                  {t("workspaceConfig.defaultDirectoryHint")}
                </div>

                <select
                  value={mode}
                  onChange={(event) => {
                    const next = event.target.value === "fixed" ? "fixed" : "daily";
                    setMode(next);
                  }}
                  disabled={loading || saving}
                  style={{
                    marginTop: 8,
                    width: "100%",
                    height: 32,
                    padding: "0 10px",
                    border: "1px solid var(--border-strong)",
                    borderRadius: "var(--ui-radius-sm)",
                    outline: "none",
                    background: "var(--bg-elevated)",
                    color: "var(--text)",
                    fontSize: 12,
                    boxShadow: "var(--shadow-subtle)",
                    transition: "border-color var(--transition-fast), box-shadow var(--transition-fast)",
                  }}
                >
                  <option value="daily">{t("workspaceConfig.dailyTitle")}</option>
                  <option value="fixed">{t("workspaceConfig.fixedTitle")}</option>
                </select>

                {mode === "fixed" && (
                  <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                      type="text"
                      value={path}
                      onChange={(event) => setPath(event.target.value)}
                      placeholder={t("workspaceConfig.pathPlaceholder")}
                      disabled={loading || saving}
                      style={{
                        minWidth: 0,
                        flex: 1,
                        height: 32,
                        padding: "0 10px",
                        border: "1px solid var(--border-strong)",
                        borderRadius: "var(--ui-radius-sm)",
                        outline: "none",
                        background: "var(--bg-elevated)",
                        color: "var(--text)",
                        fontSize: 12,
                        boxShadow: "var(--shadow-subtle)",
                        transition: "border-color var(--transition-fast), box-shadow var(--transition-fast)",
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => void handlePickDirectory()}
                      disabled={loading || saving}
                      style={{
                        height: 32,
                        padding: "0 10px",
                        border: "1px solid var(--border-strong)",
                        borderRadius: "var(--ui-radius-sm)",
                        background: "var(--bg-elevated)",
                        color: "var(--text-muted)",
                        cursor: loading || saving ? "not-allowed" : "pointer",
                        fontSize: 12,
                        opacity: loading || saving ? 0.65 : 1,
                        boxShadow: "var(--shadow-subtle)",
                        transition: "background var(--transition-fast), border-color var(--transition-fast)",
                      }}
                    >
                      {t("workspaceConfig.browse")}
                    </button>
                  </div>
                )}
              </div>

              {error && (
                <div
                  role="alert"
                  style={{
                    marginTop: 10,
                    padding: "9px 11px",
                    border: "1px solid color-mix(in srgb, var(--danger) 28%, var(--border))",
                    borderRadius: "var(--ui-radius-sm)",
                    background: "var(--danger-soft)",
                    color: "var(--danger)",
                    fontSize: 12,
                    lineHeight: 1.5,
                  }}
                >
                  {error}
                </div>
              )}
            </div>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 8,
              padding: "11px 20px",
              borderTop: "1px solid var(--border-strong)",
              background: "var(--bg-panel)",
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              style={{
                height: 32,
                padding: "0 12px",
                border: "1px solid var(--border-strong)",
                borderRadius: "var(--ui-radius-sm)",
                background: "var(--bg-elevated)",
                color: "var(--text-muted)",
                cursor: saving ? "not-allowed" : "pointer",
                fontSize: 12,
                boxShadow: "var(--shadow-subtle)",
              }}
            >
              {t("sidebar.cancel")}
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={loading || saving}
              style={{
                height: 32,
                padding: "0 12px",
                border: "1px solid var(--accent)",
                borderRadius: "var(--ui-radius-sm)",
                background: "var(--accent)",
                color: "var(--text-on-accent)",
                cursor: loading || saving ? "wait" : "pointer",
                opacity: loading || saving ? 0.7 : 1,
                fontSize: 12,
                fontWeight: 600,
                boxShadow: "var(--shadow-subtle)",
              }}
            >
              {saving ? t("workspaceConfig.saving") : t("workspaceConfig.save")}
            </button>
          </div>
        </div>
      </div>
  );
}
