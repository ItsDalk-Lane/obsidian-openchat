"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { requestJson } from "@/lib/api-client";
import type { ModelEntry } from "@/lib/model-config";
import type {
  EnabledModelsResponse,
  EnabledModelsUpdateResponse,
  ModelsRefreshResponse,
  SelectorModelInfo,
} from "@/lib/api-types";
import { SectionTitle } from "./ModelsConfigFields";

export function modelKey(model: SelectorModelInfo): string {
  return `${model.provider}/${model.id}`;
}

/** Exact-reference match helper, case-insensitive like pi's resolver. */
export function patternMatchesModel(pattern: string, model: SelectorModelInfo): boolean {
  const normalized = pattern.trim().toLowerCase();
  const full = modelKey(model).toLowerCase();
  return normalized === full || normalized.startsWith(`${full}:`);
}

export interface ScopeGroupEntry {
  provider: string;
  models: SelectorModelInfo[];
}

function globPatternFor(providerId: string): string | null {
  // ids containing wildcard characters cannot join a "provider/*" glob
  return /[*?[\]{}]/.test(providerId) ? null : `${providerId}/*`;
}

function refList(keys: readonly string[]): string[] {
  return [...keys].sort((a, b) => a.localeCompare(b));
}

/**
 * Recompute the global selector whitelist after the user toggles which models
 * of ONE provider appear in the chat menu.
 *
 * - Every fully visible provider collapses to a `provider/*` glob, so future
 *   models keep showing up automatically (stored exact-ref lists upgrade too).
 * - Partially visible providers enumerate exact refs; hidden ones are omitted.
 * - Previous patterns that reference OTHER providers survive untouched, so a
 *   CLI-pinned `:thinkingLevel` rule never loses its pin through this editor.
 */
export function buildScopePayload(options: {
  groups: ScopeGroupEntry[];
  providerId: string;
  /** The user's checked modelKeys for the edited provider. */
  checked: Set<string>;
  previousPatterns: string[] | null;
}): string[] | null {
  const { groups, providerId, checked, previousPatterns } = options;

  const targetKeys = new Set<string>();
  let targetTotal = 0;
  for (const group of groups) {
    if (group.provider !== providerId) continue;
    for (const model of group.models) {
      targetTotal += 1;
      if (checked.has(modelKey(model))) targetKeys.add(modelKey(model));
    }
  }
  // Nothing to edit (provider without resolvable models) — keep scope as-is.
  if (targetTotal === 0) return null;
  // Unrestricted + everything checked = stay unrestricted.
  if (previousPatterns === null && targetKeys.size === targetTotal) return null;

  const parts: string[] = [];
  const targetGlob = globPatternFor(providerId);

  // Target contribution: whole-provider glob when everything is checked,
  // otherwise exact refs of what stays visible.
  const targetGlobUsable = targetGlob !== null && targetKeys.size === targetTotal;
  if (targetGlobUsable) {
    parts.push(targetGlob);
  } else if (targetKeys.size > 0) {
    parts.push(...refList([...targetKeys]));
  }

  if (previousPatterns !== null) {
    // Carry over rules that do not describe any model of the edited provider.
    const lowerProviderPrefix = `${providerId.toLowerCase()}/`;
    for (const pattern of previousPatterns) {
      const trimmed = pattern.trim().toLowerCase();
      const targetsProvider = trimmed.startsWith(lowerProviderPrefix)
        || groups.some((group) => group.provider === providerId
          && group.models.some((model) => patternMatchesModel(pattern, model)));
      if (!targetsProvider) parts.push(pattern);
    }
  } else {
    // Unrestricted baseline: every other provider is fully visible; represent
    // it as one glob so newly fetched catalog models appear automatically.
    for (const group of groups) {
      if (group.provider === providerId || group.models.length === 0) continue;
      const otherGlob = globPatternFor(group.provider);
      if (otherGlob !== null) {
        parts.push(otherGlob);
      } else {
        parts.push(...refList(group.models.map(modelKey)));
      }
    }
  }

  const deduped = new Map<string, string>();
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    deduped.set(trimmed.toLowerCase(), trimmed);
  }
  if (deduped.size === 0) return null;
  return [...deduped.values()].sort((a, b) => a.localeCompare(b));
}

