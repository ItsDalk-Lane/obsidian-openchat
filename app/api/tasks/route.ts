import { NextResponse } from "next/server";
import { projectPiSessions } from "@/lib/adapters/pi/pi-task-projector";
import { getRunningRpcSessionIds } from "@/lib/rpc-manager";
import { listAllSessions } from "@/lib/session-reader";

export async function GET() {
  try {
    const sessions = await listAllSessions();
    const runningSessionIds = new Set(getRunningRpcSessionIds());
    const projections = projectPiSessions(sessions, runningSessionIds);
    return NextResponse.json({
      tasks: projections.map((projection) => projection.task),
      runs: projections.map((projection) => projection.run),
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
