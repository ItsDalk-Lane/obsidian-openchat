"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useIsMobile } from "@/hooks/useIsMobile";
import type { McpScope, McpServerEntry, McpServerInfo, McpServersResponse } from "@/lib/mcp-config";
import type { McpServerRuntimeStatus, McpStatusSnapshot } from "@/lib/mcp-extension";
import { parseMcpImport, type ImportedMcpServer } from "@/lib/mcp-import";

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

function formFromEntry(name: string, scope: McpScope, entry: McpServerEntry): ServerFormState {
  return {
    name,
    scope,
    transport: typeof entry.url === "string" ? "http" : "stdio",
    command: entry.command ?? "",
    args: (entry.args ?? []).join("\n"),
    env: Object.entries(entry.env ?? {}).map(([k, v]) => `${k}=${v}`).join("\n"),
    url: entry.url ?? "",
    headers: Object.entries(entry.headers ?? {}).map(([k, v]) => `${k}: ${v}`).join("\n"),
    lifecycle: entry.lifecycle ?? "",
  };
}

function formFromServer(server: McpServerInfo): ServerFormState {
  return formFromEntry(server.name, server.sourceScope, server.config);
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
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [importNote, setImportNote] = useState<string | null>(null);
  const [importedBatch, setImportedBatch] = useState<ImportedMcpServer[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [opRunning, setOpRunning] = useState<string | null>(null);
  const [opResult, setOpResult] = useState<{ ok: boolean; text: string; key: string } | null>(null);
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

  const runMcpAction = useCallback(async (action: "reconnect" | "auth" | "logout", server?: string) => {
    if (!sessionId) return;
    const key = `${action}:${server ?? "*"}`;
    setOpRunning(key);
    setOpResult(null);
    setActionError(null);
    try {
      const res = await fetch("/api/mcp/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, action, ...(server ? { server } : {}) }),
      });
      const d = (await res.json()) as { ok?: boolean; message?: string; started?: boolean; error?: string };
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      if (action === "auth" && d.started) {
        setOpResult({ ok: true, key, text: "授权页已在浏览器打开；完成授权后状态会自动更新（通知中附有授权链接）。" });
      } else {
        setOpResult({ ok: d.ok === true, key, text: d.message ?? (d.ok ? "操作完成" : "操作失败") });
      }
    } catch (e) {
      setOpResult({ ok: false, key, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setOpRunning(null);
    }
  }, [sessionId]);

  // After add/enable, eagerly connect once so tool metadata is cached and the
  // model can discover the server right away. With the adapter's default lazy
  // lifecycle, a never-connected server has no cached tools and looks
  // "not connected" to the model. The /api/mcp route awaits the session reload
  // before responding, so the control channel is ready again at this point.
  const autoReconnect = useCallback((name: string) => {
    if (!sessionId || !statusLive) return;
    void runMcpAction("reconnect", name);
  }, [sessionId, statusLive, runMcpAction]);

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
      if (!next) autoReconnect(server.name);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setToggling((s) => {
        const n = new Set(s);
        n.delete(server.name);
        return n;
      });
    }
  }, [cwd, sessionId, load, onReloaded, autoReconnect]);

  const resetImport = useCallback(() => {
    setImportText("");
    setImportError(null);
    setImportNote(null);
    setImportedBatch(null);
    setImporting(false);
  }, []);

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
      resetImport();
      setSelected(form.name.trim());
      await load();
      onReloaded?.();
      const editingDisabled = formMode === "edit" && data?.servers.find((s) => s.name === selected)?.disabled === true;
      if (!editingDisabled) autoReconnect(form.name.trim());
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [cwd, form, formMode, selected, sessionId, load, onReloaded, data, autoReconnect, resetImport]);

  // 粘贴 JSON 识别：单个服务器直接填充表单（沿用正常保存流程），
  // 多个服务器进入批量确认面板。
  const applyImport = useCallback(() => {
    setImportError(null);
    setImportNote(null);
    setImportedBatch(null);
    try {
      const { servers, unnamedEntry } = parseMcpImport(importText);
      if (unnamedEntry) {
        setForm((f) => formFromEntry(f.name, f.scope, unnamedEntry));
        setImportNote("已填充表单（粘贴的内容未包含名称，请填写后保存）");
        return;
      }
      if (servers.length === 1) {
        setForm((f) => formFromEntry(servers[0].name, f.scope, servers[0].entry));
        setImportNote(`已填充「${servers[0].name}」，确认无误后点击保存`);
        return;
      }
      setImportedBatch(servers);
    } catch (e) {
      setImportError(e instanceof Error ? e.message : String(e));
    }
  }, [importText]);

  const importBatch = useCallback(async () => {
    if (!importedBatch) return;
    const conflicts = importedBatch.filter((s) => data?.servers.some((existing) => existing.name === s.name));
    if (conflicts.length > 0) {
      const names = conflicts.map((s) => s.name).join("、");
      if (!window.confirm(`以下名称已存在：${names}\n导入会在所选作用域写入同名配置。继续？`)) return;
    }
    setImporting(true);
    setImportError(null);
    try {
      for (const server of importedBatch) {
        const res = await fetch("/api/mcp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "upsert",
            cwd,
            scope: form.scope,
            name: server.name,
            config: server.entry,
            sessionId,
          }),
        });
        const d = (await res.json()) as { success?: boolean; error?: string };
        if (!res.ok || d.error) throw new Error(`${server.name}: ${d.error ?? `HTTP ${res.status}`}`);
      }
      const names = importedBatch.map((s) => s.name);
      resetImport();
      setFormMode(null);
      setSelected(names[0]);
      await load();
      onReloaded?.();
      for (const name of names) autoReconnect(name);
    } catch (e) {
      setImportError(e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(false);
    }
  }, [importedBatch, data, cwd, form.scope, sessionId, load, onReloaded, autoReconnect, resetImport]);

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
            {sessionId && statusLive && (
              <button
                onClick={() => void runMcpAction("reconnect")}
                disabled={opRunning !== null}
                title="重新连接所有 MCP 服务器"
                style={{
                  padding: "3px 10px",
                  fontSize: 11,
                  color: "var(--text)",
                  background: "var(--bg-hover)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  cursor: opRunning ? "wait" : "pointer",
                  opacity: opRunning ? 0.6 : 1,
                }}
              >
                {opRunning === "reconnect:*" ? "重连中…" : "全部重连"}
              </button>
            )}
            {opResult?.key === "reconnect:*" && (
              <span
                title={opResult.text}
                style={{
                  fontSize: 10,
                  color: opResult.ok ? "#22c55e" : "#f87171",
                  maxWidth: 200,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {opResult.text}
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
                            setOpResult(null);
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
                  resetImport();
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
                {formMode === "add" && (
                  <div style={{
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    padding: 10,
                    background: "var(--bg-panel)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>
                      从 JSON 导入（可选）
                    </div>
                    <textarea
                      style={{ ...inputStyle, minHeight: 92, resize: "vertical", fontSize: 11 }}
                      value={importText}
                      onChange={(e) => {
                        setImportText(e.target.value);
                        setImportError(null);
                        setImportNote(null);
                        setImportedBatch(null);
                      }}
                      placeholder={'粘贴 {"mcpServers": { "名称": { "command": "...", "args": [...] } }} 配置，点击识别后自动填充'}
                    />
                    {importError && <div style={{ fontSize: 11, color: "#f87171" }}>{importError}</div>}
                    {importNote && <div style={{ fontSize: 11, color: "#4ade80" }}>{importNote}</div>}
                    {importedBatch ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12, color: "var(--text)" }}>
                        <div>识别到 {importedBatch.length} 个服务器：{importedBatch.map((s) => s.name).join("、")}</div>
                        <div style={{ color: "var(--text-muted)", fontSize: 11 }}>
                          将添加到{form.scope === "project" ? "项目 (.mcp.json)" : "全局 (~/.config/mcp/mcp.json)"}（可在下方「作用域」更改）
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            onClick={() => void importBatch()}
                            disabled={importing}
                            style={{
                              padding: "6px 14px",
                              fontSize: 12,
                              fontWeight: 600,
                              color: "var(--bg)",
                              background: "var(--accent)",
                              border: "none",
                              borderRadius: 6,
                              cursor: importing ? "wait" : "pointer",
                              opacity: importing ? 0.6 : 1,
                            }}
                          >
                            {importing ? "添加中…" : `全部添加 ${importedBatch.length} 个`}
                          </button>
                          <button
                            onClick={() => setImportedBatch(null)}
                            disabled={importing}
                            style={{
                              padding: "6px 14px",
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
                    ) : (
                      <div>
                        <button
                          onClick={applyImport}
                          disabled={!importText.trim()}
                          style={{
                            padding: "6px 14px",
                            fontSize: 12,
                            color: "var(--text)",
                            background: "var(--bg-hover)",
                            border: "1px solid var(--border)",
                            borderRadius: 6,
                            cursor: importText.trim() ? "pointer" : "default",
                            opacity: importText.trim() ? 1 : 0.5,
                          }}
                        >
                          识别 JSON
                        </button>
                      </div>
                    )}
                  </div>
                )}
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
                      resetImport();
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

                    {sessionId && statusLive && !server.disabled && (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                        <button
                          onClick={() => void runMcpAction("reconnect", server.name)}
                          disabled={opRunning !== null}
                          style={{
                            padding: "6px 14px",
                            fontSize: 12,
                            color: "var(--text)",
                            background: "var(--bg-hover)",
                            border: "1px solid var(--border)",
                            borderRadius: 6,
                            cursor: opRunning ? "wait" : "pointer",
                            opacity: opRunning ? 0.6 : 1,
                          }}
                        >
                          {opRunning === `reconnect:${server.name}` ? "重连中…" : "重新连接"}
                        </button>
                        {server.transport === "http" && (
                          <>
                            <button
                              onClick={() => void runMcpAction("auth", server.name)}
                              disabled={opRunning !== null}
                              title="发起 OAuth 授权：自动打开系统浏览器，完成后自动重连"
                              style={{
                                padding: "6px 14px",
                                fontSize: 12,
                                fontWeight: runtime === "needs-auth" ? 600 : 400,
                                color: runtime === "needs-auth" ? "var(--bg)" : "var(--text)",
                                background: runtime === "needs-auth" ? "var(--accent)" : "var(--bg-hover)",
                                border: runtime === "needs-auth" ? "none" : "1px solid var(--border)",
                                borderRadius: 6,
                                cursor: opRunning ? "wait" : "pointer",
                                opacity: opRunning ? 0.6 : 1,
                              }}
                            >
                              {opRunning === `auth:${server.name}` ? "发起授权…" : "OAuth 登录"}
                            </button>
                            <button
                              onClick={() => {
                                if (!window.confirm(`清除 "${server.name}" 的 OAuth 登录凭据？`)) return;
                                void runMcpAction("logout", server.name);
                              }}
                              disabled={opRunning !== null}
                              style={{
                                padding: "6px 14px",
                                fontSize: 12,
                                color: "var(--text)",
                                background: "none",
                                border: "1px solid var(--border)",
                                borderRadius: 6,
                                cursor: opRunning ? "wait" : "pointer",
                                opacity: opRunning ? 0.6 : 1,
                              }}
                            >
                              {opRunning === `logout:${server.name}` ? "清除中…" : "清除认证"}
                            </button>
                          </>
                        )}
                        {runtime === "needs-auth" && (
                          <span style={{ fontSize: 11, color: "#d97706" }}>
                            需要 OAuth 认证 — 点击「OAuth 登录」在浏览器中完成授权。
                          </span>
                        )}
                      </div>
                    )}

                    {runtime === "needs-auth" && (!sessionId || !statusLive) && (
                      <div style={{ fontSize: 11, color: "#d97706" }}>
                        该服务器需要 OAuth 认证；会话加载后可在此页面直接登录。
                      </div>
                    )}

                    {opResult && opResult.key !== "reconnect:*" && (
                      <div style={{ fontSize: 11, color: opResult.ok ? "#22c55e" : "#f87171" }}>{opResult.text}</div>
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
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
