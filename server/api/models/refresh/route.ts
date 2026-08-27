import { ApiResponse } from "@/server/http";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { invalidateModelsCache } from "@/lib/models-cache";
import { isApiRequestAllowed } from "@/lib/request-security";

export const dynamic = "force-dynamic";

const REFRESH_TIMEOUT_MS = 20_000;

/**
 * Pull the latest remote model catalogs (pi.dev overlays plus dynamic
 * providers) into `~/.pi/agent/models-store.json`, so built-in providers can
 * expose newer models without hand-editing models.json. Body may scope the
 * refresh to one `{ provider: "<id>" }`; static custom providers in models.json
 * are skipped by the SDK by design.
 */
export async function POST(req: Request) {
  if (!isApiRequestAllowed(req)) {
    return ApiResponse.json({ error: "Untrusted API request" }, { status: 403 });
  }

  let provider: string | undefined;
  try {
    const body = await req.json() as { provider?: unknown } | null;
    if (body && typeof body.provider === "string" && body.provider.trim()) {
      provider = body.provider.trim();
    }
  } catch {
    // No/invalid body — refresh everything.
  }

  try {
    const modelRuntime = await ModelRuntime.create({ allowModelNetwork: false });
    const result = await modelRuntime.refresh({
      allowNetwork: true,
      force: true,
      ...(provider ? { providers: [provider] } : {}),
      signal: AbortSignal.timeout(REFRESH_TIMEOUT_MS),
    });

    invalidateModelsCache();
    const totalModels = (await modelRuntime.getAvailable()).length;
    return ApiResponse.json({
      success: true,
      refreshedAt: new Date().toISOString(),
      totalModels,
      failed: [...result.errors].map(([provider, error]) => ({
        provider,
        message: error instanceof Error ? error.message : String(error),
      })),
      ...(modelRuntime.getError() ? { runtimeError: modelRuntime.getError() } : {}),
    });
  } catch (error) {
    return ApiResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
