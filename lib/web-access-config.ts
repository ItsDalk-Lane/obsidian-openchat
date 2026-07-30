import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const WEB_ACCESS_MASK = "***";

export const WEB_ACCESS_API_KEY_FIELDS = [
  "openaiApiKey",
  "braveApiKey",
  "exaApiKey",
  "tavilyApiKey",
  "parallelApiKey",
  "perplexityApiKey",
  "geminiApiKey",
  "tinyfishApiKey",
  "serpdiveApiKey",
  "anysearchApiKey",
] as const;

export type WebAccessApiKeyField = (typeof WEB_ACCESS_API_KEY_FIELDS)[number];

const MANAGED_TOP_LEVEL_FIELDS = [
  ...WEB_ACCESS_API_KEY_FIELDS,
  "provider",
  "searxngBaseUrl",
  "workflow",
] as const;

type ManagedTopLevelField = (typeof MANAGED_TOP_LEVEL_FIELDS)[number];

export type WebAccessConfig = Partial<Record<ManagedTopLevelField, unknown>> & {
  webSearch?: {
    enabled?: unknown;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getWebAccessConfigDir(): string {
  if (process.env.PI_CODING_AGENT_DIR) return process.env.PI_CODING_AGENT_DIR;
  if (process.env.XDG_CONFIG_HOME) return join(process.env.XDG_CONFIG_HOME, "pi");
  return join(homedir(), ".pi");
}

export function getWebAccessConfigPath(): string {
  return join(getWebAccessConfigDir(), "web-search.json");
}

function readRawConfig(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`无法解析 pi-web-access 配置 ${path}: ${message}`);
  }

  if (!isRecord(parsed)) {
    throw new Error(`无法解析 pi-web-access 配置 ${path}: 顶层必须是 JSON 对象`);
  }
  return parsed;
}

function isApiKeyField(field: ManagedTopLevelField): field is WebAccessApiKeyField {
  return (WEB_ACCESS_API_KEY_FIELDS as readonly string[]).includes(field);
}

function maskManagedConfig(raw: Record<string, unknown>): WebAccessConfig {
  const config: WebAccessConfig = {};
  for (const field of MANAGED_TOP_LEVEL_FIELDS) {
    if (!Object.hasOwn(raw, field)) continue;
    const value = raw[field];
    config[field] = isApiKeyField(field) && typeof value === "string" && value.length > 0
      ? WEB_ACCESS_MASK
      : value;
  }

  if (isRecord(raw.webSearch) && Object.hasOwn(raw.webSearch, "enabled")) {
    config.webSearch = { enabled: raw.webSearch.enabled };
  }
  return config;
}

export function readWebAccessConfig(): WebAccessConfig {
  return maskManagedConfig(readRawConfig(getWebAccessConfigPath()));
}

function writeRawConfig(path: string, raw: Record<string, unknown>): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmpPath = `${path}.${process.pid}.tmp`;
  writeFileSync(tmpPath, `${JSON.stringify(raw, null, 2)}\n`, "utf8");
  renameSync(tmpPath, path);
}

export function saveWebAccessConfig(updates: WebAccessConfig): WebAccessConfig {
  const path = getWebAccessConfigPath();
  const raw = readRawConfig(path);

  for (const field of MANAGED_TOP_LEVEL_FIELDS) {
    if (!Object.hasOwn(updates, field)) continue;
    const nextValue = updates[field];
    if (isApiKeyField(field) && nextValue === WEB_ACCESS_MASK) {
      // 没有旧值时忽略掩码，避免把占位符误存成真正密钥。
      continue;
    }
    raw[field] = nextValue;
  }

  if (isRecord(updates.webSearch) && Object.hasOwn(updates.webSearch, "enabled")) {
    const currentWebSearch = isRecord(raw.webSearch) ? raw.webSearch : {};
    raw.webSearch = {
      ...currentWebSearch,
      enabled: updates.webSearch.enabled,
    };
  }

  writeRawConfig(path, raw);
  return maskManagedConfig(raw);
}
