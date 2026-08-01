import { NextResponse } from "@/server/next-compat";
import {
  listMcpServers,
  removeServer,
  setServerDisabled,
  upsertServer,
  type McpScope,
  type McpServerEntry,
} from "@/lib/mcp-config";
import { getRpcSession } from "@/lib/rpc-manager";

export const dynamic = "force-dynamic";

// GET /api/mcp?cwd=<path> — merged MCP server list with per-server source info
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const cwd = searchParams.get("cwd");
  if (!cwd) return NextResponse.json({ error: "cwd required" }, { status: 400 });

  try {
    return NextResponse.json(listMcpServers(cwd));
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

async function reloadActiveSession(sessionId: string | undefined): Promise<void> {
  if (!sessionId) return;
  const wrapper = getRpcSession(sessionId);
  if (!wrapper?.isAlive() || wrapper.isRunning()) return;
  try {
    await wrapper.send({ type: "reload" });
  } catch (e) {
    console.warn("[pi-web] session reload after MCP config change failed:", e instanceof Error ? e.message : e);
  }
}

// POST /api/mcp — add/update/remove a server definition in a pi-web-managed file
// body: { action: "upsert"|"remove", cwd, scope, name, config?, previousName?, sessionId? }
export async function POST(req: Request) {
  try {
    const body = await req.json() as {
      action: "upsert" | "remove";
      cwd: string;
      scope: McpScope;
      name: string;
      config?: McpServerEntry;
      previousName?: string;
      sessionId?: string;
    };
    if (!body.cwd) return NextResponse.json({ error: "cwd required" }, { status: 400 });
    if (!body.name) return NextResponse.json({ error: "name required" }, { status: 400 });
    if (body.scope !== "project" && body.scope !== "global") {
      return NextResponse.json({ error: "scope must be project or global" }, { status: 400 });
    }

    if (body.action === "upsert") {
      if (!body.config) return NextResponse.json({ error: "config required" }, { status: 400 });
      const result = upsertServer(body.cwd, body.scope, body.name, body.config, {
        previousName: body.previousName,
      });
      await reloadActiveSession(body.sessionId);
      return NextResponse.json({ success: true, path: result.path });
    }

    if (body.action === "remove") {
      const result = removeServer(body.cwd, body.scope, body.name);
      await reloadActiveSession(body.sessionId);
      return NextResponse.json({ success: true, ...result });
    }

    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

// PATCH /api/mcp — toggle a server's disabled flag via the project .pi/mcp.json override
// body: { cwd, name, disabled, sessionId? }
export async function PATCH(req: Request) {
  try {
    const body = await req.json() as { cwd: string; name: string; disabled: boolean; sessionId?: string };
    if (!body.cwd) return NextResponse.json({ error: "cwd required" }, { status: 400 });
    if (!body.name) return NextResponse.json({ error: "name required" }, { status: 400 });

    const result = setServerDisabled(body.cwd, body.name, Boolean(body.disabled));
    await reloadActiveSession(body.sessionId);
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
