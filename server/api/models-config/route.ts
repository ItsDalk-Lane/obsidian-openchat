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

/** Drop blank model rows the editor can emit (no id / whitespace-only id). */
function sanitizeModelsConfig(data: Record<string, unknown>): Record<string, unknown> {
  if (!isRecord(data.providers)) return data;

  const providers = Object.fromEntries(Object.entries(data.providers).map(([providerId, provider]) => {
    if (!isRecord(provider) || !Array.isArray(provider.models)) return [providerId, provider];
    const models = provider.models.filter((model) => (
      !isRecord(model) || typeof model.id !== "string" || model.id.trim().length > 0
    ));
    return [providerId, { ...provider, models }];
  }));

  return { ...data, providers };
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
