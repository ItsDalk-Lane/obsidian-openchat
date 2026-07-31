"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useIsMobile } from "@/hooks/useIsMobile";
import type {
  SubagentAgent,
  SubagentCatalog,
  SubagentChain,
  SubagentSettings,
  WritableSubagentScope,
} from "@/lib/subagents-config";

type Tab = "agents" | "settings" | "chains";
type AgentFormMode = "add" | "edit";

interface AgentForm {
  scope: WritableSubagentScope;
  name: string;
  description: string;
  tools: string;
  model: string;
  fallbackModels: string;
  thinking: string;
  systemPromptMode: "append" | "replace";
  inheritProjectContext: boolean;
  inheritSkills: boolean;
  skills: string;
  async: boolean;
  timeoutMs: string;
  body: string;
}

interface ModelEntry {
  id: string;
  name: string;
  provider: string;
}

const EMPTY_SETTINGS: SubagentSettings = { agentOverrides: {} };
const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh"] as const;
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
  display: "block",
  marginBottom: 4,
  fontSize: 11,
  fontWeight: 600,
  color: "var(--text-muted)",
};
const buttonStyle: React.CSSProperties = {
  padding: "7px 12px",
  border: "1px solid var(--border)",
  borderRadius: 6,
  background: "var(--bg-hover)",
  color: "var(--text)",
  cursor: "pointer",
  fontSize: 12,
};

function emptyAgentForm(scope: WritableSubagentScope): AgentForm {
  return {
    scope,
    name: "",
    description: "",
    tools: "",
    model: "",
    fallbackModels: "",
    thinking: "",
    systemPromptMode: "replace",
    inheritProjectContext: false,
    inheritSkills: false,
    skills: "",
    async: false,
    timeoutMs: "",
    body: "",
  };
}

function formFromAgent(agent: SubagentAgent): AgentForm {
  return {
    scope: agent.scope === "project" ? "project" : "user",
    name: agent.name,
    description: agent.description,
    tools: (agent.tools ?? []).join(", "),
    model: agent.model ?? "",
    fallbackModels: (agent.fallbackModels ?? []).join(", "),
    thinking: agent.thinking === false ? "false" : agent.thinking ?? "",
    systemPromptMode: agent.systemPromptMode ?? "replace",
    inheritProjectContext: agent.inheritProjectContext ?? false,
    inheritSkills: agent.inheritSkills ?? false,
    skills: (agent.skills ?? []).join(", "),
    async: agent.async ?? false,
    timeoutMs: agent.timeoutMs?.toString() ?? "",
    body: agent.body,
  };
}

function parseList(value: string): string[] {
  return value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
}

function Toggle({
  enabled,
  disabled,
  onToggle,
}: {
  enabled: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      title={enabled ? "已启用，点击禁用" : "已禁用，点击启用"}
      disabled={disabled}
      onClick={onToggle}
      style={{
        width: 38,
        height: 21,
        flexShrink: 0,
        padding: 0,
        border: "none",
        borderRadius: 11,
        background: enabled ? "var(--accent)" : "var(--border)",
        cursor: disabled ? "wait" : "pointer",
        opacity: disabled ? 0.6 : 1,
        position: "relative",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 3,
          left: enabled ? 20 : 3,
          width: 15,
          height: 15,
          borderRadius: "50%",
          background: "var(--bg)",
          transition: "left 0.16s",
        }}
      />
    </button>
  );
}

async function readJson<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok || data.error) throw new Error(data.error ?? `HTTP ${response.status}`);
  return data;
}

