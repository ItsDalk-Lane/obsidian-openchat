import { NextResponse } from "next/server";
import { mkdirSync } from "fs";
import { normalizeDirectory } from "@/lib/directory-browser";
import { allowFileRoot } from "@/lib/file-access";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { path?: unknown };
    const path = typeof body.path === "string" ? body.path.trim() : "";
    if (!path) {
      return NextResponse.json({ error: "Path is required" }, { status: 400 });
    }

    const normalized = normalizeDirectory(path);
    mkdirSync(normalized, { recursive: true });
    allowFileRoot(normalized);
    return NextResponse.json({ cwd: normalized });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
