"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useIsMobile } from "@/hooks/useIsMobile";
import type { McpScope, McpServerEntry, McpServerInfo, McpServersResponse } from "@/lib/mcp-config";
import type { McpServerRuntimeStatus, McpStatusSnapshot } from "@/lib/mcp-extension";

function shortenPath(p: string): string {
  return p.replace(/^\/(?:Users|home)\/[^/]+/, "~").replace(/^[A-Za-z]:\\Users\\[^\\]+/, "~");
}

const STATUS_META: Record<McpServerRuntimeStatus, { label: string; color: string }> = {
  connected: { label: "已连接", color: "#22c55e" },
  cached: { label: "已缓存", color: "#38bdf8" },
  failed: { label: "失败", color: "#f87171" },
  "needs-auth": { label: "需要认证", color: "#d97706" },
  "not-connected": { label: "未连接", color: "var(--text-dim)" },
  disabled: { label: "已禁用", color: "var(--border)" },
};

function Toggle({ enabled, loading, onToggle }: { enabled: boolean; loading: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      disabled={loading}
      title={enabled ? "已启用 — 点击禁用" : "已禁用 — 点击启用"}
      style={{
        flexShrink: 0,
        width: 40,
        height: 22,
        borderRadius: 11,
        border: "none",
        padding: 0,
        cursor: loading ? "wait" : "pointer",
        background: enabled ? "var(--accent)" : "var(--border)",
        position: "relative",
        transition: "background 0.18s",
        outline: "none",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 3,
          left: enabled ? 21 : 3,
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: "var(--bg)",
          boxShadow: "0 1px 4px rgba(0,0,0,0.22)",
          transition: "left 0.18s cubic-bezier(.4,0,.2,1)",
        }}
      />
    </button>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "6px 8px",
  fontSize: 12,
  fontFamily: "var(--font-mono)",
  background: "var(--bg)",
  color: "var(--text)",
  border: "1px solid var(--border)",
  borderRadius: 5,
  outline: "none",
};

const fieldLabelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "var(--text-muted)",
  marginBottom: 4,
  display: "block",
};

interface ServerFormState {
  name: string;
  scope: McpScope;
  transport: "stdio" | "http";
  command: string;
  args: string;
  env: string;
  url: string;
  headers: string;
  lifecycle: "" | "lazy" | "eager" | "keep-alive" | "lazy-keep-alive";
}

function emptyForm(scope: McpScope): ServerFormState {
  return { name: "", scope, transport: "stdio", command: "", args: "", env: "", url: "", headers: "", lifecycle: "" };
}

function formFromServer(server: McpServerInfo): ServerFormState {
  const c = server.config;
  return {
    name: server.name,
    scope: server.sourceScope,
    transport: typeof c.url === "string" ? "http" : "stdio",
    command: c.command ?? "",
    args: (c.args ?? []).join("\n"),
    env: Object.entries(c.env ?? {}).map(([k, v]) => `${k}=${v}`).join("\n"),
    url: c.url ?? "",
    headers: Object.entries(c.headers ?? {}).map(([k, v]) => `${k}: ${v}`).join("\n"),
    lifecycle: (c.lifecycle as ServerFormState["lifecycle"]) ?? "",
  };
}

