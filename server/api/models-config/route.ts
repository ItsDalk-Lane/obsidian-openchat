import { ApiResponse } from "@/server/http";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { writePrivateFileAtomicSync } from "@/lib/atomic-file";
import { invalidateModelsCache } from "@/lib/models-cache";

export const dynamic = "force-dynamic";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Drop blank model rows the editor can emit (no id / whitespace-only id), then
 * drop provider entries left with no meaningful content. A models.json entry
 * like `{}` or `{ "models": [] }` makes the SDK provider composer throw
 * ("must specify baseUrl, headers, compat, modelOverrides, or models") and
 * poisons the whole model load — removing it is always safe.
 */
function sanitizeModelsConfig(data: Record<string, unknown>): Record<string, unknown> {
  if (!isRecord(data.providers)) return data;

  const providers: [string, unknown][] = [];
  for (const [providerId, provider] of Object.entries(data.providers)) {
    if (!isRecord(provider) || !Array.isArray(provider.models)) {
      providers.push([providerId, provider]);
      continue;
    }
    const models = provider.models.filter((model) => (
      !isRecord(model) || typeof model.id !== "string" || model.id.trim().length > 0
    ));
    const hasContentBeyondModels = Object.keys(provider).some((key) => key !== "models");
    if (!hasContentBeyondModels && models.length === 0) continue;
    providers.push([providerId, { ...provider, models }]);
  }

  return { ...data, providers: Object.fromEntries(providers) };
}

function getModelsPath(): string {
  return join(getAgentDir(), "models.json");
}

function readModelsJson(): Record<string, unknown> {
  const path = getModelsPath();
  if (!existsSync(path)) return { providers: {} };
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    return { providers: {} };
  }
}

function writeModelsJson(data: Record<string, unknown>): void {
  const path = getModelsPath();
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writePrivateFileAtomicSync(path, JSON.stringify(sanitizeModelsConfig(data), null, 2));
}

export async function GET() {
  return ApiResponse.json(readModelsJson());
}

export async function PUT(req: Request) {
  try {
    const body = await req.json() as Record<string, unknown>;
    writeModelsJson(body);
    invalidateModelsCache();
    return ApiResponse.json({ success: true });
  } catch (error) {
    return ApiResponse.json({ error: String(error) }, { status: 500 });
  }
}
