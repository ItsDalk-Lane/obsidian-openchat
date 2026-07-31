import { NextResponse } from "next/server";
import { mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { readAppSettings } from "@/lib/app-settings";
import { normalizeDirectory } from "@/lib/directory-browser";
import { allowFileRoot } from "@/lib/file-access";

// POST /api/default-cwd
// Creates ~/pi-cwd-<YYYYMMDD> if it doesn't exist and returns the path.
export async function POST() {
  try {
    const settings = readAppSettings();
    if (settings.defaultCwd) {
      const configured = normalizeDirectory(settings.defaultCwd);
      mkdirSync(configured, { recursive: true });
      allowFileRoot(configured);
      return NextResponse.json({ cwd: configured });
    }

    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const dir = join(homedir(), `pi-cwd-${date}`);
    mkdirSync(dir, { recursive: true });
    allowFileRoot(dir);
    return NextResponse.json({ cwd: dir });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
