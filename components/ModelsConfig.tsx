"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useI18n } from "@/hooks/useI18n";
import { requestJson } from "@/lib/api-client";
import type {
  ApiKeyProviderInfo as ApiKeyProvider,
  ApiKeyProvidersResponse,
  EnabledModelsResponse,
  EnabledModelsUpdateResponse,
  OAuthProviderInfo as OAuthProvider,
  OAuthProvidersResponse,
  SuccessResponse,
} from "@/lib/api-types";
import {
  hasDeepseekCompat,
  setDeepseekCompat,
  type ModelEntry,
  type ModelsJson,
  type ProviderEntry,
} from "@/lib/model-config";
import { ProviderModelsPanel } from "./models-config/ModelVisibilityPanel";
import { ModelConnectionTest } from "./models-config/ModelConnectionTest";
import {
  ApiKeyDetail as ApiKeyDetailPanel,
  OAuthDetail as OAuthDetailPanel,
} from "./models-config/ModelsAuthDetails";
import {
  Check,
  Field,
  NumInput,
  SecretTextInput,
  SectionTitle,
  Select,
  TextInput,
} from "./models-config/ModelsConfigFields";
import { ProviderIcon } from "./models-config/ProviderIcon";

// ── Types ─────────────────────────────────────────────────────────────────────

type Selection =
  | { type: "provider"; name: string }
  | { type: "model"; providerName: string; index: number }
  | { type: "oauth"; providerId: string }
  | { type: "apikey"; providerId: string }
  | { type: "authModel"; section: "oauth" | "apikey"; providerName: string; index: number };

const API_OPTIONS = ["openai-completions", "openai-responses", "anthropic-messages", "google-generative-ai"] as const;

// ── Provider detail ───────────────────────────────────────────────────────────

function ProviderDetail({ name, provider, onChange, onRename, onDelete }: {
  name: string; provider: ProviderEntry;
  onChange: (p: ProviderEntry) => void; onRename: (n: string) => void; onDelete: () => void;
}) {
  const { t } = useI18n();
  const [editingName, setEditingName] = useState(name);
  useEffect(() => setEditingName(name), [name]);
  const set = <K extends keyof ProviderEntry>(k: K, v: ProviderEntry[K]) => onChange({ ...provider, [k]: v });

  useEffect(() => {
    if (!provider.api) onChange({ ...provider, api: "openai-completions" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider.api]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 16, border: "1px solid var(--border)", borderRadius: "var(--ui-radius-md)", background: "var(--bg-elevated)", boxShadow: "var(--shadow-subtle)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <SectionTitle>{t("i18n.provider")}</SectionTitle>
        <button className="pi-sidebar-action is-danger" onClick={onDelete}
          style={{ padding: "3px 8px", background: "var(--bg)", border: "1px solid color-mix(in srgb, var(--danger) 36%, var(--border))", borderRadius: "var(--ui-radius-xs)", color: "var(--danger)", cursor: "pointer", fontSize: 11 }}>
          {t("i18n.delete")}
        </button>
      </div>

      <Field label={t("i18n.providerName")}>
        <TextInput value={editingName} onChange={setEditingName} placeholder="provider-name" mono />
        {editingName !== name && editingName.trim() && (
          <button className="pi-send-button" onClick={() => onRename(editingName.trim())}
            style={{ marginTop: 4, padding: "3px 10px", background: "var(--accent)", border: "none", borderRadius: "var(--ui-radius-xs)", color: "var(--text-on-accent)", cursor: "pointer", fontSize: 11, alignSelf: "flex-start" }}>
            {t("i18n.rename")}
          </button>
        )}
      </Field>

      <Field label="基础 URL">
        <TextInput value={provider.baseUrl ?? ""} onChange={(v) => set("baseUrl", v || undefined)}
          placeholder="https://api.example.com/v1" mono />
      </Field>

      <Field label="API 密钥">
        <SecretTextInput value={provider.apiKey ?? ""} onChange={(v) => set("apiKey", v || undefined)}
          placeholder="ENV_VAR_NAME, !shell-command, or literal key" mono />
        <span style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 2 }}>
          前缀加上 <code style={{ fontFamily: "var(--font-mono)" }}>!</code> 可运行 shell 命令，或使用环境变量名
        </span>
      </Field>

      <Field label="API">
        <Select value={provider.api ?? "openai-completions"} onChange={(v) => set("api", v)} options={API_OPTIONS} required />
      </Field>
    </div>
  );
}

// ── ThinkingLevelMap editor ───────────────────────────────────────────────────

const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
type ThinkingLevel = typeof THINKING_LEVELS[number];

const LEVEL_COLORS: Record<ThinkingLevel, string> = {
  off:     "var(--text-dim)",
  minimal: "var(--text-muted)",
  low:     "var(--accent)",
  medium:  "var(--accent)",
  high:    "var(--warning)",
  xhigh:   "var(--warning)",
  max:     "var(--danger)",
};

