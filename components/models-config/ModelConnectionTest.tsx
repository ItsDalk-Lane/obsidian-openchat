"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiRequestError, requestJson } from "@/lib/api-client";
import type { ModelTestResponse } from "@/lib/api-types";
import type { ModelEntry, ProviderEntry } from "@/lib/model-config";

type ModelTestState =
  | { phase: "idle" }
  | { phase: "testing" }
  | { phase: "success"; latencyMs?: number; status?: number; responseText?: string }
  | { phase: "error"; message: string; latencyMs?: number; status?: number };

export function ModelConnectionTest({
  providerName,
  provider,
  model,
}: {
  providerName: string;
  provider: ProviderEntry;
  model: ModelEntry;
}) {
  const [testState, setTestState] = useState<ModelTestState>({ phase: "idle" });

  const testSummary = (() => {
    if (testState.phase === "idle") return null;
    if (testState.phase === "testing") return "正在测试模型连接...";
    const meta = [
      testState.latencyMs !== undefined ? `${testState.latencyMs}ms` : null,
      testState.status !== undefined ? `HTTP ${testState.status}` : null,
    ].filter(Boolean);
    if (testState.phase === "success") {
      return ["已连接", ...meta, testState.responseText || null].filter(Boolean).join(" · ");
    }
    return ["失败", ...meta, testState.message].filter(Boolean).join(" · ");
  })();

  useEffect(() => {
    setTestState({ phase: "idle" });
  }, [providerName, provider.baseUrl, provider.api, provider.apiKey, model.id, model.api]);

  const handleTest = useCallback(async () => {
    if (!model.id.trim() || testState.phase === "testing") return;
    setTestState({ phase: "testing" });
    try {
      const data = await requestJson<ModelTestResponse>("/api/models-config/test", {
        method: "POST",
        json: { providerName, provider, model },
      });
      if (!data.ok) {
        setTestState({
          phase: "error",
          message: data.error ?? "模型连接测试未返回成功状态",
          latencyMs: data.latencyMs,
          status: data.status,
        });
        return;
      }
      setTestState({
        phase: "success",
        latencyMs: data.latencyMs,
        status: data.status,
        responseText: data.responseText,
      });
    } catch (error) {
      const detail = error instanceof ApiRequestError
        ? error.data as ModelTestResponse | undefined
        : undefined;
      setTestState({
        phase: "error",
        message: error instanceof Error ? error.message : String(error),
        latencyMs: detail?.latencyMs,
        status: detail?.status,
      });
    }
  }, [model, provider, providerName, testState.phase]);

  return (
    <>
      {testSummary && (
        <span
          title={testSummary}
          style={{
            maxWidth: 260,
            height: 24,
            padding: "0 8px",
            border: `1px solid ${testState.phase === "error" ? "#fecaca" : testState.phase === "success" ? "#bbf7d0" : "var(--border)"}`,
            borderRadius: 4,
            background: testState.phase === "error" ? "#fee2e2" : testState.phase === "success" ? "#dcfce7" : "#e5e7eb",
            color: "#111827",
            fontSize: 11,
            display: "inline-flex",
            alignItems: "center",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            boxSizing: "border-box",
          }}
        >
          {testSummary}
        </span>
      )}
      <button
        onClick={handleTest}
        disabled={!model.id.trim() || testState.phase === "testing"}
        title="测试模型连接"
        style={{
          height: 24,
          padding: "0 8px",
          background: testState.phase === "success" ? "#16a34a" : "none",
          border: `1px solid ${testState.phase === "success" ? "#16a34a" : "var(--border)"}`,
          borderRadius: 4,
          color: testState.phase === "success" ? "#fff" : (!model.id.trim() || testState.phase === "testing") ? "var(--text-dim)" : "var(--text-muted)",
          cursor: (!model.id.trim() || testState.phase === "testing") ? "not-allowed" : "pointer",
          fontSize: 11,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          boxSizing: "border-box",
          gap: 5,
        }}
      >
        {testState.phase === "success" && (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
        {testState.phase === "testing" ? "测试中…" : testState.phase === "success" ? "成功" : "测试"}
      </button>
    </>
  );
}
