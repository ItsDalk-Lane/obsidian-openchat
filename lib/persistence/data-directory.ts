import { mkdirSync } from "fs";
import { join, resolve } from "path";
import { getAgentDir } from "@/lib/session-reader";

export const PI_WEB_DATA_DIR_ENV = "PI_WEB_DATA_DIR";

export function resolvePiWebDataDir(env: NodeJS.ProcessEnv = process.env, agentDir = getAgentDir()): string {
  const configured = env[PI_WEB_DATA_DIR_ENV]?.trim();
  if (configured) return resolve(configured);
  return join(agentDir, "pi-web");
}

export function ensurePiWebDataDir(env: NodeJS.ProcessEnv = process.env, agentDir = getAgentDir()): string {
  const dataDir = resolvePiWebDataDir(env, agentDir);
  mkdirSync(dataDir, { recursive: true });
  return dataDir;
}

export function resolveKernelDatabasePath(env: NodeJS.ProcessEnv = process.env, agentDir = getAgentDir()): string {
  return join(resolvePiWebDataDir(env, agentDir), "kernel.sqlite");
}
