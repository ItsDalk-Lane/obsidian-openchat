import { ApiResponse } from "@/server/http";
import { unlinkSync } from "fs";
import {
  listAllSessions,
  invalidateSessionListCache,
  invalidateSessionPathCache,
} from "@/lib/session-reader";
import { getRpcSession, getRunningRpcSessionIds } from "@/lib/rpc-manager";
import { invalidateProjectCache } from "@/lib/worktree";

export async function GET() {
  try {
    const sessions = await listAllSessions();
    return ApiResponse.json({ sessions, runningSessionIds: getRunningRpcSessionIds() });
  } catch (error) {
    return ApiResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}

// DELETE /api/sessions?projectRoot=<abs path>
// Deletes every session belonging to the project (worktree-aware root).
// Only session records under ~/.pi/agent/sessions are removed — project
// files on disk are never touched.
export async function DELETE(req: Request) {
  try {
    const projectRoot = new URL(req.url).searchParams.get("projectRoot");
    if (!projectRoot) {
      return ApiResponse.json({ error: "projectRoot is required" }, { status: 400 });
    }

    const sessions = await listAllSessions();
    const targets = sessions.filter(
      (session) => (session.projectRoot ?? session.cwd) === projectRoot,
    );
    if (targets.length === 0) {
      return ApiResponse.json({ error: "No sessions found for this path" }, { status: 404 });
    }

    const deletedIds: string[] = [];
    for (const session of targets) {
      try {
        getRpcSession(session.id)?.destroy();
        unlinkSync(session.path);
        deletedIds.push(session.id);
      } catch { /* keep deleting the rest */ }
      invalidateSessionPathCache(session.id);
    }
    invalidateSessionListCache();
    invalidateProjectCache();
    return ApiResponse.json({ ok: true, deletedIds });
  } catch (error) {
    return ApiResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}
