"use client";

import { parseAnsiLine, stripAnsi } from "@/lib/ansi";
import type { ExtensionStatusItem } from "@/lib/types";

export function sanitizeExtensionStatusText(text: string): string {
  return text
    .replace(/[\r\n\t]/g, " ")
    .replace(/ +/g, " ")
    .trim();
}

export function formatExtensionStatusLine(
  statuses: ExtensionStatusItem[],
): string {
  return [...statuses]
    .sort((left, right) => left.key.localeCompare(right.key))
    .map(({ text }) => sanitizeExtensionStatusText(text))
    .join(" ");
}

export function ExtensionStatusText({
  statuses,
}: {
  statuses: ExtensionStatusItem[];
}) {
  const statusLine = formatExtensionStatusLine(statuses);
  const plainStatusLine = stripAnsi(statusLine);

  return (
    <span
      role="status"
      aria-label={plainStatusLine}
      title={plainStatusLine}
      style={{
        minWidth: 0,
        overflow: "hidden",
        color: "var(--text-muted)",
        fontSize: 11,
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
    >
      {parseAnsiLine(statusLine).map((segment, index) => (
        <span key={index} style={segment.style}>{segment.text}</span>
      ))}
    </span>
  );
}

export function ExtensionStatusBar({
  statuses,
}: {
  statuses: ExtensionStatusItem[];
}) {
  if (statuses.length === 0) return null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        flexShrink: 0,
        minWidth: 0,
        height: 36,
        padding: "0 12px",
        borderTop: "1px solid var(--border)",
        background: "var(--bg-panel)",
      }}
    >
      <ExtensionStatusText statuses={statuses} />
    </div>
  );
}
