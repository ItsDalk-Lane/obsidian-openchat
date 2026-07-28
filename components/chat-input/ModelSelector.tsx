"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

interface ModelOption {
  provider: string;
  modelId: string;
  name: string;
}

const MODEL_OPTION_COLLATOR = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

function compareModelOptions(a: ModelOption, b: ModelOption): number {
  return MODEL_OPTION_COLLATOR.compare(a.name || a.modelId, b.name || b.modelId)
    || MODEL_OPTION_COLLATOR.compare(a.provider, b.provider)
    || MODEL_OPTION_COLLATOR.compare(a.modelId, b.modelId);
}

export function ModelSelector({
  model,
  isAutoModelSelection,
  modelNames,
  modelList,
  modelError,
  onModelChange,
  isStreaming,
  isMobile,
  closeSignal,
}: {
  model?: { provider: string; modelId: string } | null;
  isAutoModelSelection?: boolean;
  modelNames?: Record<string, string>;
  modelList?: { id: string; name: string; provider: string }[];
  modelError?: string | null;
  onModelChange?: (provider: string, modelId: string) => void;
  isStreaming: boolean;
  isMobile: boolean;
  closeSignal: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [triggerRect, setTriggerRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (closeSignal) setOpen(false);
  }, [closeSignal]);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (
        triggerRef.current
        && !triggerRef.current.contains(event.target as Node)
        && panelRef.current
        && !panelRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const modelOptions: ModelOption[] = modelList && modelList.length > 0
    ? modelList
      .map((entry) => ({ provider: entry.provider, modelId: entry.id, name: entry.name }))
      .sort(compareModelOptions)
    : Object.entries(modelNames ?? {})
      .map(([modelId, name]) => ({
        provider: model?.provider ?? "unknown",
        modelId,
        name,
      }))
      .sort(compareModelOptions);

  const modelsByProvider: { provider: string; options: ModelOption[] }[] = [];
  for (const option of modelOptions) {
    const group = modelsByProvider.find((entry) => entry.provider === option.provider);
    if (group) group.options.push(option);
    else modelsByProvider.push({ provider: option.provider, options: [option] });
  }

  const currentName = model
    ? modelOptions.find((option) => (
      option.modelId === model.modelId && option.provider === model.provider
    ))?.name ?? model.modelId
    : null;

  if (!(modelOptions.length > 0 || currentName || modelError) || !onModelChange) {
    return null;
  }

  return (
    <div ref={triggerRef} style={{ position: "relative", flex: isMobile ? "1 1 auto" : undefined, minWidth: 0 }}>
      <button
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          setTriggerRect({ top: rect.top, left: rect.left, width: rect.width });
          setOpen((current) => !current);
        }}
        disabled={isStreaming}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          justifyContent: isMobile ? "flex-start" : undefined,
          padding: isMobile ? "8px 10px" : "8px 12px",
          height: 32,
          width: isMobile ? "100%" : undefined,
          maxWidth: isMobile ? "100%" : 220,
          overflow: "hidden",
          background: open ? "var(--bg-hover)" : "none",
          border: "none",
          borderRadius: 9,
          color: "var(--text-muted)",
          cursor: isStreaming ? "not-allowed" : "pointer",
          fontSize: 12,
          opacity: isStreaming ? 0.5 : 1,
          transition: "background 0.12s, color 0.12s",
        }}
        onMouseEnter={(event) => {
          if (isStreaming) return;
          event.currentTarget.style.background = "var(--bg-hover)";
          event.currentTarget.style.color = "var(--text)";
        }}
        onMouseLeave={(event) => {
          event.currentTarget.style.background = open ? "var(--bg-hover)" : "none";
          event.currentTarget.style.color = "var(--text-muted)";
        }}
        title={modelOptions.length > 0 ? "切换模型" : "无可用模型"}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <rect x="9" y="9" width="6" height="6" />
          <line x1="9" y1="1" x2="9" y2="4" />
          <line x1="15" y1="1" x2="15" y2="4" />
          <line x1="9" y1="20" x2="9" y2="23" />
          <line x1="15" y1="20" x2="15" y2="23" />
          <line x1="20" y1="9" x2="23" y2="9" />
          <line x1="20" y1="14" x2="23" y2="14" />
          <line x1="1" y1="9" x2="4" y2="9" />
          <line x1="1" y1="14" x2="4" y2="14" />
        </svg>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
          {currentName ?? (modelOptions.length > 0 ? "选择模型" : "无模型")}
        </span>
      </button>
      {open && triggerRect && (() => {
        const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
        const bottom = viewportHeight - triggerRect.top + 6;
        const maxHeight = Math.max(120, Math.min(triggerRect.top - 8, viewportHeight * 0.6));
        const panelPosition: CSSProperties = isMobile
          ? { left: 8, right: 8, maxWidth: "calc(100vw - 16px)" }
          : { left: triggerRect.left, width: "max-content", minWidth: triggerRect.width };

        return (
          <div
            ref={panelRef}
            style={{
              position: "fixed",
              bottom,
              ...panelPosition,
              zIndex: 500,
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              boxShadow: "0 -4px 16px rgba(0,0,0,0.10)",
              overflow: "hidden",
              maxHeight,
              overflowY: "auto",
            }}
          >
            {modelsByProvider.length === 0 ? (
              <div style={{ padding: "8px 12px", color: "var(--text-dim)", fontSize: 12, whiteSpace: "nowrap" }}>
                无可用模型
              </div>
            ) : modelsByProvider.map((group, groupIndex) => (
              <div key={group.provider}>
                {modelsByProvider.length > 1 && (
                  <div
                    style={{
                      padding: "6px 12px 4px",
                      fontSize: 10,
                      fontWeight: 600,
                      color: "var(--text-dim)",
                      textTransform: "uppercase",
                      letterSpacing: "0.07em",
                      borderTop: groupIndex > 0 ? "1px solid var(--border)" : "none",
                    }}
                  >
                    {group.provider}
                  </div>
                )}
                {group.options.map((option) => {
                  const active = option.modelId === model?.modelId && option.provider === model?.provider;
                  return (
                    <button
                      key={`${option.provider}:${option.modelId}`}
                      onClick={() => {
                        setOpen(false);
                        if (!active || isAutoModelSelection) {
                          onModelChange(option.provider, option.modelId);
                        }
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        width: "100%",
                        padding: "7px 12px",
                        background: active ? "var(--bg-selected)" : "none",
                        border: "none",
                        color: active ? "var(--text)" : "var(--text-muted)",
                        cursor: "pointer",
                        fontSize: 12,
                        textAlign: "left",
                        fontWeight: active ? 600 : 400,
                        whiteSpace: "nowrap",
                      }}
                      onMouseEnter={(event) => {
                        if (!active) event.currentTarget.style.background = "var(--bg-hover)";
                      }}
                      onMouseLeave={(event) => {
                        if (!active) event.currentTarget.style.background = "none";
                      }}
                    >
                      {active ? (
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                          <polyline points="1.5 5 4 7.5 8.5 2.5" />
                        </svg>
                      ) : (
                        <span style={{ width: 10, flexShrink: 0 }} />
                      )}
                      {option.name}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        );
      })()}
    </div>
  );
}