function parseKeyValueLines(text: string, separator: "=" | ":"): Record<string, string> | undefined {
  const record: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const idx = trimmed.indexOf(separator);
    if (idx <= 0) throw new Error(`无效的行: "${trimmed}"（应为 KEY${separator === "=" ? "=VALUE" : ": VALUE"} 格式）`);
    record[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return Object.keys(record).length > 0 ? record : undefined;
}

function entryFromForm(form: ServerFormState): McpServerEntry {
  const entry: McpServerEntry = {};
  if (form.transport === "stdio") {
    if (!form.command.trim()) throw new Error("stdio 服务器必须填写 command");
    entry.command = form.command.trim();
    const args = form.args.split("\n").map((l) => l.trim()).filter(Boolean);
    if (args.length > 0) entry.args = args;
    const env = parseKeyValueLines(form.env, "=");
    if (env) entry.env = env;
  } else {
    if (!form.url.trim()) throw new Error("http 服务器必须填写 url");
    entry.url = form.url.trim();
    const headers = parseKeyValueLines(form.headers, ":");
    if (headers) entry.headers = headers;
  }
  if (form.lifecycle) entry.lifecycle = form.lifecycle;
  return entry;
}

export function McpConfig({
  cwd,
  sessionId,
  onClose,
  onReloaded,
}: {
  cwd: string;
  sessionId: string | null;
  onClose: () => void;
  onReloaded?: () => void;
}) {
  const isMobile = useIsMobile();
  const [data, setData] = useState<McpServersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [toggling, setToggling] = useState<Set<string>>(new Set());
  const [actionError, setActionError] = useState<string | null>(null);
  const [status, setStatus] = useState<McpStatusSnapshot | null>(null);
  const [statusLive, setStatusLive] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit" | null>(null);
  const [form, setForm] = useState<ServerFormState>(emptyForm("project"));
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const selectedRef = useRef<string | null>(null);
  selectedRef.current = selected;

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/mcp?cwd=${encodeURIComponent(cwd)}`);
      const d = (await res.json()) as McpServersResponse & { error?: string };
      if (!res.ok || d.error) throw new Error(d.error ?? `HTTP ${res.status}`);
      setData(d);
      if (d.servers.length > 0 && !selectedRef.current) setSelected(d.servers[0].name);
      return d;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setLoading(false);
    }
  }, [cwd]);

  useEffect(() => {
    setLoading(true);
    setSelected(null);
    setFormMode(null);
    void load();
  }, [load]);

  // Poll runtime status from the active session's bundled adapter.
  useEffect(() => {
    if (!sessionId) {
      setStatus(null);
      setStatusLive(false);
      return;
    }
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/mcp/status?sessionId=${encodeURIComponent(sessionId)}`);
        if (!res.ok) return;
        const d = (await res.json()) as { status: McpStatusSnapshot | null; live: boolean };
        if (!cancelled) {
          setStatus(d.status);
          setStatusLive(d.live);
        }
      } catch { /* transient */ }
    };
    void poll();
    const timer = setInterval(poll, 4000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [sessionId]);

  const runtimeStatusFor = useCallback((server: McpServerInfo): McpServerRuntimeStatus => {
    if (server.disabled) return "disabled";
    const entry = status?.servers.find((s) => s.name === server.name);
    return entry?.status ?? "not-connected";
  }, [status]);

  const toggle = useCallback(async (server: McpServerInfo) => {
    const next = !server.disabled;
    setToggling((s) => new Set(s).add(server.name));
    setActionError(null);
    try {
      const res = await fetch("/api/mcp", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd, name: server.name, disabled: next, sessionId }),
      });
      const d = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || d.error) throw new Error(d.error ?? `HTTP ${res.status}`);
      await load();
      onReloaded?.();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setToggling((s) => {
        const n = new Set(s);
        n.delete(server.name);
        return n;
      });
    }
  }, [cwd, sessionId, load, onReloaded]);

  const save = useCallback(async () => {
    setSaving(true);
    setActionError(null);
    try {
      const entry = entryFromForm(form);
      const res = await fetch("/api/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "upsert",
          cwd,
          scope: form.scope,
          name: form.name.trim(),
          config: entry,
          previousName: formMode === "edit" ? selected : undefined,
          sessionId,
        }),
      });
      const d = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || d.error) throw new Error(d.error ?? `HTTP ${res.status}`);
      setFormMode(null);
      setSelected(form.name.trim());
      await load();
      onReloaded?.();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [cwd, form, formMode, selected, sessionId, load, onReloaded]);

  const remove = useCallback(async (server: McpServerInfo) => {
    if (!window.confirm(`删除 MCP 服务器 "${server.name}"？`)) return;
    setRemoving(true);
    setActionError(null);
    try {
      const res = await fetch("/api/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove", cwd, scope: server.sourceScope, name: server.name, sessionId }),
      });
      const d = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || d.error) throw new Error(d.error ?? `HTTP ${res.status}`);
      setSelected(null);
      await load();
      onReloaded?.();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setRemoving(false);
    }
  }, [cwd, sessionId, load, onReloaded]);

  const servers = data?.servers ?? [];
  const selectedServer = servers.find((s) => s.name === selected) ?? null;

  const groups: { label: string; servers: McpServerInfo[] }[] = [];
  for (const [label, matches] of [
    ["项目", (s: McpServerInfo) => s.sourceScope === "project"],
    ["全局", (s: McpServerInfo) => s.sourceScope === "global"],
  ] as const) {
    const grp = servers.filter(matches);
    if (grp.length > 0) groups.push({ label, servers: grp });
  }

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
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: isMobile ? "calc(100vw - 16px)" : 860,
          maxWidth: "calc(100vw - 16px)",
          height: isMobile ? "calc(100dvh - 16px)" : "78vh",
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
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 18px",
            borderBottom: "1px solid var(--border)",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>MCP 服务器</span>
            <code
              style={{
                fontSize: 11,
                color: "var(--text-muted)",
                fontFamily: "var(--font-mono)",
                maxWidth: 320,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {shortenPath(cwd)}
            </code>
            {sessionId && (
              <span style={{ fontSize: 10, color: statusLive ? "#22c55e" : "var(--text-dim)" }}>
                {statusLive ? "● 会话状态实时" : "○ 会话未加载"}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
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

        {/* Body */}
        <div style={{ flex: 1, display: "flex", flexDirection: isMobile ? "column" : "row", overflow: "hidden" }}>
          {/* Left: server list */}
          <div
            style={{
              width: isMobile ? "100%" : 220,
              maxHeight: isMobile ? "40vh" : undefined,
              borderRight: isMobile ? "none" : "1px solid var(--border)",
              borderBottom: isMobile ? "1px solid var(--border)" : "none",
              display: "flex",
              flexDirection: "column",
              flexShrink: 0,
              background: "var(--bg-panel)",
            }}
          >
            <div style={{ flex: 1, overflowY: "auto", padding: "8px 6px" }}>
              {loading ? (
                <div style={{ padding: "10px 8px", fontSize: 12, color: "var(--text-muted)" }}>加载中…</div>
              ) : error ? (
                <div style={{ padding: "10px 8px", fontSize: 11, color: "#f87171" }}>{error}</div>
              ) : servers.length === 0 ? (
                <div style={{ padding: "10px 8px", fontSize: 11, color: "var(--text-dim)" }}>
                  未配置 MCP 服务器
                </div>
              ) : (
                groups.map(({ label, servers: grpServers }) => (
                  <div key={label} style={{ marginBottom: 6 }}>
                    <div
                      style={{
                        padding: "4px 8px 3px",
                        fontSize: 10,
                        fontWeight: 600,
                        color: "var(--text-dim)",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                      }}
                    >
                      {label}
                    </div>
                    {grpServers.map((server) => {
                      const isSelected = formMode !== "add" && selected === server.name;
                      const runtime = runtimeStatusFor(server);
                      return (
                        <div
                          key={server.name}
                          onClick={() => {
                            setSelected(server.name);
                            setFormMode(null);
                            setActionError(null);
                          }}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 7,
                            padding: "8px 8px",
                            borderRadius: 5,
                            cursor: "pointer",
                            background: isSelected ? "var(--bg-selected)" : "none",
                          }}
                          onMouseEnter={(e) => {
                            if (!isSelected) e.currentTarget.style.background = "var(--bg-hover)";
                          }}
                          onMouseLeave={(e) => {
                            if (!isSelected) e.currentTarget.style.background = "none";
                          }}
                        >
                          <span
                            title={STATUS_META[runtime].label}
                            style={{
                              flexShrink: 0,
                              width: 7,
                              height: 7,
                              borderRadius: "50%",
                              background: STATUS_META[runtime].color,
                              boxShadow: runtime === "connected" ? `0 0 4px ${STATUS_META[runtime].color}` : "none",
                              transition: "background 0.15s, box-shadow 0.15s",
                            }}
                          />
                          <span
                            style={{
                              fontSize: 12,
                              fontWeight: isSelected ? 600 : 400,
                              color: server.disabled ? "var(--text-dim)" : "var(--text)",
                              fontFamily: "var(--font-mono)",
                              flex: 1,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {server.name}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
            <div style={{ padding: "8px", borderTop: "1px solid var(--border)", flexShrink: 0 }}>
              <button
                onClick={() => {
                  setFormMode("add");
                  setForm(emptyForm("project"));
                  setActionError(null);
                }}
                style={{
                  width: "100%",
                  padding: "7px 0",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--text)",
                  background: formMode === "add" ? "var(--bg-selected)" : "var(--bg-hover)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  cursor: "pointer",
                }}
              >
                + 添加服务器
              </button>
            </div>
          </div>

          {/* Right: detail / form */}
          <div style={{ flex: 1, overflowY: "auto", padding: 18 }}>
            {formMode ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 480 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
                  {formMode === "add" ? "添加 MCP 服务器" : `编辑 ${selected}`}
                </div>
                <div>
                  <label style={fieldLabelStyle}>名称</label>
                  <input
                    style={inputStyle}
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="chrome-devtools"
                  />
                </div>
                {formMode === "add" && (
                  <div>
                    <label style={fieldLabelStyle}>作用域</label>
                    <div style={{ display: "flex", gap: 12, fontSize: 12, color: "var(--text)" }}>
                      {([
                        ["project", "项目 (.mcp.json)"],
                        ["global", "全局 (~/.config/mcp/mcp.json)"],
                      ] as const).map(([value, label]) => (
                        <label key={value} style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
                          <input
                            type="radio"
                            checked={form.scope === value}
                            onChange={() => setForm({ ...form, scope: value })}
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <label style={fieldLabelStyle}>传输方式</label>
                  <div style={{ display: "flex", gap: 12, fontSize: 12, color: "var(--text)" }}>
                    {([
                      ["stdio", "stdio（本地命令）"],
                      ["http", "http（远程地址）"],
                    ] as const).map(([value, label]) => (
                      <label key={value} style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
                        <input
                          type="radio"
                          checked={form.transport === value}
                          onChange={() => setForm({ ...form, transport: value })}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>
                {form.transport === "stdio" ? (
                  <>
                    <div>
                      <label style={fieldLabelStyle}>命令</label>
                      <input
                        style={inputStyle}
                        value={form.command}
                        onChange={(e) => setForm({ ...form, command: e.target.value })}
                        placeholder="npx"
                      />
                    </div>
                    <div>
                      <label style={fieldLabelStyle}>参数（每行一个）</label>
                      <textarea
                        style={{ ...inputStyle, minHeight: 64, resize: "vertical" }}
                        value={form.args}
                        onChange={(e) => setForm({ ...form, args: e.target.value })}
                        placeholder={"-y\nchrome-devtools-mcp@latest"}
                      />
                    </div>
                    <div>
                      <label style={fieldLabelStyle}>环境变量（每行 KEY=VALUE，可选）</label>
                      <textarea
                        style={{ ...inputStyle, minHeight: 48, resize: "vertical" }}
                        value={form.env}
                        onChange={(e) => setForm({ ...form, env: e.target.value })}
                        placeholder="API_KEY=${MY_API_KEY}"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label style={fieldLabelStyle}>URL</label>
                      <input
                        style={inputStyle}
                        value={form.url}
                        onChange={(e) => setForm({ ...form, url: e.target.value })}
                        placeholder="https://mcp.example.com/mcp"
                      />
                    </div>
                    <div>
                      <label style={fieldLabelStyle}>请求头（每行 Key: Value，可选）</label>
                      <textarea
                        style={{ ...inputStyle, minHeight: 48, resize: "vertical" }}
                        value={form.headers}
                        onChange={(e) => setForm({ ...form, headers: e.target.value })}
                        placeholder="Authorization: Bearer ${TOKEN}"
                      />
                    </div>
                  </>
                )}
                <div>
                  <label style={fieldLabelStyle}>生命周期（可选）</label>
                  <select
                    style={{ ...inputStyle, cursor: "pointer" }}
                    value={form.lifecycle}
                    onChange={(e) => setForm({ ...form, lifecycle: e.target.value as ServerFormState["lifecycle"] })}
                  >
                    <option value="">lazy（默认 — 按需连接）</option>
                    <option value="eager">eager（启动时连接）</option>
                    <option value="keep-alive">keep-alive（保持连接）</option>
                    <option value="lazy-keep-alive">lazy-keep-alive</option>
                  </select>
                </div>
                {actionError && <div style={{ fontSize: 11, color: "#f87171" }}>{actionError}</div>}
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => void save()}
                    disabled={saving || !form.name.trim()}
                    style={{
                      padding: "7px 16px",
                      fontSize: 12,
                      fontWeight: 600,
                      color: "var(--bg)",
                      background: "var(--accent)",
                      border: "none",
                      borderRadius: 6,
                      cursor: saving ? "wait" : "pointer",
                      opacity: saving || !form.name.trim() ? 0.6 : 1,
                    }}
                  >
                    {saving ? "保存中…" : "保存"}
                  </button>
                  <button
                    onClick={() => {
                      setFormMode(null);
                      setActionError(null);
                    }}
                    style={{
                      padding: "7px 16px",
                      fontSize: 12,
                      color: "var(--text-muted)",
                      background: "none",
                      border: "1px solid var(--border)",
                      borderRadius: 6,
                      cursor: "pointer",
                    }}
                  >
                    取消
                  </button>
                </div>
              </div>
            ) : selectedServer ? (
              (() => {
                const server = selectedServer;
                const runtime = runtimeStatusFor(server);
                const runtimeEntry = status?.servers.find((s) => s.name === server.name);
                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-mono)" }}>
                        {server.name}
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          padding: "2px 8px",
                          borderRadius: 9,
                          color: STATUS_META[runtime].color,
                          border: `1px solid ${STATUS_META[runtime].color}`,
                        }}
                      >
                        {STATUS_META[runtime].label}
                        {runtimeEntry && runtimeEntry.toolCount > 0 ? ` · ${runtimeEntry.toolCount} 工具` : ""}
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          padding: "2px 8px",
                          borderRadius: 9,
                          color: "var(--text-muted)",
                          border: "1px solid var(--border)",
                        }}
                      >
                        {server.transport}
                      </span>
                      <div style={{ marginLeft: "auto" }}>
                        <Toggle
                          enabled={!server.disabled}
                          loading={toggling.has(server.name)}
                          onToggle={() => void toggle(server)}
                        />
                      </div>
                    </div>

                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      来源：
                      <code style={{ fontFamily: "var(--font-mono)", color: "var(--text)" }}>
                        {shortenPath(server.sourcePath)}
                      </code>
                      {!server.editable && (
                        <span style={{ marginLeft: 8, color: "var(--text-dim)" }}>
                          （此文件不由 Pi Web 管理，仅可启用/禁用）
                        </span>
                      )}
                    </div>

                    <pre
                      style={{
                        margin: 0,
                        padding: 12,
                        fontSize: 11,
                        fontFamily: "var(--font-mono)",
                        color: "var(--text)",
                        background: "var(--bg-panel)",
                        border: "1px solid var(--border)",
                        borderRadius: 6,
                        overflowX: "auto",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-all",
                      }}
                    >
                      {JSON.stringify(server.config, null, 2)}
                    </pre>

                    <div style={{ fontSize: 10, color: "var(--text-dim)" }}>
                      敏感字段（token、环境变量、请求头的值）以 *** 显示；编辑时保留 *** 表示不修改原值。
                    </div>

                    {runtime === "needs-auth" && (
                      <div style={{ fontSize: 11, color: "#d97706" }}>
                        该服务器需要认证。请在 pi CLI 中运行 /mcp-auth {server.name} 完成 OAuth 登录。
                      </div>
                    )}

                    {actionError && <div style={{ fontSize: 11, color: "#f87171" }}>{actionError}</div>}

                    {server.editable && (
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          onClick={() => {
                            setFormMode("edit");
                            setForm(formFromServer(server));
                            setActionError(null);
                          }}
                          style={{
                            padding: "6px 14px",
                            fontSize: 12,
                            color: "var(--text)",
                            background: "var(--bg-hover)",
                            border: "1px solid var(--border)",
                            borderRadius: 6,
                            cursor: "pointer",
                          }}
                        >
                          编辑
                        </button>
                        <button
                          onClick={() => void remove(server)}
                          disabled={removing}
                          style={{
                            padding: "6px 14px",
                            fontSize: 12,
                            color: "#f87171",
                            background: "none",
                            border: "1px solid var(--border)",
                            borderRadius: 6,
                            cursor: removing ? "wait" : "pointer",
                          }}
                        >
                          {removing ? "删除中…" : "删除"}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })()
            ) : (
              <div style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.7 }}>
                <p style={{ marginTop: 0 }}>
                  Pi Web 已内置 pi-mcp-adapter — 每个会话自动带一个轻量的 <code>mcp</code> 代理工具，
                  模型可按需搜索并调用已配置 MCP 服务器的工具，不会占用大量上下文。
                </p>
                <p>点击左下角「添加服务器」配置第一个 MCP 服务器，或直接编辑：</p>
                <ul style={{ paddingLeft: 18, fontFamily: "var(--font-mono)", fontSize: 11 }}>
                  <li>项目：<code>.mcp.json</code></li>
                  <li>全局：<code>~/.config/mcp/mcp.json</code></li>
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
