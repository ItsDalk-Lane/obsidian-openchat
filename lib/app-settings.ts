import "server-only";

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { resolvePiWebDataDir } from "@/lib/persistence/data-directory";

export interface AppSettings {
  defaultCwd?: string | null;
}

function getSettingsPath(): string {
  return join(resolvePiWebDataDir(), "settings.json");
}

export function readAppSettings(): AppSettings {
  const path = getSettingsPath();
  if (!existsSync(path)) return {};

  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const record = parsed as { defaultCwd?: unknown };

    if (record.defaultCwd === null) return { defaultCwd: null };
    if (typeof record.defaultCwd === "string") return { defaultCwd: record.defaultCwd };
    return {};
  } catch {
    return {};
  }
}

export function writeAppSettings(settings: AppSettings): void {
  const path = getSettingsPath();
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const payload: AppSettings = {};
  if (settings.defaultCwd === null || typeof settings.defaultCwd === "string") {
    payload.defaultCwd = settings.defaultCwd;
  }

  writeFileSync(path, JSON.stringify(payload, null, 2), "utf8");
}
