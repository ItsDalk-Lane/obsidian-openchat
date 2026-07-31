import { stripAnsi } from "./ansi";
import type { ExtensionStatusItem } from "./types";

type Translate = (key: string, params?: Record<string, string | number>) => string;

// Status texts emitted by the bundled pi-mcp-adapter: init.ts updateStatusBar()
// (enabled summary), init.ts/proxy-modes.ts connect flows, commands.ts OAuth flow.
// The adapter is locale-unaware and always emits English, so the web UI rewrites
// the known patterns through its own i18n before rendering. Unknown texts pass
// through untouched. Matching runs on ANSI-stripped text; matched texts are
// re-emitted without color codes (the status line renders in --text-muted anyway).
const MCP_ENABLED_PATTERN =
  /^🔌 MCP: (\d+) servers? enabled(?: \((\d+) connected\))?(?: \((\d+) disabled\))?$/;
const MCP_CONNECTING_MANY_PATTERN = /^🔌 MCP: connecting to (\d+) servers\.\.\.$/;
const MCP_CONNECTING_ONE_PATTERN = /^🔌 MCP: connecting to (.+)\.\.\.$/;
const MCP_AUTHENTICATING_PATTERN = /^Authenticating (.+)\.\.\.$/;

export function localizeExtensionStatusText(text: string, t: Translate): string {
  const plain = stripAnsi(text).trim();

  const enabled = MCP_ENABLED_PATTERN.exec(plain);
  if (enabled) {
    const count = Number(enabled[1]);
    let localized = count === 1
      ? t("extension.mcp.enabledOne", { count })
      : t("extension.mcp.enabledMany", { count });
    if (enabled[2]) {
      localized += t("extension.mcp.connectedSuffix", { count: Number(enabled[2]) });
    }
    if (enabled[3]) {
      localized += t("extension.mcp.disabledSuffix", { count: Number(enabled[3]) });
    }
    return localized;
  }

  const connectingMany = MCP_CONNECTING_MANY_PATTERN.exec(plain);
  if (connectingMany) {
    return t("extension.mcp.connectingMany", { count: Number(connectingMany[1]) });
  }

  const connectingOne = MCP_CONNECTING_ONE_PATTERN.exec(plain);
  if (connectingOne) {
    return t("extension.mcp.connectingOne", { name: connectingOne[1] });
  }

  const authenticating = MCP_AUTHENTICATING_PATTERN.exec(plain);
  if (authenticating) {
    return t("extension.mcp.authenticating", { name: authenticating[1] });
  }

  return text;
}

export function localizeExtensionStatuses(
  statuses: ExtensionStatusItem[],
  t: Translate,
): ExtensionStatusItem[] {
  return statuses.map((status) => {
    const text = localizeExtensionStatusText(status.text, t);
    return text === status.text ? status : { ...status, text };
  });
}
