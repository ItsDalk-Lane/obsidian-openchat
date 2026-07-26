import { NextResponse } from "next/server";
import { projectPiSession } from "@/lib/adapters/pi/pi-task-projector";
import { getRunningRpcSessionIds } from "@/lib/rpc-manager";
import { listAllSessions } from "@/lib/session-reader";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const sessions = await listAllSessions();
    const runningSessionIds = new Set(getRunningRpcSessionIds());
    const session = sessions.find((item) => item.id === id);
    if (!session) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }
    const projection = projectPiSession(session, runningSessionIds);
    return NextResponse.json({
      task: projection.task,
      run: projection.run,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
