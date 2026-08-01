import { ApiResponse } from "@/server/http";
import { getSessionCwd, resolveSessionPath } from "@/lib/session-reader";
import { startRpcSession, getRpcSession } from "@/lib/rpc-manager";
import { parseRuntimeCommand } from "@/lib/kernel";

// POST /api/agent/[id] - Send a command to an existing session
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const rawBody = await req.json();
    const parsed = parseRuntimeCommand(rawBody);
    if (!parsed.ok) {
      return ApiResponse.json({ error: parsed.error }, { status: 400 });
    }
    const body = parsed.value;

    // Fast path: already-running session
    const existing = getRpcSession(id);
    if (existing?.isAlive()) {
      const result = await existing.send(body);
      return ApiResponse.json({ success: true, data: result });
    }

    const filePath = await resolveSessionPath(id);
    if (!filePath) {
      return ApiResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const cwd = getSessionCwd(filePath) ?? process.cwd();

    const { session } = await startRpcSession(id, filePath, cwd);
    const result = await session.send(body);

    return ApiResponse.json({ success: true, data: result });
  } catch (error) {
    return ApiResponse.json({ error: String(error) }, { status: 500 });
  }
}

// GET /api/agent/[id] - Get current agent state
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const session = getRpcSession(id);
    if (!session || !session.isAlive()) {
      return ApiResponse.json({ running: false });
    }

    const state = await session.send({ type: "get_state" });
    return ApiResponse.json({ running: true, state });
  } catch (error) {
    return ApiResponse.json({ error: String(error) }, { status: 500 });
  }
}