export function SubagentsConfig({
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
  const [tab, setTab] = useState<Tab>("agents");
  const [catalog, setCatalog] = useState<SubagentCatalog>({ agents: [], diagnostics: [] });
  const [chains, setChains] = useState<SubagentChain[]>([]);
  const [models, setModels] = useState<ModelEntry[]>([]);
  const [settings, setSettings] = useState<Record<WritableSubagentScope, SubagentSettings>>({
    user: EMPTY_SETTINGS,
    project: EMPTY_SETTINGS,
  });
  const [settingsScope, setSettingsScope] = useState<WritableSubagentScope>("project");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<AgentFormMode | null>(null);
  const [form, setForm] = useState<AgentForm>(emptyAgentForm("project"));
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const cwdParam = encodeURIComponent(cwd);
      const [agentsData, chainsData, userSettings, projectSettings, modelsData] = await Promise.all([
        readJson<SubagentCatalog>(await fetch(`/api/subagents/agents?cwd=${cwdParam}`)),
        readJson<{ chains: SubagentChain[] }>(await fetch(`/api/subagents/chains?cwd=${cwdParam}`)),
        readJson<SubagentSettings>(await fetch(`/api/subagents/settings?cwd=${cwdParam}&scope=user`)),
        readJson<SubagentSettings>(await fetch(`/api/subagents/settings?cwd=${cwdParam}&scope=project`)),
        readJson<{ modelList?: ModelEntry[] }>(await fetch(`/api/models?cwd=${cwdParam}`)),
      ]);
      setCatalog(agentsData);
      setChains(chainsData.chains);
      setSettings({
        user: { ...EMPTY_SETTINGS, ...userSettings },
        project: { ...EMPTY_SETTINGS, ...projectSettings },
      });
      setModels(modelsData.modelList ?? []);
      setSelectedKey((current) => current ?? (
        agentsData.agents[0] ? `${agentsData.agents[0].scope}:${agentsData.agents[0].name}` : null
      ));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, [cwd]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const selectedAgent = useMemo(() => catalog.agents.find(
    (agent) => `${agent.scope}:${agent.name}` === selectedKey,
  ) ?? null, [catalog.agents, selectedKey]);

  const uniqueAgents = useMemo(() => {
    const byName = new Map<string, SubagentAgent>();
    for (const agent of catalog.agents) byName.set(agent.name, agent);
    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [catalog.agents]);

  const modelOptions = useMemo(() => models.map((model) => ({
    value: `${model.provider}/${model.id}`,
    label: `${model.name || model.id} · ${model.provider}`,
  })), [models]);

  const isDisabled = useCallback((agent: SubagentAgent): boolean => {
    const projectOverride = settings.project.agentOverrides[agent.name];
    if (typeof projectOverride?.disabled === "boolean") return projectOverride.disabled;
    const userOverride = settings.user.agentOverrides[agent.name];
    if (typeof userOverride?.disabled === "boolean") return userOverride.disabled;
    return false;
  }, [settings]);

  const writeSettings = useCallback(async (
    scope: WritableSubagentScope,
    changed: Record<string, unknown>,
  ) => {
    return readJson<{ settings: SubagentSettings }>(await fetch(
      `/api/subagents/settings?cwd=${encodeURIComponent(cwd)}&scope=${scope}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: changed, sessionId }),
      },
    ));
  }, [cwd, sessionId]);

  const toggleAgent = useCallback(async (agent: SubagentAgent) => {
    setBusy(true);
    setError(null);
    try {
      await writeSettings(settingsScope, {
        agentOverrides: {
          [agent.name]: { disabled: !isDisabled(agent) },
        },
      });
      await load();
      onReloaded?.();
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : String(toggleError));
    } finally {
      setBusy(false);
    }
  }, [isDisabled, load, onReloaded, settingsScope, writeSettings]);

  const saveAgent = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const timeoutMs = form.timeoutMs.trim() ? Number(form.timeoutMs) : undefined;
      const agent = {
        name: form.name.trim(),
        description: form.description.trim(),
        tools: parseList(form.tools),
        model: form.model.trim() || undefined,
        fallbackModels: parseList(form.fallbackModels),
        thinking: form.thinking === "false" ? false : form.thinking || undefined,
        systemPromptMode: form.systemPromptMode,
        inheritProjectContext: form.inheritProjectContext,
        inheritSkills: form.inheritSkills,
        skills: parseList(form.skills),
        async: form.async,
        timeoutMs,
        body: form.body,
      };
      const response = await fetch("/api/subagents/agents", {
        method: formMode === "edit" ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cwd,
          scope: form.scope,
          name: formMode === "edit" ? form.name : undefined,
          agent,
          sessionId,
        }),
      });
      await readJson(response);
      setFormMode(null);
      setSelectedKey(`${form.scope}:${form.name.trim()}`);
      await load();
      onReloaded?.();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setBusy(false);
    }
  }, [cwd, form, formMode, load, onReloaded, sessionId]);

  const deleteAgent = useCallback(async (agent: SubagentAgent) => {
    if (agent.scope === "builtin" || !window.confirm(`删除 agent “${agent.name}”？此操作会删除对应 Markdown 文件。`)) return;
    setBusy(true);
    setError(null);
    try {
      await readJson(await fetch("/api/subagents/agents", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd, scope: agent.scope, name: agent.name, sessionId }),
      }));
      setSelectedKey(null);
      setFormMode(null);
      await load();
      onReloaded?.();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : String(deleteError));
    } finally {
      setBusy(false);
    }
  }, [cwd, load, onReloaded, sessionId]);

  const updateScopedSettings = useCallback((
    scope: WritableSubagentScope,
    updater: (current: SubagentSettings) => SubagentSettings,
  ) => {
    setSettings((current) => ({ ...current, [scope]: updater(current[scope]) }));
  }, []);

  const setOverride = useCallback((
    name: string,
    field: "model" | "thinking",
    value: string,
  ) => {
    updateScopedSettings(settingsScope, (current) => {
      const override = { ...(current.agentOverrides[name] ?? {}) };
      if (value) override[field] = value;
      else delete override[field];
      return {
        ...current,
        agentOverrides: { ...current.agentOverrides, [name]: override },
      };
    });
  }, [settingsScope, updateScopedSettings]);

  const saveSettings = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const current = settings[settingsScope];
      const agentOverrides = Object.fromEntries(uniqueAgents.map((agent) => {
        const override = current.agentOverrides[agent.name] ?? {};
        return [agent.name, {
          model: typeof override.model === "string" || override.model === false ? override.model : null,
          thinking: typeof override.thinking === "string" || override.thinking === false ? override.thinking : null,
        }];
      }));
      await writeSettings(settingsScope, {
        defaultModel: current.defaultModel ?? null,
        defaultThinking: current.defaultThinking ?? null,
        agentOverrides,
      });
      await load();
      onReloaded?.();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setBusy(false);
    }
  }, [load, onReloaded, settings, settingsScope, uniqueAgents, writeSettings]);

  const groupedAgents = [
    { scope: "builtin", label: "内置", agents: catalog.agents.filter((agent) => agent.scope === "builtin") },
    { scope: "user", label: "用户", agents: catalog.agents.filter((agent) => agent.scope === "user") },
    { scope: "project", label: "项目", agents: catalog.agents.filter((agent) => agent.scope === "project") },
  ] as const;

  const renderAgentForm = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 650 }}>
      <div style={{ fontSize: 14, fontWeight: 700 }}>{formMode === "add" ? "新建 agent" : `编辑 ${form.name}`}</div>
      {formMode === "add" && (
        <div>
          <label style={labelStyle}>保存范围</label>
          <ScopePicker value={form.scope} onChange={(scope) => setForm({ ...form, scope })} />
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 2fr", gap: 10 }}>
        <Field label="名称">
          <input style={inputStyle} value={form.name} disabled={formMode === "edit"} onChange={(event) => setForm({ ...form, name: event.target.value })} />
        </Field>
        <Field label="描述">
          <input style={inputStyle} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
        </Field>
        <Field label="工具（逗号或换行分隔）">
          <textarea style={{ ...inputStyle, minHeight: 58 }} value={form.tools} onChange={(event) => setForm({ ...form, tools: event.target.value })} />
        </Field>
        <Field label="模型">
          <ModelSelect value={form.model} models={modelOptions} onChange={(model) => setForm({ ...form, model })} />
        </Field>
        <Field label="备用模型">
          <textarea style={{ ...inputStyle, minHeight: 58 }} value={form.fallbackModels} onChange={(event) => setForm({ ...form, fallbackModels: event.target.value })} />
        </Field>
        <Field label="思考级别">
          <select style={inputStyle} value={form.thinking} onChange={(event) => setForm({ ...form, thinking: event.target.value })}>
            <option value="">未设置</option>
            <option value="false">清除思考设置</option>
            {THINKING_LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}
          </select>
        </Field>
        <Field label="提示词模式">
          <select style={inputStyle} value={form.systemPromptMode} onChange={(event) => setForm({ ...form, systemPromptMode: event.target.value as AgentForm["systemPromptMode"] })}>
            <option value="replace">替换</option>
            <option value="append">追加</option>
          </select>
        </Field>
        <Field label="技能（逗号或换行分隔）">
          <textarea style={{ ...inputStyle, minHeight: 58 }} value={form.skills} onChange={(event) => setForm({ ...form, skills: event.target.value })} />
        </Field>
        <Field label="超时（毫秒）">
          <input style={inputStyle} type="number" min={1} value={form.timeoutMs} onChange={(event) => setForm({ ...form, timeoutMs: event.target.value })} />
        </Field>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, fontSize: 12 }}>
        <Check label="继承项目上下文" checked={form.inheritProjectContext} onChange={(value) => setForm({ ...form, inheritProjectContext: value })} />
        <Check label="继承技能" checked={form.inheritSkills} onChange={(value) => setForm({ ...form, inheritSkills: value })} />
        <Check label="默认异步运行" checked={form.async} onChange={(value) => setForm({ ...form, async: value })} />
      </div>
      <Field label="系统提示词正文">
        <textarea style={{ ...inputStyle, minHeight: 180, resize: "vertical" }} value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} />
      </Field>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button style={buttonStyle} disabled={busy} onClick={() => setFormMode(null)}>取消</button>
        <button style={{ ...buttonStyle, background: "var(--accent)", color: "#fff", borderColor: "var(--accent)" }} disabled={busy} onClick={() => void saveAgent()}>
          {busy ? "保存中…" : "保存"}
        </button>
      </div>
    </div>
  );

  const currentSettings = settings[settingsScope];

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div style={{
        width: isMobile ? "calc(100vw - 16px)" : 940,
        maxWidth: "calc(100vw - 16px)",
        height: isMobile ? "calc(100dvh - 16px)" : "82vh",
        maxHeight: "calc(100dvh - 16px)",
        background: "var(--bg)",
        color: "var(--text)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 18px", borderBottom: "1px solid var(--border)" }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Subagents 管理</div>
            <div style={{ maxWidth: isMobile ? 240 : 620, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 10, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>{cwd}</div>
          </div>
          <button onClick={onClose} style={{ border: "none", background: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 20 }}>×</button>
        </div>
        <div style={{ display: "flex", padding: "0 18px", borderBottom: "1px solid var(--border)", gap: 4 }}>
          {([
            ["agents", "Agents"],
            ["settings", "设置"],
            ["chains", "Chains"],
          ] as const).map(([value, label]) => (
            <button key={value} onClick={() => { setTab(value); setFormMode(null); }} style={{
              padding: "10px 14px",
              border: "none",
              borderBottom: tab === value ? "2px solid var(--accent)" : "2px solid transparent",
              background: "none",
              color: tab === value ? "var(--text)" : "var(--text-muted)",
              cursor: "pointer",
              fontWeight: tab === value ? 700 : 400,
            }}>{label}</button>
          ))}
        </div>
        {error && <div style={{ padding: "8px 18px", color: "#f87171", fontSize: 11, borderBottom: "1px solid var(--border)" }}>{error}</div>}
        <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
          {loading ? (
            <div style={{ padding: 20, color: "var(--text-muted)", fontSize: 12 }}>加载中…</div>
          ) : tab === "agents" ? (
            <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", height: "100%" }}>
              <div style={{ width: isMobile ? "100%" : 260, maxHeight: isMobile ? "40%" : undefined, display: "flex", flexDirection: "column", flexShrink: 0, background: "var(--bg-panel)", borderRight: isMobile ? "none" : "1px solid var(--border)", borderBottom: isMobile ? "1px solid var(--border)" : "none" }}>
                <div style={{ padding: "8px 10px", borderBottom: "1px solid var(--border)" }}>
                  <div style={{ marginBottom: 5, fontSize: 10, color: "var(--text-dim)" }}>启停写入范围</div>
                  <ScopePicker value={settingsScope} onChange={setSettingsScope} />
                </div>
                <div style={{ flex: 1, overflowY: "auto", padding: 6 }}>
                  {groupedAgents.map((group) => group.agents.length > 0 && (
                    <div key={group.scope} style={{ marginBottom: 8 }}>
                      <div style={{ padding: "4px 7px", fontSize: 10, color: "var(--text-dim)", fontWeight: 700 }}>{group.label}</div>
                      {group.agents.map((agent) => {
                        const key = `${agent.scope}:${agent.name}`;
                        const disabled = isDisabled(agent);
                        return (
                          <div key={key} onClick={() => { setSelectedKey(key); setFormMode(null); }} style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 7,
                            padding: "7px 8px",
                            borderRadius: 6,
                            cursor: "pointer",
                            background: selectedKey === key && !formMode ? "var(--bg-selected)" : "transparent",
                          }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12, fontFamily: "var(--font-mono)", color: disabled ? "var(--text-dim)" : "var(--text)" }}>{agent.name}</div>
                              {agent.overridesScope && <div style={{ fontSize: 9, color: "var(--text-dim)" }}>覆盖 {agent.overridesScope}</div>}
                            </div>
                            <Toggle enabled={!disabled} disabled={busy} onToggle={() => void toggleAgent(agent)} />
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
                <div style={{ padding: 8, borderTop: "1px solid var(--border)" }}>
                  <button style={{ ...buttonStyle, width: "100%" }} onClick={() => { setForm(emptyAgentForm("project")); setFormMode("add"); }}>+ 新建 agent</button>
                </div>
              </div>
              <div style={{ flex: 1, overflowY: "auto", padding: 18 }}>
                {formMode ? renderAgentForm() : selectedAgent ? (
                  <div style={{ maxWidth: 680 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                      <div>
                        <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "var(--font-mono)" }}>{selectedAgent.name}</div>
                        <div style={{ marginTop: 3, fontSize: 11, color: "var(--text-muted)" }}>{selectedAgent.description}</div>
                      </div>
                      {selectedAgent.scope !== "builtin" && (
                        <div style={{ display: "flex", gap: 6 }}>
                          <button style={buttonStyle} onClick={() => { setForm(formFromAgent(selectedAgent)); setFormMode("edit"); }}>编辑</button>
                          <button style={{ ...buttonStyle, color: "#f87171" }} disabled={busy} onClick={() => void deleteAgent(selectedAgent)}>删除</button>
                        </div>
                      )}
                    </div>
                    <AgentDetails agent={selectedAgent} />
                  </div>
                ) : <div style={{ color: "var(--text-dim)", fontSize: 12 }}>选择一个 agent 查看详情</div>}
              </div>
            </div>
          ) : tab === "settings" ? (
            <div style={{ height: "100%", overflowY: "auto", padding: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Subagents 设置</div>
                  <ScopePicker value={settingsScope} onChange={setSettingsScope} />
                </div>
                <button style={{ ...buttonStyle, background: "var(--accent)", color: "#fff", borderColor: "var(--accent)" }} disabled={busy} onClick={() => void saveSettings()}>
                  {busy ? "保存中…" : "保存设置"}
                </button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12, maxWidth: 780 }}>
                <Field label="默认模型">
                  <ModelSelect value={currentSettings.defaultModel ?? ""} models={modelOptions} onChange={(value) => updateScopedSettings(settingsScope, (current) => ({ ...current, defaultModel: value || undefined }))} />
                </Field>
                <Field label="默认思考级别">
                  <select style={inputStyle} value={currentSettings.defaultThinking ?? ""} onChange={(event) => updateScopedSettings(settingsScope, (current) => ({ ...current, defaultThinking: event.target.value || undefined }))}>
                    <option value="">继承父会话</option>
                    {THINKING_LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}
                  </select>
                </Field>
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>按 agent 覆盖</div>
              <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", maxWidth: 780 }}>
                {uniqueAgents.map((agent) => {
                  const override = currentSettings.agentOverrides[agent.name] ?? {};
                  return (
                    <div key={agent.name} style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "150px 1fr 150px", gap: 8, alignItems: "center", padding: 9, borderBottom: "1px solid var(--border)" }}>
                      <code style={{ fontSize: 11 }}>{agent.name}</code>
                      <ModelSelect value={typeof override.model === "string" ? override.model : ""} models={modelOptions} onChange={(value) => setOverride(agent.name, "model", value)} />
                      <select style={inputStyle} value={typeof override.thinking === "string" ? override.thinking : ""} onChange={(event) => setOverride(agent.name, "thinking", event.target.value)}>
                        <option value="">继承</option>
                        {THINKING_LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div style={{ height: "100%", overflowY: "auto", padding: 18 }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Chains（只读）</div>
              {chains.length === 0 ? <div style={{ color: "var(--text-dim)", fontSize: 12 }}>尚未发现 user 或 project chains。</div> : chains.map((chain) => (
                <div key={`${chain.scope}:${chain.filePath}`} style={{ padding: 12, marginBottom: 8, border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-panel)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <code style={{ fontSize: 12, fontWeight: 700 }}>{chain.name}</code>
                    <span style={{ fontSize: 9, color: "var(--text-dim)" }}>{chain.scope}</span>
                  </div>
                  <div style={{ marginTop: 5, fontSize: 11, color: "var(--text-muted)" }}>{chain.description || "无描述"}</div>
                  <div style={{ marginTop: 5, fontSize: 9, color: "var(--text-dim)", fontFamily: "var(--font-mono)", wordBreak: "break-all" }}>{chain.filePath}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label style={labelStyle}>{label}</label>{children}</div>;
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--text)", cursor: "pointer", fontSize: 12 }}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

function ScopePicker({ value, onChange }: { value: WritableSubagentScope; onChange: (scope: WritableSubagentScope) => void }) {
  return (
    <div style={{ display: "flex", gap: 12, fontSize: 11 }}>
      {([
        ["user", "用户级"],
        ["project", "项目级"],
      ] as const).map(([scope, label]) => (
        <label key={scope} style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
          <input type="radio" checked={value === scope} onChange={() => onChange(scope)} />
          {label}
        </label>
      ))}
    </div>
  );
}

function ModelSelect({
  value,
  models,
  onChange,
}: {
  value: string;
  models: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  const hasCurrent = !value || models.some((model) => model.value === value);
  return (
    <select style={inputStyle} value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">继承 / 未设置</option>
      {!hasCurrent && <option value={value}>{value}</option>}
      {models.map((model) => <option key={model.value} value={model.value}>{model.label}</option>)}
    </select>
  );
}

function AgentDetails({ agent }: { agent: SubagentAgent }) {
  const details = [
    ["范围", agent.scope],
    ["工具", (agent.tools ?? []).join(", ") || "未设置"],
    ["模型", agent.model || "继承"],
    ["备用模型", (agent.fallbackModels ?? []).join(", ") || "未设置"],
    ["思考", agent.thinking === false ? "false" : agent.thinking || "未设置"],
    ["提示词模式", agent.systemPromptMode ?? "replace"],
    ["继承项目上下文", agent.inheritProjectContext ? "是" : "否"],
    ["继承技能", agent.inheritSkills ? "是" : "否"],
    ["技能", (agent.skills ?? []).join(", ") || "未设置"],
    ["异步", agent.async ? "是" : "否"],
    ["超时", agent.timeoutMs ? `${agent.timeoutMs} ms` : "未设置"],
  ];
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: "7px 12px", marginTop: 18, fontSize: 11 }}>
        {details.map(([label, value]) => (
          <div key={label} style={{ display: "contents" }}>
            <span style={{ color: "var(--text-dim)" }}>{label}</span>
            <span style={{ color: "var(--text)", fontFamily: "var(--font-mono)", wordBreak: "break-word" }}>{value}</span>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 18 }}>
        <div style={labelStyle}>系统提示词正文</div>
        <pre style={{ margin: 0, padding: 12, whiteSpace: "pre-wrap", wordBreak: "break-word", background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", fontSize: 11, fontFamily: "var(--font-mono)" }}>{agent.body || "（空）"}</pre>
      </div>
      <div style={{ marginTop: 12, color: "var(--text-dim)", fontFamily: "var(--font-mono)", fontSize: 9, wordBreak: "break-all" }}>{agent.filePath}</div>
    </>
  );
}
