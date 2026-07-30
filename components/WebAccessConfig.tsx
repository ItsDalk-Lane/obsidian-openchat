"use client";

import { useCallback, useEffect, useState } from "react";
import { useIsMobile } from "@/hooks/useIsMobile";
import { requestJson } from "@/lib/api-client";
import type {
  WebAccessApiKeyField,
  WebAccessConfig as WebAccessManagedConfig,
} from "@/lib/web-access-config";

const API_KEY_FIELDS = [
  "openaiApiKey",
  "braveApiKey",
  "exaApiKey",
  "tavilyApiKey",
  "parallelApiKey",
  "perplexityApiKey",
  "geminiApiKey",
  "tinyfishApiKey",
  "serpdiveApiKey",
  "anysearchApiKey",
] as const satisfies readonly WebAccessApiKeyField[];

interface WebAccessResponse {
  success?: boolean;
  config: WebAccessManagedConfig;
  path: string;
}

interface FormState {
  apiKeys: Record<WebAccessApiKeyField, string>;
  provider: string;
  searxngBaseUrl: string;
  webSearchEnabled: boolean;
  workflow: string;
}

const API_KEY_LABELS: Record<WebAccessApiKeyField, string> = {
  openaiApiKey: "OpenAI API Key",
  braveApiKey: "Brave API Key",
  exaApiKey: "Exa API Key",
  tavilyApiKey: "Tavily API Key",
  parallelApiKey: "Parallel API Key",
  perplexityApiKey: "Perplexity API Key",
  geminiApiKey: "Gemini API Key",
  tinyfishApiKey: "TinyFish API Key",
  serpdiveApiKey: "SERPdive API Key",
  anysearchApiKey: "AnySearch API Key",
};

const PROVIDERS = [
  "auto",
  "all",
  "openai",
  "brave",
  "parallel",
  "tinyfish",
  "tavily",
  "searxng",
  "exa",
  "perplexity",
  "gemini",
  "serpdive",
  "anysearch",
] as const;

const WORKFLOWS = ["none", "summary-review", "auto-summary"] as const;

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "7px 9px",
  fontSize: 12,
  fontFamily: "var(--font-mono)",
  background: "var(--bg)",
  color: "var(--text)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  outline: "none",
};

const labelStyle: React.CSSProperties = {
  display: "grid",
  gap: 5,
  minWidth: 0,
  fontSize: 11,
  fontWeight: 600,
  color: "var(--text-muted)",
};

function textValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function emptyApiKeys(): Record<WebAccessApiKeyField, string> {
  return Object.fromEntries(
    API_KEY_FIELDS.map((field) => [field, ""]),
  ) as Record<WebAccessApiKeyField, string>;
}

function formFromConfig(config: WebAccessManagedConfig): FormState {
  const apiKeys = emptyApiKeys();
  for (const field of API_KEY_FIELDS) {
    apiKeys[field] = textValue(config[field]);
  }
  return {
    apiKeys,
    provider: textValue(config.provider),
    searxngBaseUrl: textValue(config.searxngBaseUrl),
    webSearchEnabled: typeof config.webSearch?.enabled === "boolean"
      ? config.webSearch.enabled
      : true,
    workflow: textValue(config.workflow),
  };
}

function shortenPath(path: string): string {
  return path
    .replace(/^\/(?:Users|home)\/[^/]+/, "~")
    .replace(/^[A-Za-z]:\\Users\\[^\\]+/, "~");
}

