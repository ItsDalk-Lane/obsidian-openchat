"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { requestJson } from "@/lib/api-client";
import type {
  ApiKeyProviderInfo,
  AuthActionResponse,
  OAuthProviderInfo,
  SuccessResponse,
} from "@/lib/api-types";
import { Field, SecretTextInput, SectionTitle } from "./ModelsConfigFields";
import { useI18n } from "@/hooks/useI18n";

type OAuthLoginState =
  | { phase: "idle" }
  | { phase: "connecting" }
  | { phase: "auth"; url: string; instructions: string | null; token: string }
  | { phase: "device_code"; userCode: string; verificationUri: string; intervalSeconds: number | null; expiresInSeconds: number | null }
  | { phase: "prompt"; message: string; placeholder: string | null; token: string }
  | { phase: "select"; message: string; options: { id: string; label: string }[]; token: string }
  | { phase: "progress"; message: string }
  | { phase: "success" }
  | { phase: "error"; message: string };

export function OAuthDetail({
  provider,
  onRefresh,
}: {
  provider: OAuthProviderInfo;
  onRefresh: () => void;
}) {
  const { t } = useI18n();
  const [loginState, setLoginState] = useState<OAuthLoginState>({ phase: "idle" });
  const [inputValue, setInputValue] = useState("");
  const eventSourceRef = useRef<EventSource | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (loginState.phase === "auth" || loginState.phase === "prompt") {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [loginState.phase]);

  useEffect(() => {
    setLoginState({ phase: "idle" });
    setInputValue("");
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
  }, [provider.id]);

  useEffect(() => {
    return () => { eventSourceRef.current?.close(); };
  }, []);

  const handleLogin = useCallback(() => {
    eventSourceRef.current?.close();
    setLoginState({ phase: "connecting" });
    setInputValue("");

    const eventSource = new EventSource(`/api/auth/login/${encodeURIComponent(provider.id)}`);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data) as {
        type: string;
        url?: string;
        instructions?: string | null;
        token?: string;
        message?: string;
        placeholder?: string | null;
        userCode?: string;
        verificationUri?: string;
        intervalSeconds?: number | null;
        expiresInSeconds?: number | null;
        options?: { id: string; label: string }[];
      };
      if (data.type === "auth") {
        setLoginState({ phase: "auth", url: data.url!, instructions: data.instructions ?? null, token: data.token! });
        window.open(data.url!, "_blank", "noopener,noreferrer");
      } else if (data.type === "device_code") {
        setLoginState({
          phase: "device_code",
          userCode: data.userCode!,
          verificationUri: data.verificationUri!,
          intervalSeconds: data.intervalSeconds ?? null,
          expiresInSeconds: data.expiresInSeconds ?? null,
        });
        window.open(data.verificationUri!, "_blank", "noopener,noreferrer");
      } else if (data.type === "prompt_request") {
        setLoginState({ phase: "prompt", message: data.message!, placeholder: data.placeholder ?? null, token: data.token! });
      } else if (data.type === "select_request") {
        setLoginState({ phase: "select", message: data.message!, options: data.options ?? [], token: data.token! });
      } else if (data.type === "progress") {
        setLoginState({ phase: "progress", message: data.message! });
      } else if (data.type === "success") {
        eventSource.close();
        setLoginState({ phase: "success" });
        onRefresh();
      } else if (data.type === "error") {
        eventSource.close();
        setLoginState({ phase: "error", message: data.message! });
      } else if (data.type === "cancelled") {
        eventSource.close();
        setLoginState({ phase: "idle" });
      }
    };
    eventSource.onerror = () => {
      eventSource.close();
      setLoginState((current) => current.phase === "success"
        ? current
        : { phase: "error", message: t("i18n.notConnected") });
    };
  }, [provider.id, onRefresh, t]);

  const handleLogout = useCallback(async () => {
    try {
      await requestJson<AuthActionResponse>(
        `/api/auth/logout/${encodeURIComponent(provider.id)}`,
        { method: "POST" },
      );
      setLoginState({ phase: "idle" });
      onRefresh();
    } catch (error) {
      setLoginState({ phase: "error", message: error instanceof Error ? error.message : t("i18n.networkError") });
    }
  }, [provider.id, onRefresh, t]);

  const submitCode = useCallback(async (token: string, code: string) => {
    if (!code.trim()) return;
    setLoginState({ phase: "progress", message: t("i18n.checking") });
    try {
      await requestJson<AuthActionResponse>(`/api/auth/login/${encodeURIComponent(provider.id)}`, {
        method: "POST",
        json: { token, code: code.trim() },
      });
      setInputValue("");
    } catch (error) {
      setLoginState({ phase: "error", message: error instanceof Error ? error.message : t("i18n.networkError") });
    }
  }, [provider.id, t]);

  const submitSelection = useCallback(async (token: string, value: string) => {
    setLoginState({ phase: "progress", message: t("i18n.continuing") });
    try {
      await requestJson<AuthActionResponse>(`/api/auth/login/${encodeURIComponent(provider.id)}`, {
        method: "POST",
        json: { token, code: value },
      });
    } catch (error) {
      setLoginState({ phase: "error", message: error instanceof Error ? error.message : t("i18n.networkError") });
    }
  }, [provider.id, t]);

  const isWorking = loginState.phase === "connecting"
    || loginState.phase === "progress"
    || loginState.phase === "auth"
    || loginState.phase === "device_code"
    || loginState.phase === "prompt"
    || loginState.phase === "select";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 16, border: "1px solid var(--border)", borderRadius: "var(--ui-radius-md)", background: "var(--bg-elevated)", boxShadow: "var(--shadow-subtle)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <SectionTitle>{t("i18n.subscription")}</SectionTitle>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: provider.loggedIn ? "var(--success)" : "var(--border-strong)", display: "inline-block" }} />
          <span style={{ fontSize: 11, color: provider.loggedIn ? "var(--success)" : "var(--text-dim)" }}>
            {provider.loggedIn ? t("i18n.connected") : t("i18n.notConnected")}
          </span>
        </div>
      </div>

      <div style={{ minHeight: 48 }}>
        {loginState.phase === "idle" && (
          <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
            {provider.loggedIn ? "已连接。您可以重新登录或断开连接。" : `连接您的 ${provider.name} 账户。`}
          </p>
        )}
        {loginState.phase === "connecting" && (
          <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>{t("i18n.openingBrowser")}</p>
        )}
        {loginState.phase === "select" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
              {loginState.message}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {loginState.options.map((option) => (
                <button
                  className="pi-toolbar-button"
                  key={option.id}
                  onClick={() => submitSelection(loginState.token, option.id)}
                  style={{ padding: "7px 9px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "var(--ui-radius-sm)", color: "var(--text)", cursor: "pointer", fontSize: 12, textAlign: "left" }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {(loginState.phase === "auth" || loginState.phase === "prompt") && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
              {loginState.phase === "auth"
                ? "请在浏览器中完成登录，然后从地址栏复制重定向 URL 并粘贴到下方。"
                : loginState.message}
            </p>
            {loginState.phase === "auth" && (
              <p style={{ margin: 0, fontSize: 11, color: "var(--text-dim)", lineHeight: 1.5 }}>
                如果浏览器窗口未打开，{" "}
                <a href={loginState.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", wordBreak: "break-all" }}>
                  点击此处打开登录页面
                </a>
                。
              </p>
            )}
            <div style={{ display: "flex", gap: 6 }}>
              <input
                className="focus-visible:outline-2 focus-visible:outline-focus-ring focus-visible:outline-offset-1"
                ref={inputRef}
                value={inputValue}
                onChange={(event) => setInputValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") submitCode(loginState.token, inputValue);
                }}
                placeholder={loginState.phase === "auth"
                  ? "http://localhost:1455/auth/callback?code=…"
                  : (loginState.placeholder ?? "输入值…")}
                style={{ flex: 1, padding: "7px 9px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "var(--ui-radius-sm)", color: "var(--text)", fontSize: 12, fontFamily: "var(--font-mono)", boxSizing: "border-box" }}
              />
              <button
                className="pi-send-button"
                onClick={() => submitCode(loginState.token, inputValue)}
                disabled={!inputValue.trim()}
                style={{ padding: "6px 12px", background: inputValue.trim() ? "var(--accent)" : "var(--bg-hover)", border: "none", borderRadius: "var(--ui-radius-sm)", color: inputValue.trim() ? "var(--text-on-accent)" : "var(--text-dim)", cursor: inputValue.trim() ? "pointer" : "not-allowed", fontSize: 12, fontWeight: 600, flexShrink: 0 }}
              >
                {t("i18n.submit")}
              </button>
            </div>
          </div>
        )}
        {loginState.phase === "device_code" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
              打开验证页面并输入此代码：
            </p>
            <div style={{ padding: "9px 11px", background: "var(--bg)", border: "1px solid var(--border-strong)", borderRadius: "var(--ui-radius-sm)", color: "var(--text)", fontSize: 16, fontWeight: 700, fontFamily: "var(--font-mono)", letterSpacing: 0, boxShadow: "var(--shadow-subtle)" }}>
              {loginState.userCode}
            </div>
            <p style={{ margin: 0, fontSize: 11, color: "var(--text-dim)", lineHeight: 1.5 }}>
              <a href={loginState.verificationUri} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", wordBreak: "break-all" }}>
                {loginState.verificationUri}
              </a>
              {loginState.expiresInSeconds ? ` ${Math.ceil(loginState.expiresInSeconds / 60)} 分钟后过期。` : ""}
            </p>
          </div>
        )}
        {loginState.phase === "progress" && (
          <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>{loginState.message}</p>
        )}
        {loginState.phase === "success" && (
          <p style={{ margin: 0, padding: "7px 9px", borderRadius: "var(--ui-radius-sm)", background: "var(--success-soft)", color: "var(--success)", fontSize: 12 }}>{t("i18n.connectedSuccessfully")}</p>
        )}
        {loginState.phase === "error" && (
          <p style={{ margin: 0, padding: "7px 9px", borderRadius: "var(--ui-radius-sm)", background: "var(--danger-soft)", color: "var(--danger)", fontSize: 12 }}>{loginState.message}</p>
        )}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        {isWorking ? (
          <button
            className="pi-toolbar-button"
            onClick={() => {
              eventSourceRef.current?.close();
              setLoginState({ phase: "idle" });
            }}
            style={{ padding: "5px 12px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "var(--ui-radius-sm)", color: "var(--text-muted)", cursor: "pointer", fontSize: 12 }}
          >
            {t("i18n.cancel")}
          </button>
        ) : (
          <>
            <button
              className="pi-send-button"
              onClick={handleLogin}
              style={{ padding: "5px 14px", background: "var(--accent)", border: "none", borderRadius: "var(--ui-radius-sm)", color: "var(--text-on-accent)", cursor: "pointer", fontSize: 12, fontWeight: 600 }}
            >
              {provider.loggedIn ? t("i18n.relogin") : t("i18n.login")}
            </button>
            {provider.loggedIn && (
              <button
                className="pi-sidebar-action is-danger"
                onClick={handleLogout}
                style={{ padding: "5px 12px", background: "var(--bg)", border: "1px solid color-mix(in srgb, var(--danger) 36%, var(--border))", borderRadius: "var(--ui-radius-sm)", color: "var(--danger)", cursor: "pointer", fontSize: 12 }}
              >
                {t("i18n.disconnect")}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function ApiKeyDetail({
  provider,
  onRefresh,
}: {
  provider: ApiKeyProviderInfo;
  onRefresh: () => void;
}) {
  const { t } = useI18n();
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState(false);

  useEffect(() => {
    setApiKey("");
    setError(null);
    setSavedOk(false);
  }, [provider.id]);

  const handleSave = useCallback(async () => {
    if (!apiKey.trim()) return;
    setSaving(true);
    setError(null);
    setSavedOk(false);
    try {
      await requestJson<SuccessResponse>(`/api/auth/api-key/${encodeURIComponent(provider.id)}`, {
        method: "POST",
        json: { apiKey: apiKey.trim() },
      });
      setApiKey("");
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 2000);
      onRefresh();
    } catch (requestError) {
      setError(String(requestError));
    } finally {
      setSaving(false);
    }
  }, [apiKey, provider.id, onRefresh]);

  const handleRemove = useCallback(async () => {
    setRemoving(true);
    setError(null);
    try {
      await requestJson<SuccessResponse>(
        `/api/auth/api-key/${encodeURIComponent(provider.id)}`,
        { method: "DELETE" },
      );
      onRefresh();
    } catch (requestError) {
      setError(String(requestError));
    } finally {
      setRemoving(false);
    }
  }, [provider.id, onRefresh]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 16, border: "1px solid var(--border)", borderRadius: "var(--ui-radius-md)", background: "var(--bg-elevated)", boxShadow: "var(--shadow-subtle)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <SectionTitle>API Key</SectionTitle>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: provider.configured ? "var(--success)" : "var(--border-strong)", display: "inline-block" }} />
          <span style={{ fontSize: 11, color: provider.configured ? "var(--success)" : "var(--text-dim)" }}>
            {provider.configured ? t("i18n.configured") : t("i18n.notConfigured")}
          </span>
        </div>
      </div>

      <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
        {provider.configured
          ? "API 密钥已存储。在下方输入新密钥以替换，或断开连接以移除。"
          : `输入您的 ${provider.displayName} API 密钥以启用 ${provider.modelCount} 个模型。`}
      </p>

      <Field label="API Key">
        <div style={{ display: "flex", gap: 6 }}>
          <SecretTextInput
            value={apiKey}
            onChange={setApiKey}
            onKeyDown={(event) => {
              if (event.key === "Enter" && apiKey.trim()) handleSave();
            }}
            placeholder={provider.configured ? "输入新密钥以替换…" : "sk-…"}
            style={{ flex: 1 }}
            autoComplete="off"
            spellCheck={false}
            mono
          />
          <button
            className="pi-send-button"
            onClick={handleSave}
            disabled={saving || !apiKey.trim() || savedOk}
            style={{
              padding: "6px 12px",
              background: savedOk ? "var(--success)" : apiKey.trim() ? "var(--accent)" : "var(--bg-hover)",
              border: "none",
              borderRadius: "var(--ui-radius-sm)",
              color: (apiKey.trim() || savedOk) ? "var(--text-on-accent)" : "var(--text-dim)",
              cursor: (saving || !apiKey.trim() || savedOk) ? "not-allowed" : "pointer",
              fontSize: 12,
              fontWeight: 600,
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            {savedOk && (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
            {savedOk ? t("i18n.saved") : saving ? t("i18n.saving") : t("i18n.save")}
          </button>
        </div>
      </Field>

      {error && <p style={{ margin: 0, padding: "7px 9px", borderRadius: "var(--ui-radius-sm)", background: "var(--danger-soft)", color: "var(--danger)", fontSize: 12 }}>{error}</p>}

      {provider.configured && (
        <button
          className="pi-sidebar-action is-danger"
          onClick={handleRemove}
          disabled={removing}
          style={{
            alignSelf: "flex-start",
            padding: "5px 12px",
            background: "var(--bg)",
            border: "1px solid color-mix(in srgb, var(--danger) 36%, var(--border))",
            borderRadius: "var(--ui-radius-sm)",
            color: "var(--danger)",
            cursor: removing ? "not-allowed" : "pointer",
            fontSize: 12,
          }}
        >
          {removing ? t("i18n.removing") : t("i18n.disconnect")}
        </button>
      )}
    </div>
  );
}