/** Format a context window compactly: 1M / 1.1M / 128K / 9K / 4096. */
export function formatContextWindow(tokens: number): string {
  if (tokens >= 1_000_000) {
    const millions = Math.round(tokens / 100_000) / 10;
    return millions % 1 === 0 ? `${millions.toFixed(0)}M` : `${millions}M`;
  }
  if (tokens >= 1_000) return `${Math.round(tokens / 1000)}K`;
  return String(tokens);
}

interface ProviderModelsPanelProps {
  providerId: string;
  /** Custom entries layered onto this provider via models.json. */
  customModels: ModelEntry[];
  onEditModel: (index: number) => void;
  onAddModel: () => void;
  onDeleteModel: (index: number) => void;
}

/**
 * Per-provider model list inside the auth provider detail view: shows every
 * model the runtime resolves for this provider, toggles each row's chat-menu
 * visibility inline, and offers add-custom-model plus fetch-latest actions.
 */
export function ProviderModelsPanel({
  providerId,
  customModels,
  onEditModel,
  onAddModel,
  onDeleteModel,
}: ProviderModelsPanelProps) {
  const { t } = useI18n();
  const [allModels, setAllModels] = useState<SelectorModelInfo[]>([]);
  const [storedPatterns, setStoredPatterns] = useState<string[] | null>(null);
  const [scopeWarnings, setScopeWarnings] = useState<string[]>([]);
  /** Checked state of THIS provider's rows (modelKey set). */
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [appliedSelected, setAppliedSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  /** Transient per-provider notes from the last "fetch latest models" click. */
  const [refreshNotes, setRefreshNotes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void requestJson<EnabledModelsResponse>("/api/models/enabled")
      .then((data) => {
        if (cancelled) return;
        const models = data.allModels ?? [];
        setAllModels(models);
        setStoredPatterns(data.enabledPatterns);
        setScopeWarnings(data.warnings ?? []);

        // Seed checkbox state from the stored scope restricted to our provider.
        const ownKeys = new Set<string>();
        for (const model of models) {
          if (model.provider !== providerId) continue;
          if (!data.enabledPatterns || data.enabledPatterns.some(
            (pattern) => patternMatchesModel(pattern, model),
          )) {
            ownKeys.add(modelKey(model));
          }
        }
        setSelected(ownKeys);
        setAppliedSelected(new Set(ownKeys));
      })
      .catch((requestError) => setError(String(requestError)))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [providerId, reloadTick]);

  const ownModels = useMemo(
    () => allModels.filter((model) => model.provider === providerId),
    [allModels, providerId],
  );

  const allGroups = useMemo(() => {
    const groups: ScopeGroupEntry[] = [];
    const sorted = [...allModels].sort((a, b) => a.provider.localeCompare(b.provider)
      || a.id.localeCompare(b.id));
    for (const model of sorted) {
      const last = groups[groups.length - 1];
      if (last && last.provider === model.provider) last.models.push(model);
      else groups.push({ provider: model.provider, models: [model] });
    }
    return groups;
  }, [allModels]);

  const customIds = useMemo(() => {
    const ids = new Set<string>();
    for (const entry of customModels) {
      const id = typeof entry.id === "string" ? entry.id.trim() : "";
      if (id) ids.add(id);
    }
    return ids;
  }, [customModels]);

  const dirty = useMemo(() => (
    selected.size !== appliedSelected.size
    || [...selected].some((key) => !appliedSelected.has(key))
  ), [selected, appliedSelected]);

  const handleToggle = useCallback((key: string, nextChecked: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      if (nextChecked) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  const handleApply = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = buildScopePayload({
        groups: allGroups,
        providerId,
        checked: selected,
        previousPatterns: storedPatterns,
      });
      const result = await requestJson<EnabledModelsUpdateResponse>("/api/models/enabled", {
        method: "PUT",
        json: { patterns: payload },
      });
      setStoredPatterns(payload);
      setScopeWarnings(result.warnings ?? []);
      setAppliedSelected(new Set(selected));
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 1600);
    } catch (requestError) {
      setError(String(requestError));
    } finally {
      setSaving(false);
    }
  }, [allGroups, providerId, selected, storedPatterns]);

  // Pull the remote model catalogs so built-in providers expose newer models.
  const handleRefreshModels = useCallback(async () => {
    setRefreshing(true);
    setRefreshNotes([]);
    try {
      const result = await requestJson<ModelsRefreshResponse>("/api/models/refresh", {
        method: "POST",
        json: { provider: providerId },
      });
      if (result.failed && result.failed.length > 0) {
        setRefreshNotes(result.failed.map((entry) => `${entry.provider}: ${entry.message}`));
      }
    } catch (requestError) {
      setError(String(requestError));
    } finally {
      setRefreshing(false);
      setReloadTick((tick) => tick + 1);
    }
  }, [providerId]);

  // Clear the whole selector whitelist (every provider, not just this one).
  const handleClearRestrictions = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      await requestJson<EnabledModelsUpdateResponse>("/api/models/enabled", {
        method: "PUT",
        json: { patterns: null },
      });
      const ownAll = new Set(ownModels.map(modelKey));
      setStoredPatterns(null);
      setSelected(new Set(ownAll));
      setAppliedSelected(new Set(ownAll));
    } catch (requestError) {
      setError(String(requestError));
    } finally {
      setSaving(false);
    }
  }, [ownModels]);

  const visibleCount = selected.size;
  const isRestricted = storedPatterns !== null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{display: "flex", alignItems: "center", gap: 8}}>
          <SectionTitle>{t("i18n.providerModels")}</SectionTitle>
          <span style={{ fontSize: 10, padding: "1px 6px", background: "var(--accent-soft)", color: "var(--accent)", borderRadius: "var(--ui-radius-xs)" }}>
            {visibleCount} / {ownModels.length}
          </span>
        </div>
        {isRestricted && (
          <button
            type="button"
            onClick={() => void handleClearRestrictions()}
            disabled={saving || refreshing}
            style={{
              border: "none", background: "transparent",
              cursor: saving || refreshing ? "default" : "pointer",
              color: "var(--text-dim)", fontSize: 11,
              textDecoration: "underline", textUnderlineOffset: 2,
            }}
          >
            {t("i18n.clearAllRestrictions")}
          </button>
        )}
      </div>

      <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
        {t("i18n.visibilityToggleHint")}
      </p>

      {(scopeWarnings.length > 0 || refreshNotes.length > 0 || error) && (
        <div style={{
          margin: 0, padding: "7px 9px", borderRadius: "var(--ui-radius-sm)",
          background: error ? "var(--danger-soft)" : "var(--warning-soft)",
          color: error ? "var(--danger)" : "var(--warning)",
          fontSize: 11, lineHeight: 1.5,
        }}>
          {scopeWarnings.map((warning, i) => (
            <div key={`warn-${i}`}>{warning}</div>
          ))}
          {refreshNotes.map((note, i) => (
            <div key={`refresh-${i}`}>{t("i18n.fetchModelsNotice")}: {note}</div>
          ))}
          {error && <div>{error}</div>}
        </div>
      )}

      <div>
        {loading ? (
          <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>{t("i18n.loading")}</p>
        ) : ownModels.length === 0 ? (
          <p style={{ margin: 0, fontSize: 12, color: "var(--text-dim)" }}>{t("chat.noModels")}</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {ownModels.map((model) => {
              const key = modelKey(model);
              const customIndex = customIds.has(model.id)
                ? customModels.findIndex((entry) => entry.id === model.id)
                : -1;
              const checked = selected.has(key);
              return (
                <div
                  key={key}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "6px 2px", borderTop: "1px solid var(--border)",
                    minWidth: 0,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => handleToggle(key, event.target.checked)}
                    style={{ width: 13, height: 13, accentColor: "var(--accent)", cursor: "pointer", flexShrink: 0 }}
                  />
                  <span style={{ fontSize: 12, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 1, minWidth: 0 }}>
                    {model.name || model.id}
                  </span>
                  {customIds.has(model.id) && (
                    <span style={{ fontSize: 9, padding: "1px 4px", background: "var(--accent-soft)", color: "var(--accent)", borderRadius: "var(--ui-radius-xs)", flexShrink: 0 }}>
                      {t("i18n.custom")}
                    </span>
                  )}
                  {model.reasoning && (
                    <span
                      title="推理思考"
                      style={{ fontSize: 9, padding: "1px 4px", background: "var(--bg-hover)", color: "var(--text-muted)", borderRadius: "var(--ui-radius-xs)", flexShrink: 0 }}
                    >
                      思考
                    </span>
                  )}
                  {Array.isArray(model.input) && model.input.includes("image") && (
                    <span
                      title="图像输入"
                      style={{ fontSize: 9, padding: "1px 4px", background: "var(--bg-hover)", color: "var(--text-muted)", borderRadius: "var(--ui-radius-xs)", flexShrink: 0 }}
                    >
                      图像
                    </span>
                  )}
                  {typeof model.contextWindow === "number" && (
                    <span
                      title={`上下文窗口 ${model.contextWindow}`}
                      style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-dim)", flexShrink: 0 }}
                    >
                      {formatContextWindow(model.contextWindow)}
                    </span>
                  )}
                  <span style={{ width: 48, flexShrink: 0 }} />
                  {customIndex >= 0 && (
                    <>
                      <button
                        type="button"
                        onClick={() => onEditModel(customIndex)}
                        aria-label={t("common.edit")}
                        title={t("common.edit")}
                        style={{ width: 22, height: 22, padding: 0, border: "none", background: "transparent", color: "var(--text-dim)", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 3, flexShrink: 0 }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = "var(--accent)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-dim)"; }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 20h9" />
                          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteModel(customIndex)}
                        aria-label={t("i18n.remove")}
                        title={t("i18n.remove")}
                        style={{ width: 22, height: 22, padding: 0, border: "none", background: "transparent", color: "var(--text-dim)", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 3, flexShrink: 0 }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = "var(--danger)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-dim)"; }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button
          className="pi-toolbar-button"
          type="button"
          onClick={onAddModel}
          style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            padding: "6px 12px", background: "var(--bg-elevated)",
            border: "1px dashed var(--border)", borderRadius: "var(--ui-radius-sm)",
            color: "var(--text-muted)", cursor: "pointer", fontSize: 12,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--accent)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-muted)"; }}
        >
          + {t("i18n.newModelShort")}
        </button>
        {dirty && (
          <button
            className="pi-send-button"
            type="button"
            onClick={() => void handleApply()}
            disabled={saving}
            style={{
              position: "relative",
              padding: "6px 16px",
              minWidth: 92,
              background: savedOk ? "var(--success)" : "var(--accent)",
              border: "none",
              borderRadius: "var(--ui-radius-sm)",
              color: "var(--text-on-accent)",
              cursor: saving ? "default" : "pointer",
              fontSize: 13,
              fontWeight: 600,
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
              animation: savedOk ? "saved-pop 0.45s ease" : undefined,
            }}
          >
            {savedOk && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
                style={{ strokeDasharray: 18, animation: "saved-check-draw 0.35s ease forwards", flexShrink: 0 }}>
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
            <span>{savedOk ? t("i18n.saved") : saving ? t("i18n.saving") : t("i18n.apply")}</span>
          </button>
        )}
        <button
          className="pi-toolbar-button"
          type="button"
          onClick={() => void handleRefreshModels()}
          disabled={loading || refreshing || saving}
          style={{
            marginLeft: "auto",
            display: "inline-flex", alignItems: "center", gap: 5,
            padding: "6px 12px", background: "var(--bg)",
            border: "1px solid var(--border)", borderRadius: "var(--ui-radius-sm)",
            color: "var(--text-muted)",
            cursor: loading || refreshing || saving ? "not-allowed" : "pointer",
            opacity: refreshing ? 0.75 : 1,
            fontSize: 12,
          }}
        >
          {refreshing ? (
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" style={{ animation: "spin 0.8s linear infinite", flexShrink: 0 }} aria-hidden="true">
              <path d="M21 12a9 9 0 1 1-2.64-6.36" />
            </svg>
          ) : (
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 12a9 9 0 1 1-2.64-6.36" />
              <polyline points="21 3 21 9 15 9" />
            </svg>
          )}
          <span>{refreshing ? t("i18n.fetchingModels") : t("i18n.fetchLatestModels")}</span>
        </button>
      </div>
    </div>
  );
}
