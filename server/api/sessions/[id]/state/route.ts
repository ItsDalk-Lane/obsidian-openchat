import { ApiResponse } from "@/server/http";
import { getRpcSession } from "@/lib/rpc-manager";
import { resolveSessionPath } from "@/lib/session-reader";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    if (!await resolveSessionPath(id)) {
      return ApiResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const rpc = getRpcSession(id);
    if (!rpc?.isAlive()) return ApiResponse.json({ running: false });

    const state = await rpc.send({ type: "get_state" });
    return ApiResponse.json({ running: true, state });
  } catch (error) {
    return ApiResponse.json({ error: String(error) }, { status: 500 });
  }
}
