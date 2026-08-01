import { ApiResponse } from "@/server/http";
import { statSync } from "fs";
import { readAppSettings, writeAppSettings } from "@/lib/app-settings";
import { normalizeDirectory } from "@/lib/directory-browser";
import { allowFileRoot } from "@/lib/file-access";

export const dynamic = "force-dynamic";

export async function GET() {
  const settings = readAppSettings();
  return ApiResponse.json({ defaultCwd: settings.defaultCwd ?? null });
}

export async function PUT(request: Request) {
  try {
    const body = await request.json() as { defaultCwd?: unknown };
    if (body.defaultCwd !== null && typeof body.defaultCwd !== "string") {
      return ApiResponse.json({ error: "defaultCwd must be string or null" }, { status: 400 });
    }

    if (body.defaultCwd === null) {
      writeAppSettings({ defaultCwd: null });
      return ApiResponse.json({ defaultCwd: null });
    }

    const rawPath = body.defaultCwd.trim();
    if (!rawPath) {
      return ApiResponse.json({ error: "Path is required" }, { status: 400 });
    }

    const normalized = normalizeDirectory(rawPath);
    let pathStat: ReturnType<typeof statSync>;
    try {
      pathStat = statSync(normalized);
    } catch {
      return ApiResponse.json({ error: `Directory does not exist: ${rawPath}` }, { status: 400 });
    }

    if (!pathStat.isDirectory()) {
      return ApiResponse.json({ error: `Path is not a directory: ${rawPath}` }, { status: 400 });
    }

    allowFileRoot(normalized);
    writeAppSettings({ defaultCwd: normalized });
    return ApiResponse.json({ defaultCwd: normalized });
  } catch (error) {
    return ApiResponse.json({ error: String(error) }, { status: 500 });
  }
}
