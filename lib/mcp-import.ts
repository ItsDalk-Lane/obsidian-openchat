import type { McpServerEntry } from "./mcp-config";

// ============================================================================
// 粘贴 JSON 导入 MCP 服务器
//
// 识别三种粘贴形态：
//   1. 标准包装：{ "mcpServers": { "<name>": { ... } } }（Claude/Cursor 风格，
//      可能带 ```json 代码围栏）
//   2. 裸 map：{ "<name>": { ... } }
//   3. 单条目裸对象：{ "command": ... } 或 { "url": ... }（未命名，交由表单补名称）
//
// Claude 风格的 "type": "stdio"|"http"|"sse" 键会被丢弃——pi 的配置格式由
// command/url 的存在推导传输方式，写入冗余 type 只会污染配置文件。
// ============================================================================

export interface ImportedMcpServer {
  name: string;
  entry: McpServerEntry;
}

export interface McpImportParse {
  /** 已命名的服务器，可直接保存。 */
  servers: ImportedMcpServer[];
  /** 粘贴内容是单个未命名服务器对象时非空。 */
  unnamedEntry: McpServerEntry | null;
}

const VALID_LIFECYCLES = new Set(["lazy", "eager", "keep-alive", "lazy-keep-alive"]);

function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```[a-zA-Z]*\s*\n([\s\S]*?)\n?\s*```$/.exec(trimmed);
  return fenced ? fenced[1].trim() : trimmed;
}

function normalizeStringRecord(
  label: string,
  value: unknown,
  field: string,
): Record<string, string> | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label}的 ${field} 必须是对象`);
  }
  const out: Record<string, string> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof item !== "string") {
      throw new Error(`${label}的 ${field}.${key} 必须是字符串`);
    }
    out[key] = item;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function normalizeEntry(label: string, raw: unknown): McpServerEntry {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${label}的配置必须是对象`);
  }
  const input = raw as Record<string, unknown>;
  const command = typeof input.command === "string" ? input.command.trim() : "";
  const url = typeof input.url === "string" ? input.url.trim() : "";
  if (!command && !url) {
    throw new Error(`${label} 缺少 command（stdio）或 url（http）`);
  }

  const entry: McpServerEntry = {};
  if (command) {
    entry.command = command;
    if (input.args !== undefined) {
      if (!Array.isArray(input.args) || input.args.some((arg) => typeof arg !== "string")) {
        throw new Error(`${label}的 args 必须是字符串数组`);
      }
      if (input.args.length > 0) entry.args = input.args as string[];
    }
    const env = normalizeStringRecord(label, input.env, "env");
    if (env) entry.env = env;
    if (typeof input.cwd === "string" && input.cwd.trim()) entry.cwd = input.cwd.trim();
  } else {
    entry.url = url;
    const headers = normalizeStringRecord(label, input.headers, "headers");
    if (headers) entry.headers = headers;
    if (input.auth === "oauth" || input.auth === "bearer" || input.auth === false) {
      entry.auth = input.auth;
    }
    if (typeof input.bearerToken === "string") entry.bearerToken = input.bearerToken;
    if (typeof input.bearerTokenEnv === "string") entry.bearerTokenEnv = input.bearerTokenEnv;
  }

  if (typeof input.lifecycle === "string" && input.lifecycle) {
    if (!VALID_LIFECYCLES.has(input.lifecycle)) {
      throw new Error(`${label}的 lifecycle 无效："${input.lifecycle}"`);
    }
    entry.lifecycle = input.lifecycle as McpServerEntry["lifecycle"];
  }
  return entry;
}

export function parseMcpImport(text: string): McpImportParse {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFence(text));
  } catch (error) {
    throw new Error(`JSON 解析失败：${error instanceof Error ? error.message : String(error)}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("粘贴的内容必须是 JSON 对象");
  }
  const obj = parsed as Record<string, unknown>;

  if ("mcpServers" in obj) {
    const map = obj.mcpServers;
    if (!map || typeof map !== "object" || Array.isArray(map)) {
      throw new Error("mcpServers 必须是对象");
    }
    const servers = namedServers(map as Record<string, unknown>);
    if (servers.length === 0) throw new Error("mcpServers 为空");
    return { servers, unnamedEntry: null };
  }

  if ("command" in obj || "url" in obj) {
    return { servers: [], unnamedEntry: normalizeEntry("粘贴的配置", obj) };
  }

  const servers = namedServers(obj);
  if (servers.length === 0) throw new Error("粘贴的 JSON 对象为空");
  return { servers, unnamedEntry: null };
}

function namedServers(map: Record<string, unknown>): ImportedMcpServer[] {
  return Object.entries(map).map(([rawName, rawEntry]) => {
    const name = rawName.trim();
    if (!name) throw new Error("服务器名称不能为空");
    return { name, entry: normalizeEntry(`服务器 "${name}"`, rawEntry) };
  });
}
