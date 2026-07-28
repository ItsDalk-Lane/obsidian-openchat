"use client";

import type { SlashCommandInfo } from "@/hooks/useAgentSession";

export type SlashCommandPaletteItem = SlashCommandInfo | {
  name: string;
  description: string;
  source: "builtin";
};

export type SlashCommandSource = SlashCommandPaletteItem["source"];

export interface SlashCommandGroup {
  source: SlashCommandSource;
  items: { command: SlashCommandPaletteItem; index: number }[];
}

const SOURCE_LABEL: Record<SlashCommandSource, string> = {
  builtin: "内置",
  extension: "扩展",
  prompt: "提示词",
  skill: "技能",
};

export function SlashCommandMenu({
  loading,
  countLabel,
  commandCount,
  groups,
  activeIndex,
  onApply,
  onHover,
  setItemRef,
}: {
  loading?: boolean;
  countLabel: string;
  commandCount: number;
  groups: SlashCommandGroup[];
  activeIndex: number;
  onApply: (command: SlashCommandPaletteItem) => void;
  onHover: (index: number) => void;
  setItemRef: (index: number, node: HTMLButtonElement | null) => void;
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: "calc(100% + 8px)",
        zIndex: 120,
        background: "var(--bg)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        boxShadow: "0 -6px 20px rgba(0,0,0,0.12)",
        overflow: "hidden",
        maxHeight: "min(56vh, 460px)",
      }}
    >
      <div
        style={{
          padding: "8px 10px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          fontSize: 11,
          color: "var(--text-dim)",
        }}
      >
        <span>{loading ? "加载命令中..." : `斜杠命令 · ${countLabel}`}</span>
        <span style={{ fontFamily: "var(--font-mono)" }}>Tab / Enter</span>
      </div>
      <div style={{ maxHeight: "calc(min(56vh, 460px) - 34px)", overflowY: "auto", padding: 10 }}>
        {!loading && commandCount === 0 ? (
          <div style={{ padding: "2px 2px 4px", fontSize: 12, color: "var(--text-dim)" }}>
            未找到扩展、提示词或技能命令
          </div>
        ) : (
          groups.map((group) => (
            <section key={group.source} style={{ marginBottom: 12 }}>
              <div
                style={{
                  position: "sticky",
                  top: -10,
                  zIndex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  padding: "4px 0 6px",
                  background: "var(--bg)",
                  color: "var(--text-dim)",
                  fontSize: 10,
                  fontWeight: 600,
                  textTransform: "uppercase",
                }}
              >
                <span>{SOURCE_LABEL[group.source]}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontWeight: 500 }}>{group.items.length}</span>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: 8,
                }}
              >
                {group.items.map(({ command, index }) => {
                  const active = index === activeIndex;
                  return (
                    <button
                      key={`${command.source}:${command.name}`}
                      ref={(node) => setItemRef(index, node)}
                      type="button"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        onApply(command);
                      }}
                      onMouseEnter={() => onHover(index)}
                      style={{
                        width: "100%",
                        minWidth: 0,
                        minHeight: 58,
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                        justifyContent: "center",
                        padding: "9px 10px",
                        border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
                        borderRadius: 7,
                        background: active ? "var(--bg-selected)" : "var(--bg-panel)",
                        color: "var(--text)",
                        cursor: "pointer",
                        textAlign: "left",
                        boxShadow: active ? "0 0 0 1px color-mix(in srgb, var(--accent) 28%, transparent)" : "none",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 13,
                          fontFamily: "var(--font-mono)",
                          overflowWrap: "anywhere",
                          wordBreak: "break-word",
                        }}
                      >
                        /{command.name}
                      </span>
                      {command.description && (
                        <span
                          style={{
                            display: "-webkit-box",
                            WebkitBoxOrient: "vertical",
                            WebkitLineClamp: 2,
                            overflow: "hidden",
                            fontSize: 11,
                            lineHeight: 1.35,
                            color: "var(--text-dim)",
                          }}
                        >
                          {command.description}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
