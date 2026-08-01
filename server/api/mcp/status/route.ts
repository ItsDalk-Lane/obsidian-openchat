import { NextResponse } from "@/server/next-compat";
import { getRpcSession } from "@/lib/rpc-manager";

export const dynamic = "force-dynamic";

// GET /api/mcp/status?sessionId=<id>
// Latest MCP status snapshot published by the bundled pi-mcp-adapter for an
// active in-process session. Returns { status: null } when the session has no
// live AgentSession (status is only observable while a session is loaded).
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("sessionId");
  if (!sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 });

  const wrapper = getRpcSession(sessionId);
  if (!wrapper?.isAlive()) return NextResponse.json({ status: null, live: false });
  return NextResponse.json({ status: wrapper.getMcpStatus(), live: true });
}
