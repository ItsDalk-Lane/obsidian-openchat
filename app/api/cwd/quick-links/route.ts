import { NextResponse } from "next/server";
import { existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { listAllSessions } from "@/lib/session-reader";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const home = homedir();
    const placeCandidates = [
      { name: "home", path: home },
      { name: "desktop", path: join(home, "Desktop") },
      { name: "documents", path: join(home, "Documents") },
      { name: "downloads", path: join(home, "Downloads") },
    ];
    const places = placeCandidates.filter((entry) => existsSync(entry.path));

    const sessions = await listAllSessions();
    const latestByRoot = new Map<string, string>();
    for (const session of sessions) {
      const root = session.projectRoot ?? session.cwd;
      if (!root) continue;
      const previous = latestByRoot.get(root);
      if (!previous || session.modified > previous) {
        latestByRoot.set(root, session.modified);
      }
    }

    const recents = [...latestByRoot.entries()]
      .sort((left, right) => right[1].localeCompare(left[1]))
      .map(([root]) => root)
      .slice(0, 6);

    return NextResponse.json({ places, recents });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
