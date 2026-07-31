import { NextResponse } from "next/server";
import { statSync } from "fs";
import { readAppSettings, writeAppSettings } from "@/lib/app-settings";
import { normalizeDirectory } from "@/lib/directory-browser";
import { allowFileRoot } from "@/lib/file-access";

export const dynamic = "force-dynamic";

export async function GET() {
  const settings = readAppSettings();
  return NextResponse.json({ defaultCwd: settings.defaultCwd ?? null });
}

export async function PUT(request: Request) {
  try {
    const body = await request.json() as { defaultCwd?: unknown };
    if (body.defaultCwd !== null && typeof body.defaultCwd !== "string") {
      return NextResponse.json({ error: "defaultCwd must be string or null" }, { status: 400 });
    }

    if (body.defaultCwd === null) {
      writeAppSettings({ defaultCwd: null });
      return NextResponse.json({ defaultCwd: null });
    }

    const rawPath = body.defaultCwd.trim();
    if (!rawPath) {
      return NextResponse.json({ error: "Path is required" }, { status: 400 });
    }

    const normalized = normalizeDirectory(rawPath);
    let pathStat: ReturnType<typeof statSync>;
    try {
      pathStat = statSync(normalized);
    } catch {
      return NextResponse.json({ error: `Directory does not exist: ${rawPath}` }, { status: 400 });
    }

    if (!pathStat.isDirectory()) {
      return NextResponse.json({ error: `Path is not a directory: ${rawPath}` }, { status: 400 });
    }

    allowFileRoot(normalized);
    writeAppSettings({ defaultCwd: normalized });
    return NextResponse.json({ defaultCwd: normalized });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
