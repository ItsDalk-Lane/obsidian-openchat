import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const {
  localizeExtensionStatusText,
  localizeExtensionStatuses,
} = await jiti.import("./extension-status-i18n.ts");
const { zhCNLocale } = await jiti.import("./i18n/messages/zh-CN.ts");
const { enLocale } = await jiti.import("./i18n/messages/en.ts");

function makeT(messages) {
  return (key, params = {}) =>
    messages[key].replace(/\{([\w.-]+)\}/g, (token, name) =>
      params[name] === undefined ? token : String(params[name]),
    );
}

const zhT = makeT(zhCNLocale.messages);
const enT = makeT(enLocale.messages);

test("localizes the enabled summary to zh-CN", () => {
  assert.equal(
    localizeExtensionStatusText("🔌 MCP: 3 servers enabled", zhT),
    "🔌 MCP：3 个服务器已启用",
  );
});

test("localizes connected/disabled suffixes to zh-CN", () => {
  assert.equal(
    localizeExtensionStatusText("🔌 MCP: 3 servers enabled (1 connected) (2 disabled)", zhT),
    "🔌 MCP：3 个服务器已启用（1 个已连接）（2 个已禁用）",
  );
});

test("rebuilds the singular English summary", () => {
  assert.equal(
    localizeExtensionStatusText("🔌 MCP: 1 server enabled (1 connected)", enT),
    "🔌 MCP: 1 server enabled (1 connected)",
  );
});

test("localizes transient connect/auth states", () => {
  assert.equal(
    localizeExtensionStatusText("🔌 MCP: connecting to 2 servers...", zhT),
    "🔌 MCP：正在连接 2 个服务器…",
  );
  assert.equal(
    localizeExtensionStatusText("🔌 MCP: connecting to zread...", zhT),
    "🔌 MCP：正在连接 zread…",
  );
  assert.equal(
    localizeExtensionStatusText("Authenticating zread...", zhT),
    "正在认证 zread…",
  );
});

test("matches through ANSI color codes", () => {
  assert.equal(
    localizeExtensionStatusText("\x1b[32m🔌 MCP: 3 servers enabled\x1b[0m", zhT),
    "🔌 MCP：3 个服务器已启用",
  );
});

test("passes unknown status texts through untouched", () => {
  const text = "\x1b[32mmy-extension: doing things\x1b[0m";
  assert.equal(localizeExtensionStatusText(text, zhT), text);
});

test("maps status item lists and preserves identity for untouched items", () => {
  const untouched = { key: "other", text: "custom status" };
  const result = localizeExtensionStatuses(
    [untouched, { key: "mcp", text: "🔌 MCP: 1 server enabled" }],
    zhT,
  );
  assert.equal(result[0], untouched);
  assert.deepEqual(result[1], { key: "mcp", text: "🔌 MCP：1 个服务器已启用" });
});
