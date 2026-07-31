import { NextResponse } from "next/server";
import { getRpcSession } from "@/lib/rpc-manager";
import { parseRuntimeCommand } from "@/lib/kernel";

export const dynamic = "force-dynamic";

// POST /api/mcp/action
// Body: { sessionId, action: "reconnect" | "auth" | "logout", server? }
// Drives the patched pi-mcp-adapter control channel of a live in-process
// session: reconnect one server (or all when server is omitted), start an
// OAuth flow, or clear stored OAuth credentials. Requires a loaded session;
// returns 409 when no live AgentSession exists (same contract as
// /api/mcp/status's live flag).
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { sessionId, ...rest } = body as Record<string, unknown>;
  if (typeof sessionId !== "string" || !sessionId) {
    return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  }

  const parsed = parseRuntimeCommand({ type: "mcp_action", ...rest });
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const wrapper = getRpcSession(sessionId);
  if (!wrapper?.isAlive()) {
    return NextResponse.json({ error: "No live session for MCP action" }, { status: 409 });
  }

  const result = (await wrapper.send(parsed.value)) as { ok: boolean; message?: string; started?: boolean };
  return NextResponse.json(result);
}
