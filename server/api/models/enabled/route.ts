import { ApiResponse } from "@/server/http";
import {
  ModelRuntime,
  SettingsManager,
  getAgentDir,
} from "@earendil-works/pi-coding-agent";
import { invalidateModelsCache } from "@/lib/models-cache";
import { resolveVisibleModels } from "@/lib/model-scope";
import { hasJsonContentType, isApiRequestAllowed } from "@/lib/request-security";

export const dynamic = "force-dynamic";

const modelNameCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/**
 * Editor for the chat model-selector scope (pi's `enabledModels` setting).
 *
 * The setting lives in the global settings file only — reading and writing the
 * global scope (project settings ignored) keeps the editor round-trip exact
 * even when a project defines its own enabledModels.
 */
function createGlobalSettings(): SettingsManager {
  return SettingsManager.create(process.cwd(), getAgentDir(), { projectTrusted: false });
}

function compareModelEntries(
  a: { id: string; name: string },
  b: { id: string; name: string },
): number {
  return modelNameCollator.compare(a.name || a.id, b.name || b.id) || modelNameCollator.compare(a.id, b.id);
}

/** Dry-run the resolver so unmatched/ambiguous patterns surface as warnings. */
async function computeScopeWarnings(modelRuntime: ModelRuntime, patterns: string[] | null): Promise<string[]> {
  if (!patterns || patterns.length === 0) return [];
  try {
    const { warnings } = await resolveVisibleModels(modelRuntime, patterns);
    return [...warnings];
  } catch (error) {
    // Ambiguous exact references throw instead of producing diagnostics.
    return [error instanceof Error ? error.message : String(error)];
  }
}

export async function GET() {
  try {
    const modelRuntime = await ModelRuntime.create();
    const allModels = (await modelRuntime.getAvailable())
      .map((m) => ({
        provider: m.provider,
        id: m.id,
        name: m.name,
        reasoning: m.reasoning,
        input: m.input,
        contextWindow: m.contextWindow,
      }))
      .sort(compareModelEntries);
    const rawPatterns = createGlobalSettings().getGlobalSettings().enabledModels;
    const enabledPatterns = rawPatterns && rawPatterns.length > 0 ? [...rawPatterns] : null;
    return ApiResponse.json({
      allModels,
      enabledPatterns,
      warnings: await computeScopeWarnings(modelRuntime, enabledPatterns),
    });
  } catch (error) {
    return ApiResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  if (!isApiRequestAllowed(req)) {
    return ApiResponse.json({ error: "Untrusted API request" }, { status: 403 });
  }
  if (!hasJsonContentType(req)) {
    return ApiResponse.json({ error: "Content-Type must be application/json" }, { status: 415 });
  }

  let patterns: string[] | null;
  try {
    const body = await req.json() as { patterns?: unknown };
    if (body.patterns !== undefined && body.patterns !== null) {
      if (!Array.isArray(body.patterns) || body.patterns.some((p) => typeof p !== "string")) {
        return ApiResponse.json({ error: "patterns must be a list of strings or null" }, { status: 400 });
      }
      const cleaned = [...new Set((body.patterns as string[]).map((p) => p.trim()).filter(Boolean))];
      patterns = cleaned.length > 0 ? cleaned.sort((a, b) => modelNameCollator.compare(a, b)) : null;
    } else {
      patterns = null;
    }
  } catch {
    return ApiResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const modelRuntime = await ModelRuntime.create();
    const warnings = await computeScopeWarnings(modelRuntime, patterns);
    const settings = createGlobalSettings();
    settings.setEnabledModels(patterns ?? undefined);
    await settings.flush();
    invalidateModelsCache();
    return ApiResponse.json({ success: true, ...(warnings.length > 0 ? { warnings } : {}) });
  } catch (error) {
    return ApiResponse.json({ error: String(error) }, { status: 500 });
  }
}