function ThinkingLevelMapEditor({
  value,
  onChange,
}: {
  value: Record<string, string | null> | undefined;
  onChange: (v: Record<string, string | null> | undefined) => void;
}) {
  const map = value ?? {};

  const setLevel = (level: ThinkingLevel, entry: string | null | "omit") => {
    const next = { ...map };
    if (entry === "omit") {
      delete next[level];
    } else {
      next[level] = entry;
    }
    onChange(Object.keys(next).length ? next : undefined);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {THINKING_LEVELS.map((level) => {
        const raw = map[level];
        const state: "omit" | "null" | "string" =
          !(level in map) ? "omit" : raw === null ? "null" : "string";
        const strVal = typeof raw === "string" ? raw : "";
        const color = LEVEL_COLORS[level];

        const btnBase: React.CSSProperties = {
          padding: "4px 10px",
          fontSize: 10,
          border: "none",
          cursor: "pointer",
          fontWeight: 400,
          transition: "background 0.1s, color 0.1s",
          whiteSpace: "nowrap",
          background: "var(--bg-elevated)",
          color: "var(--text-dim)",
        };
        const btnActive: React.CSSProperties = {
          background: "var(--accent)",
          color: "var(--text-on-accent)",
          fontWeight: 600,
        };
        const btnActiveDisabled: React.CSSProperties = {
          background: "var(--danger)",
          color: "var(--text-on-accent)",
          fontWeight: 600,
        };

        return (
          <div
            key={level}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "5px 4px",
              borderRadius: "var(--ui-radius-sm)",
              background: "var(--bg-subtle)",
              border: "1px solid color-mix(in srgb, var(--border) 72%, transparent)",
            }}
          >
            {/* Level badge */}
            <div style={{ display: "flex", alignItems: "center", gap: 5, width: 68, flexShrink: 0 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0, opacity: state === "null" ? 0.3 : 1 }} />
              <span style={{
                fontSize: 11,
                fontFamily: "var(--font-mono)",
                color: state === "null" ? "var(--text-dim)" : "var(--text-muted)",
                textDecoration: state === "null" ? "line-through" : "none",
              }}>
                {level}
              </span>
            </div>

            {/* Default + Disabled buttons */}
            <div style={{ display: "flex", borderRadius: "var(--ui-radius-sm)", border: "1px solid var(--border)", overflow: "hidden", flexShrink: 0 }}>
              <button
                onClick={() => setLevel(level, "omit")}
                style={{ ...btnBase, ...(state === "omit" ? btnActive : {}) }}
              >
                默认
              </button>
              <button
                onClick={() => setLevel(level, null)}
                style={{ ...btnBase, borderLeft: "1px solid var(--border)", ...(state === "null" ? btnActiveDisabled : {}) }}
              >
                已禁用
              </button>
            </div>

            {/* Custom button + input fused */}
            <div style={{ display: "flex", borderRadius: "var(--ui-radius-sm)", border: `1px solid ${state === "string" ? "var(--accent)" : "var(--border)"}`, overflow: "hidden", transition: "border-color 0.1s" }}>
              <button
                onClick={() => setLevel(level, strVal || level)}
                style={{ ...btnBase, ...(state === "string" ? btnActive : {}), borderRight: "1px solid var(--border)", flexShrink: 0 }}
              >
                自定义
              </button>
              <input
                value={strVal}
                onChange={(e) => setLevel(level, e.target.value)}
                onFocus={() => { if (state !== "string") setLevel(level, strVal || level); }}
                placeholder={level}
                maxLength={10}
                style={{
                  width: "12ch",
                  background: state === "string" ? "var(--bg)" : "var(--bg-elevated)",
                  border: "none",
                  outline: "none",
                  color: state === "string" ? "var(--text)" : "var(--text-dim)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  padding: "4px 7px",
                  transition: "background 0.1s, color 0.1s",
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Model detail ──────────────────────────────────────────────────────────────

function ModelDetail({
  providerName,
  provider,
  model,
  onChange,
  onDelete,
}: {
  providerName: string;
  provider: ProviderEntry;
  model: ModelEntry;
  onChange: (m: ModelEntry) => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  const set = <K extends keyof ModelEntry>(k: K, v: ModelEntry[K]) => onChange({ ...model, [k]: v });
  const costVal = (k: keyof NonNullable<ModelEntry["cost"]>) => model.cost?.[k] !== undefined ? String(model.cost[k]) : "";
  const setCost = (k: keyof NonNullable<ModelEntry["cost"]>, v: string) => {
    const n = parseFloat(v);
    onChange({ ...model, cost: { ...(model.cost ?? {}), [k]: isNaN(n) ? undefined : n } });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 16, border: "1px solid var(--border)", borderRadius: "var(--ui-radius-md)", background: "var(--bg-elevated)", boxShadow: "var(--shadow-subtle)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <SectionTitle>{t("i18n.model")}</SectionTitle>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <ModelConnectionTest providerName={providerName} provider={provider} model={model} />
          <button className="pi-sidebar-action is-danger" onClick={onDelete}
            style={{ height: 24, padding: "0 8px", background: "var(--bg)", border: "1px solid color-mix(in srgb, var(--danger) 36%, var(--border))", borderRadius: "var(--ui-radius-xs)", color: "var(--danger)", cursor: "pointer", fontSize: 11, boxSizing: "border-box" }}>
            {t("i18n.remove")}
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="ID *"><TextInput value={model.id} onChange={(v) => set("id", v)} placeholder="model-id" mono /></Field>
        <Field label="名称"><TextInput value={model.name ?? ""} onChange={(v) => set("name", v || undefined)} placeholder="显示名称" /></Field>
      </div>

      <Field label="API 覆盖">
        <Select value={model.api ?? ""} onChange={(v) => set("api", v || undefined)} options={API_OPTIONS} />
      </Field>

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
        <Check label="推理 / 思考" checked={model.reasoning ?? false} onChange={(v) => set("reasoning", v || undefined)} />
        <Check label="图像输入" checked={model.input?.includes("image") ?? false}
          onChange={(v) => set("input", v ? ["text", "image"] : undefined)} />
      </div>

      {model.reasoning && (
        <>
          <Check
            label="DeepSeek 思考兼容"
            checked={hasDeepseekCompat(model)}
            onChange={(v) => onChange(setDeepseekCompat(model, v))}
          />
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <SectionTitle>思考级别映射</SectionTitle>
              {model.thinkingLevelMap && (
                <button
                  className="pi-toolbar-button"
                  onClick={() => set("thinkingLevelMap", undefined)}
                  style={{ fontSize: 10, padding: "2px 7px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "var(--ui-radius-xs)", color: "var(--text-dim)", cursor: "pointer" }}
                >
                  全部清除
                </button>
              )}
            </div>
            <ThinkingLevelMapEditor
              value={model.thinkingLevelMap}
              onChange={(v) => set("thinkingLevelMap", v)}
            />
          </div>
        </>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="上下文窗口 (tokens)">
          <NumInput value={model.contextWindow !== undefined ? String(model.contextWindow) : ""}
            onChange={(v) => set("contextWindow", v ? parseInt(v) : undefined)} placeholder="128000" />
        </Field>
        <Field label="最大输出 tokens">
          <NumInput value={model.maxTokens !== undefined ? String(model.maxTokens) : ""}
            onChange={(v) => set("maxTokens", v ? parseInt(v) : undefined)} placeholder="16384" />
        </Field>
      </div>

      <div>
        <SectionTitle>成本 (每百万 tokens)</SectionTitle>
        <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
          {(["input", "output", "cacheRead", "cacheWrite"] as const).map((k) => (
            <Field key={k} label={k}>
              <NumInput value={costVal(k)} onChange={(v) => setCost(k, v)} placeholder="0" />
            </Field>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Auth provider row (built-in provider with expandable custom models) ───────

/**
 * Left-tree row for an authenticated built-in provider (OAuth / API key).
 * The models live in the detail pane; the row itself stays a plain entry.
 */
function AuthProviderRow({
  providerId,
  displayName,
  selected,
  onSelectMain,
}: {
  providerId: string;
  displayName: string;
  selected: boolean;
  onSelectMain: () => void;
}) {
  return (
    <div
      onClick={onSelectMain}
      style={{ display: "flex", alignItems: "center", gap: 7, padding: "5px 8px", borderRadius: 5, cursor: "pointer", background: selected ? "var(--bg-selected)" : "none" }}
      onMouseEnter={(e) => { if (!selected) e.currentTarget.style.background = "var(--bg-hover)"; }}
      onMouseLeave={(e) => { if (!selected) e.currentTarget.style.background = "none"; }}
    >
      <ProviderIcon id={providerId} size={16} />
      <span style={{ fontSize: 12, color: "var(--text)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displayName}</span>
    </div>
  );
}

// ── Add provider picker ───────────────────────────────────────────────────────

interface AddProviderPickerProps {
  oauthProviders: OAuthProvider[];
  apiKeyProviders: ApiKeyProvider[];
  onSelectOAuth: (id: string) => void;
  onSelectApiKey: (id: string) => void;
  onAddCustom: () => void;
  onClose: () => void;
}

function AddProviderPicker({
  oauthProviders, apiKeyProviders,
  onSelectOAuth, onSelectApiKey, onAddCustom, onClose,
}: AddProviderPickerProps) {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 30); }, []);

  const q = search.trim().toLowerCase();

  const availableOAuth = oauthProviders.filter((p) => !p.loggedIn && (!q || p.name.toLowerCase().includes(q)));
  const availableApiKey = apiKeyProviders.filter((p) => !p.configured && (!q || p.displayName.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)));
  const showCustom = !q || "custom".includes(q) || "openai-compatible".includes(q) || "anthropic-compatible".includes(q);

  const totalCount = availableOAuth.length + availableApiKey.length + (showCustom ? 1 : 0);

  const cardStyle: React.CSSProperties = {
    display: "flex", flexDirection: "row", alignItems: "center", gap: 8,
    padding: "10px 12px",
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderRadius: "var(--ui-radius-md)",
    boxSizing: "border-box",
    cursor: "pointer",
    minWidth: 0,
    textAlign: "left",
    transition: "border-color var(--transition-fast), background var(--transition-fast), box-shadow var(--transition-fast)",
    width: "100%",
    boxShadow: "var(--shadow-subtle)",
  };



  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ width: 820, maxWidth: "calc(100vw - 32px)", maxHeight: "min(72vh, calc(100vh - 32px))", background: "var(--bg)", border: "1px solid var(--border-strong)", borderRadius: "var(--ui-radius-lg)", display: "flex", flexDirection: "column", boxShadow: "var(--shadow-panel)", overflow: "hidden" }}>
        {/* Search */}
        <div style={{ padding: "11px 14px", borderBottom: "1px solid var(--border)", background: "var(--bg-elevated)", flexShrink: 0, display: "flex", alignItems: "center", gap: 8, boxShadow: "inset 0 -1px 0 var(--border)" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--text-dim)", flexShrink: 0 }}>
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            className="focus-visible:outline-2 focus-visible:outline-focus-ring focus-visible:outline-offset-1"
            ref={inputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
            placeholder={t("i18n.searchProviders")}
            style={{ flex: 1, background: "transparent", border: "none", borderRadius: "var(--ui-radius-xs)", color: "var(--text)", fontSize: 13, boxSizing: "border-box" }}
          />
        </div>

        {/* Card grid */}
        <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>
          {totalCount === 0 ? (
            <div style={{ padding: "20px 0", fontSize: 12, color: "var(--text-dim)", textAlign: "center" }}>{t("i18n.noProviders")}</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(240px, 100%), 1fr))", gap: 8 }}>
              {showCustom && (
                <div style={{ gridColumn: "1 / -1", fontSize: 10, fontWeight: 600, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.07em" }}>{t("i18n.custom")}</div>
              )}
              {showCustom && (
                <button
                  className="focus-visible:outline-2 focus-visible:outline-focus-ring focus-visible:outline-offset-1"
                  onClick={() => { onAddCustom(); onClose(); }}
                  style={cardStyle}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.background = "var(--bg-hover)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "var(--bg-elevated)"; }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>OpenAI / Anthropic 兼容</div>
                    <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 2 }}>{t("i18n.customEndpoint")}</div>
                  </div>
                  <span style={{ width: 26, height: 26, borderRadius: 5, background: "var(--bg-hover)", border: "1px dashed var(--border)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--text-dim)" }}>
                      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  </span>
                </button>
              )}

              {availableOAuth.length > 0 && (
                <div style={{ gridColumn: "1 / -1", paddingTop: showCustom ? 6 : 0, fontSize: 10, fontWeight: 600, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.07em" }}>{t("i18n.subscriptions")}</div>
              )}
              {availableOAuth.map((p) => (
                <button className="focus-visible:outline-2 focus-visible:outline-focus-ring focus-visible:outline-offset-1" key={p.id} onClick={() => { onSelectOAuth(p.id); onClose(); }}
                  style={cardStyle}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.background = "var(--bg-hover)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "var(--bg-elevated)"; }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                    <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 2 }}>OAuth</div>
                  </div>
                  <ProviderIcon id={p.id} size={28} />
                </button>
              ))}

              {availableApiKey.length > 0 && (
                <div style={{ gridColumn: "1 / -1", paddingTop: availableOAuth.length > 0 ? 6 : 0, fontSize: 10, fontWeight: 600, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.07em" }}>API 密钥</div>
              )}
              {availableApiKey.map((p) => (
                <button className="focus-visible:outline-2 focus-visible:outline-focus-ring focus-visible:outline-offset-1" key={p.id} onClick={() => { onSelectApiKey(p.id); onClose(); }}
                  style={cardStyle}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.background = "var(--bg-hover)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "var(--bg-elevated)"; }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.displayName}</div>
                    <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 2 }}>{p.modelCount} 个模型</div>
                  </div>
                  <ProviderIcon id={p.id} size={28} />
                </button>
              ))}

            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ModelsConfig({ onClose }: { onClose: () => void }) {
  const isMobile = useIsMobile();
  const { t } = useI18n();
  const [config, setConfig] = useState<ModelsJson>({ providers: {} });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [oauthProviders, setOauthProviders] = useState<OAuthProvider[]>([]);
  const [apiKeyProviders, setApiKeyProviders] = useState<ApiKeyProvider[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  const loadOAuthProviders = useCallback(() => {
    void requestJson<OAuthProvidersResponse>("/api/auth/providers")
      .then((d) => {
        // Guard against a malformed payload that would otherwise wipe the list
        // and render an empty provider dropdown. Upstream guard: #586d72e.
        if (Array.isArray(d.providers)) setOauthProviders(d.providers);
      })
      .catch(() => {});
  }, []);

  const loadApiKeyProviders = useCallback(() => {
    void requestJson<ApiKeyProvidersResponse>("/api/auth/all-providers")
      .then((d) => {
        if (Array.isArray(d.providers)) setApiKeyProviders(d.providers);
      })
      .catch(() => {});
  }, []);

  // A dual-auth provider moves between the two lists when its credential type
  // changes, so any auth change has to reload both — refreshing only one leaves
  // the provider rendered twice, and disconnecting the stale row would delete
  // the credential that was just created (#309).
  const refreshAuthProviders = useCallback(() => {
    loadOAuthProviders();
    loadApiKeyProviders();
  }, [loadOAuthProviders, loadApiKeyProviders]);

  useEffect(() => {
    void requestJson<ModelsJson>("/api/models-config")
      .then((d) => {
        const normalized = d.providers ? d : { ...d, providers: {} };
        setConfig(normalized);
        const keys = Object.keys(normalized.providers ?? {});
        if (keys.length > 0) setSelection({ type: "provider", name: keys[0] });
      })
      .catch(() => setConfig({ providers: {} }))
      .finally(() => setLoading(false));
    refreshAuthProviders();
  }, [refreshAuthProviders]);

  const addCustomProvider = useCallback(() => {
    let finalName = "new-provider";
    let n = 1;
    while (config.providers?.[finalName]) finalName = `new-provider-${n++}`;
    setConfig((prev) => ({ ...prev, providers: { ...(prev.providers ?? {}), [finalName]: { api: "openai-completions" } } }));
    setSelection({ type: "provider", name: finalName });
  }, [config.providers]);

  const updateProvider = useCallback((name: string, p: ProviderEntry) => {
    setConfig((prev) => ({ ...prev, providers: { ...(prev.providers ?? {}), [name]: p } }));
  }, []);

  const renameProvider = useCallback((oldName: string, newName: string) => {
    setConfig((prev) => {
      const entries = Object.entries(prev.providers ?? {});
      const idx = entries.findIndex(([k]) => k === oldName);
      if (idx === -1) return prev;
      entries[idx] = [newName, entries[idx][1]];
      return { ...prev, providers: Object.fromEntries(entries) };
    });
    setSelection((prev) => {
      if (!prev) return prev;
      if (prev.type === "provider" && prev.name === oldName) return { type: "provider", name: newName };
      if (prev.type === "model" && prev.providerName === oldName) return { ...prev, providerName: newName };
      return prev;
    });
  }, []);

  const deleteProvider = useCallback((name: string) => {
    setConfig((prev) => {
      const providers = { ...(prev.providers ?? {}) };
      delete providers[name];
      return { ...prev, providers };
    });
    setConfig((prev) => {
      const remaining = Object.keys(prev.providers ?? {});
      setSelection(remaining.length > 0 ? { type: "provider", name: remaining[0] } : null);
      return prev;
    });
  }, []);

  const addModel = useCallback((providerName: string) => {
    setConfig((prev) => {
      const provider = prev.providers?.[providerName] ?? {};
      const models = [...(provider.models ?? []), { id: "" }];
      return { ...prev, providers: { ...(prev.providers ?? {}), [providerName]: { ...provider, models } } };
    });
    setConfig((prev) => {
      const idx = (prev.providers?.[providerName]?.models?.length ?? 1) - 1;
      setSelection({ type: "model", providerName, index: idx });
      return prev;
    });
  }, []);

  const updateModel = useCallback((providerName: string, index: number, m: ModelEntry) => {
    setConfig((prev) => {
      const provider = prev.providers?.[providerName] ?? {};
      const models = [...(provider.models ?? [])];
      models[index] = m;
      return { ...prev, providers: { ...(prev.providers ?? {}), [providerName]: { ...provider, models } } };
    });
  }, []);

  const removeModel = useCallback((providerName: string, index: number) => {
    setConfig((prev) => {
      const provider = prev.providers?.[providerName] ?? {};
      const models = [...(provider.models ?? [])];
      models.splice(index, 1);
      return { ...prev, providers: { ...(prev.providers ?? {}), [providerName]: { ...provider, models: models.length ? models : undefined } } };
    });
    setSelection({ type: "provider", name: providerName });
  }, []);

  // Built-in (OAuth / API-key authenticated) providers extend their built-in
  // model list via models.json upserts under the same provider id: new ids are
  // appended, same ids override. Auth stays whatever the SDK already resolved.
  const updateAuthModel = useCallback((providerName: string, index: number, m: ModelEntry) => {
    setConfig((prev) => {
      const provider = prev.providers?.[providerName] ?? {};
      const models = [...(provider.models ?? [])];
      models[index] = m;
      return { ...prev, providers: { ...(prev.providers ?? {}), [providerName]: { ...provider, models } } };
    });
  }, []);

  const addAuthModel = useCallback((section: "oauth" | "apikey", providerName: string) => {
    const models = [...(config.providers?.[providerName]?.models ?? []), { id: "" }];
    setConfig((prev) => ({
      ...prev,
      providers: {
        ...(prev.providers ?? {}),
        [providerName]: { ...(prev.providers?.[providerName] ?? {}), models },
      },
    }));
    setSelection({ type: "authModel", section, providerName, index: models.length - 1 });
  }, [config.providers]);

  const removeAuthModel = useCallback((section: "oauth" | "apikey", providerName: string, index: number) => {
    setConfig((prev) => {
      const existing = prev.providers?.[providerName];
      if (!existing?.models) return prev;
      const models = [...existing.models];
      if (index < 0 || index >= models.length) return prev;
      models.splice(index, 1);
      const providers = { ...(prev.providers ?? {}) };
      if (models.length > 0) {
        providers[providerName] = { ...existing, models };
        return { ...prev, providers };
      }
      // Last custom model gone: an entry holding nothing else would make the
      // SDK provider composer throw, so collapse to real fields or drop it.
      const rest = { ...existing };
      delete rest.models;
      if (Object.keys(rest).length === 0) delete providers[providerName];
      else providers[providerName] = rest;
      return { ...prev, providers };
    });
    setSelection({ type: section, providerId: providerName });
  }, []);

  // Adding models here should make them selectable right away. When a
  // selector whitelist is active, merge every model defined below into it so
  // new entries never require a separate trip to the visibility editor.
  const syncModelsIntoScope = useCallback(async () => {
    try {
      const scope = await requestJson<EnabledModelsResponse>("/api/models/enabled");
      if (!scope.enabledPatterns) return; // unrestricted: nothing to sync

      const definedRefs: string[] = [];
      for (const [providerId, provider] of Object.entries(config.providers ?? {})) {
        for (const model of provider.models ?? []) {
          const id = model.id.trim();
          if (id) definedRefs.push(`${providerId}/${id}`);
        }
      }
      const existing = new Set(scope.enabledPatterns.map((pattern) => pattern.toLowerCase()));
      const missing = definedRefs.filter((ref) => !existing.has(ref.toLowerCase()));
      if (missing.length === 0) return;

      await requestJson<EnabledModelsUpdateResponse>("/api/models/enabled", {
        method: "PUT",
        json: {
          patterns: [...scope.enabledPatterns, ...missing].sort((a, b) => a.localeCompare(b)),
        },
      });
    } catch {
      // Scope sync is best-effort polish — never blocks the main save.
    }
  }, [config]);

  // Saving writes models.json, then closes the panel on success; AppShell's
  // modelsRefreshKey bump lets the chat selector pick up changes right away.
  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await requestJson<SuccessResponse>("/api/models-config", {
        method: "PUT",
        json: config,
      });
      await syncModelsIntoScope();
      onClose();
    } catch (e) {
      setSaveError(String(e));
      setSaving(false);
    }
  }, [config, onClose, syncModelsIntoScope]);

  const providers = Object.entries(config.providers ?? {});
  const activeOAuth = oauthProviders.filter((p) => p.loggedIn);
  const activeApiKey = apiKeyProviders.filter((p) => p.configured);

  // Resolve current detail
  const detailContent = (() => {
    if (!selection) return null;
    const columnStyle = { display: "flex", flexDirection: "column", gap: 16 } as const;
    if (selection.type === "oauth") {
      const p = oauthProviders.find((entry) => entry.id === selection.providerId);
      if (!p) return null;
      return (
        <div key={`oauth-${p.id}`} style={columnStyle}>
          <OAuthDetailPanel provider={p} onRefresh={refreshAuthProviders} />
          <ProviderModelsPanel
            providerId={p.id}
            customModels={config.providers?.[p.id]?.models ?? []}
            onEditModel={(index) => setSelection({
              type: "authModel", section: "oauth", providerName: p.id, index,
            })}
            onAddModel={() => addAuthModel("oauth", p.id)}
            onDeleteModel={(index) => removeAuthModel("oauth", p.id, index)}
          />
        </div>
      );
    }
    if (selection.type === "apikey") {
      const p = apiKeyProviders.find((entry) => entry.id === selection.providerId);
      if (!p) return null;
      return (
        <div key={`apikey-${p.id}`} style={columnStyle}>
          <ApiKeyDetailPanel provider={p} onRefresh={refreshAuthProviders} />
          <ProviderModelsPanel
            providerId={p.id}
            customModels={config.providers?.[p.id]?.models ?? []}
            onEditModel={(index) => setSelection({
              type: "authModel", section: "apikey", providerName: p.id, index,
            })}
            onAddModel={() => addAuthModel("apikey", p.id)}
            onDeleteModel={(index) => removeAuthModel("apikey", p.id, index)}
          />
        </div>
      );
    }
    if (selection.type === "authModel") {
      const provider = config.providers?.[selection.providerName] ?? {};
      const model = provider.models?.[selection.index];
      if (!model) return null;
      return (
        <ModelDetail
          key={`auth-${selection.providerName}-${selection.index}`}
          providerName={selection.providerName}
          provider={provider}
          model={model}
          onChange={(m) => updateAuthModel(selection.providerName, selection.index, m)}
          onDelete={() => removeAuthModel(selection.section, selection.providerName, selection.index)}
        />
      );
    }
    if (selection.type === "provider") {
      const provider = config.providers?.[selection.name];
      if (!provider) return null;
      return (
        <ProviderDetail
          key={selection.name}
          name={selection.name}
          provider={provider}
          onChange={(p) => updateProvider(selection.name, p)}
          onRename={(n) => renameProvider(selection.name, n)}
          onDelete={() => deleteProvider(selection.name)}
        />
      );
    }
    const provider = config.providers?.[selection.providerName];
    const model = provider?.models?.[selection.index];
    if (!model) return null;
    return (
      <ModelDetail
        key={`${selection.providerName}-${selection.index}`}
        providerName={selection.providerName}
        provider={provider}
        model={model}
        onChange={(m) => updateModel(selection.providerName, selection.index, m)}
        onDelete={() => removeModel(selection.providerName, selection.index)}
      />
    );
  })();

  return (
    <>
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ width: isMobile ? "calc(100vw - 16px)" : 860, maxWidth: "calc(100vw - 16px)", height: isMobile ? "calc(100dvh - 16px)" : "78vh", maxHeight: "calc(100dvh - 16px)", background: "var(--bg)", border: "1px solid var(--border-strong)", borderRadius: "var(--ui-radius-lg)", display: "flex", flexDirection: "column", boxShadow: "var(--shadow-panel)", overflow: "hidden" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 18px", borderBottom: "1px solid var(--border)", background: "var(--bg-elevated)", boxShadow: "inset 0 -1px 0 var(--border)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>{t("common.models")}</span>
            <code style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>~/.pi/agent/models.json</code>
          </div>
          <button className="pi-toolbar-button" onClick={onClose} style={{ background: "transparent", border: "none", borderRadius: "var(--ui-radius-xs)", color: "var(--text-muted)", cursor: "pointer", fontSize: 20, lineHeight: 1, padding: "2px 6px" }}>×</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, display: "flex", flexDirection: isMobile ? "column" : "row", overflow: "hidden" }}>

          {/* Left: tree */}
          <div style={{
            width: isMobile ? "100%" : 210,
            maxHeight: isMobile ? "40vh" : undefined,
            borderRight: isMobile ? "none" : "1px solid var(--border)",
            borderBottom: isMobile ? "1px solid var(--border)" : "none",
            display: "flex", flexDirection: "column", flexShrink: 0, background: "var(--bg-panel)",
          }}>
            <div style={{ flex: 1, overflowY: "auto", padding: "8px 6px" }}>
              {/* Active OAuth subscriptions */}
              {activeOAuth.map((p) => (
                <AuthProviderRow
                  key={p.id}
                  providerId={p.id}
                  displayName={p.name}
                  selected={selection?.type === "oauth" && selection.providerId === p.id}
                  onSelectMain={() => setSelection({ type: "oauth", providerId: p.id })}
                />
              ))}

              {/* Active API key providers */}
              {activeApiKey.map((p) => (
                <AuthProviderRow
                  key={p.id}
                  providerId={p.id}
                  displayName={p.displayName}
                  selected={selection?.type === "apikey" && selection.providerId === p.id}
                  onSelectMain={() => setSelection({ type: "apikey", providerId: p.id })}
                />
              ))}

              {/* Divider before custom providers, only when there are active managed providers */}
              {(activeOAuth.length > 0 || activeApiKey.length > 0) && providers.length > 0 && (
                <div style={{ margin: "4px 8px", borderTop: "1px solid var(--border)" }} />
              )}

              {/* Custom providers */}
              {loading ? (
                <div style={{ padding: "10px 8px", fontSize: 12, color: "var(--text-muted)" }}>{t("i18n.loading")}</div>
              ) : providers.map(([pName, pData]) => {
                const isProviderSelected = selection?.type === "provider" && selection.name === pName;
                const models = pData.models ?? [];
                return (
                  <div key={pName} style={{ marginBottom: 2 }}>
                    {/* Provider row */}
                    <div
                      onClick={() => setSelection({ type: "provider", name: pName })}
                      style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 8px", borderRadius: 5, cursor: "pointer", background: isProviderSelected ? "var(--bg-selected)" : "none" }}
                      onMouseEnter={(e) => { if (!isProviderSelected) e.currentTarget.style.background = "var(--bg-hover)"; }}
                      onMouseLeave={(e) => { if (!isProviderSelected) e.currentTarget.style.background = "none"; }}
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--text-dim)", flexShrink: 0 }}>
                        <rect x="4" y="4" width="16" height="16" rx="2" /><rect x="9" y="9" width="6" height="6" />
                        <line x1="9" y1="1" x2="9" y2="4" /><line x1="15" y1="1" x2="15" y2="4" />
                        <line x1="9" y1="20" x2="9" y2="23" /><line x1="15" y1="20" x2="15" y2="23" />
                        <line x1="20" y1="9" x2="23" y2="9" /><line x1="20" y1="14" x2="23" y2="14" />
                        <line x1="1" y1="9" x2="4" y2="9" /><line x1="1" y1="14" x2="4" y2="14" />
                      </svg>
                      <span style={{ fontSize: 12, fontWeight: isProviderSelected ? 600 : 400, color: "var(--text)", fontFamily: "var(--font-mono)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {pName}
                      </span>
                    </div>

                    {/* Model rows */}
                    {models.map((m, i) => {
                      const isModelSelected = selection?.type === "model" && selection.providerName === pName && selection.index === i;
                      return (
                        <div
                          key={i}
                          onClick={() => setSelection({ type: "model", providerName: pName, index: i })}
                          style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 8px 5px 26px", borderRadius: 5, cursor: "pointer", background: isModelSelected ? "var(--bg-selected)" : "none" }}
                          onMouseEnter={(e) => { if (!isModelSelected) e.currentTarget.style.background = "var(--bg-hover)"; }}
                          onMouseLeave={(e) => { if (!isModelSelected) e.currentTarget.style.background = "none"; }}
                        >
                          <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: m.id ? "var(--text-muted)" : "var(--text-dim)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {m.id || t("i18n.newModel")}
                          </span>
                          {m.reasoning && (
                            <span style={{ fontSize: 9, padding: "1px 4px", background: "var(--accent-soft)", color: "var(--accent)", borderRadius: "var(--ui-radius-xs)", flexShrink: 0 }}>T</span>
                          )}
                        </div>
                      );
                    })}

                    {/* Add model button */}
                    <div
                      onClick={(e) => { e.stopPropagation(); addModel(pName); }}
                      style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 8px 4px 26px", borderRadius: 5, cursor: "pointer", color: "var(--text-dim)" }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = "var(--accent)"; e.currentTarget.style.background = "var(--bg-hover)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-dim)"; e.currentTarget.style.background = "none"; }}
                    >
                      <span style={{ fontSize: 11 }}>+ 模型</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Add provider */}
            <div style={{ borderTop: "1px solid var(--border)", padding: "8px 6px" }}>
              <button className="pi-toolbar-button" onClick={() => setPickerOpen(true)} style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                width: "100%", padding: "6px 0", background: "var(--bg-elevated)", border: "1px dashed var(--border)", borderRadius: "var(--ui-radius-sm)",
                color: "var(--text-muted)", cursor: "pointer", fontSize: 12,
              }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--accent)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-muted)"; }}
              >
                + {t("i18n.addProvider")}
              </button>
            </div>
          </div>

          {/* Right: detail */}
          <div style={{ flex: 1, overflowY: "auto", padding: 20, background: "var(--bg)" }}>
            {loading ? null : detailContent ?? (
              <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-dim)", fontSize: 13 }}>
                {t("i18n.selectProviderModel")}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10, padding: "10px 18px", borderTop: "1px solid var(--border)", background: "var(--bg-elevated)", flexShrink: 0 }}>
          {saveError && <span style={{ padding: "6px 8px", borderRadius: "var(--ui-radius-sm)", background: "var(--danger-soft)", color: "var(--danger)", fontSize: 12, flex: 1 }}>{saveError}</span>}
          <button className="pi-toolbar-button" onClick={onClose} style={{ padding: "6px 14px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "var(--ui-radius-sm)", color: "var(--text-muted)", cursor: "pointer", fontSize: 13 }}>
            {t("i18n.cancel")}
          </button>
          <button className="pi-send-button" onClick={handleSave} disabled={saving} style={{
            position: "relative",
            padding: "6px 16px",
            minWidth: 92,
            background: saving ? "var(--bg-hover)" : "var(--accent)",
            border: "none", borderRadius: "var(--ui-radius-sm)",
            color: saving ? "var(--text-muted)" : "var(--text-on-accent)",
            cursor: saving ? "default" : "pointer", fontSize: 13, fontWeight: 600,
            display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
            transition: "background-color 0.2s ease, color 0.2s ease",
          }}>
            {saving && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" style={{ animation: "spin 0.8s linear infinite", flexShrink: 0 }} aria-hidden="true">
                <path d="M21 12a9 9 0 1 1-2.64-6.36" />
              </svg>
            )}
            <span>{saving ? t("i18n.saving") : t("i18n.save")}</span>
          </button>
        </div>
      </div>
    </div>
    {pickerOpen && (
      <AddProviderPicker
        oauthProviders={oauthProviders}
        apiKeyProviders={apiKeyProviders}
        onSelectOAuth={(id) => setSelection({ type: "oauth", providerId: id })}
        onSelectApiKey={(id) => setSelection({ type: "apikey", providerId: id })}
        onAddCustom={addCustomProvider}
        onClose={() => setPickerOpen(false)}
      />
    )}
    </>
  );
}