export function WebAccessConfig({
  sessionId,
  onClose,
  onReloaded,
}: {
  sessionId: string | null;
  onClose: () => void;
  onReloaded?: () => void;
}) {
  const isMobile = useIsMobile();
  const [form, setForm] = useState<FormState>(() => ({
    apiKeys: emptyApiKeys(),
    provider: "",
    searxngBaseUrl: "",
    webSearchEnabled: true,
    workflow: "",
  }));
  const [loadedConfig, setLoadedConfig] = useState<WebAccessManagedConfig>({});
  const [path, setPath] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await requestJson<WebAccessResponse>("/api/web-access");
      setLoadedConfig(response.config);
      setForm(formFromConfig(response.config));
      setPath(response.path);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(async () => {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const config: WebAccessManagedConfig = {
        webSearch: { enabled: form.webSearchEnabled },
      };
      for (const field of API_KEY_FIELDS) {
        if (form.apiKeys[field] || Object.hasOwn(loadedConfig, field)) {
          config[field] = form.apiKeys[field];
        }
      }
      for (const [field, value] of [
        ["provider", form.provider],
        ["searxngBaseUrl", form.searxngBaseUrl],
        ["workflow", form.workflow],
      ] as const) {
        if (value || Object.hasOwn(loadedConfig, field)) config[field] = value;
      }

      const response = await requestJson<WebAccessResponse>("/api/web-access", {
        method: "PUT",
        json: { config, sessionId: sessionId ?? undefined },
      });
      setLoadedConfig(response.config);
      setForm(formFromConfig(response.config));
      setPath(response.path);
      setSaved(true);
      onReloaded?.();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(false);
    }
  }, [form, loadedConfig, onReloaded, sessionId]);

  const providerOptions = PROVIDERS.includes(form.provider as (typeof PROVIDERS)[number])
    || !form.provider
    ? PROVIDERS
    : [form.provider, ...PROVIDERS];
  const workflowOptions = WORKFLOWS.includes(form.workflow as (typeof WORKFLOWS)[number])
    || !form.workflow
    ? WORKFLOWS
    : [form.workflow, ...WORKFLOWS];

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0,0,0,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: isMobile ? "calc(100vw - 16px)" : 760,
          maxWidth: "calc(100vw - 16px)",
          height: isMobile ? "calc(100dvh - 16px)" : "80vh",
          maxHeight: "calc(100dvh - 16px)",
          background: "var(--bg)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "12px 18px",
            borderBottom: "1px solid var(--border)",
            flexShrink: 0,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>
              联网工具配置
            </div>
            {path && (
              <code
                title={path}
                style={{
                  display: "block",
                  marginTop: 3,
                  fontSize: 10,
                  color: "var(--text-dim)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {shortenPath(path)}
              </code>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭联网工具配置"
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              fontSize: 20,
              lineHeight: 1,
              padding: "2px 6px",
            }}
          >
            ×
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: isMobile ? 14 : 18 }}>
          {loading ? (
            <div style={{ color: "var(--text-muted)", fontSize: 12 }}>加载中…</div>
          ) : (
            <div style={{ display: "grid", gap: 18 }}>
              <section style={{ display: "grid", gap: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
                  搜索行为
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))",
                    gap: 12,
                  }}
                >
                  <label style={labelStyle}>
                    默认搜索服务
                    <select
                      value={form.provider}
                      onChange={(event) => setForm((current) => ({
                        ...current,
                        provider: event.target.value,
                      }))}
                      style={inputStyle}
                    >
                      <option value="">插件默认（自动选择）</option>
                      {providerOptions.map((provider) => (
                        <option key={provider} value={provider}>{provider}</option>
                      ))}
                    </select>
                  </label>
                  <label style={labelStyle}>
                    搜索流程
                    <select
                      value={form.workflow}
                      onChange={(event) => setForm((current) => ({
                        ...current,
                        workflow: event.target.value,
                      }))}
                      style={inputStyle}
                    >
                      <option value="">插件默认</option>
                      {workflowOptions.map((workflow) => (
                        <option key={workflow} value={workflow}>{workflow}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <label style={labelStyle}>
                  SearXNG 地址
                  <input
                    value={form.searxngBaseUrl}
                    onChange={(event) => setForm((current) => ({
                      ...current,
                      searxngBaseUrl: event.target.value,
                    }))}
                    placeholder="https://search.example.com"
                    style={inputStyle}
                  />
                </label>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    padding: "9px 10px",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    color: "var(--text)",
                    fontSize: 12,
                  }}
                >
                  注册网页搜索工具
                  <input
                    type="checkbox"
                    checked={form.webSearchEnabled}
                    onChange={(event) => setForm((current) => ({
                      ...current,
                      webSearchEnabled: event.target.checked,
                    }))}
                  />
                </label>
              </section>

              <section style={{ display: "grid", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
                    搜索服务密钥
                  </div>
                  <div style={{ marginTop: 3, fontSize: 10, color: "var(--text-dim)" }}>
                    已保存的值显示为掩码；保持掩码再保存不会覆盖原值。`$VAR` 与 `!command` 会按字面保存。
                  </div>
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))",
                    gap: 12,
                  }}
                >
                  {API_KEY_FIELDS.map((field) => (
                    <label key={field} style={labelStyle}>
                      {API_KEY_LABELS[field]}
                      <input
                        type="password"
                        autoComplete="off"
                        value={form.apiKeys[field]}
                        onChange={(event) => setForm((current) => ({
                          ...current,
                          apiKeys: {
                            ...current.apiKeys,
                            [field]: event.target.value,
                          },
                        }))}
                        placeholder="未配置"
                        style={inputStyle}
                      />
                    </label>
                  ))}
                </div>
              </section>

              <div
                style={{
                  padding: "9px 10px",
                  borderRadius: 6,
                  background: "var(--bg-panel)",
                  color: "var(--text-dim)",
                  fontSize: 10,
                  lineHeight: 1.5,
                }}
              >
                GitHub 克隆、视频处理、域名规则和网络访问保护等高级设置不会在这里改动，请继续在上方配置文件中维护。
              </div>
            </div>
          )}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "10px 18px",
            borderTop: "1px solid var(--border)",
            flexShrink: 0,
          }}
        >
          <div style={{ minHeight: 16, fontSize: 11 }}>
            {error ? (
              <span style={{ color: "#f87171" }}>{error}</span>
            ) : saved ? (
              <span style={{ color: "#22c55e" }}>已保存</span>
            ) : null}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "7px 14px",
                borderRadius: 6,
                border: "1px solid var(--border)",
                background: "var(--bg)",
                color: "var(--text-muted)",
                cursor: "pointer",
              }}
            >
              关闭
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={loading || saving}
              style={{
                padding: "7px 14px",
                borderRadius: 6,
                border: "1px solid var(--accent)",
                background: "var(--accent)",
                color: "white",
                cursor: loading || saving ? "wait" : "pointer",
                opacity: loading || saving ? 0.65 : 1,
              }}
            >
              {saving ? "保存中…" : "保存"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
