import { NextResponse } from "next/server";
import {
  createSubagentAgent,
  deleteSubagentAgent,
  listSubagentAgents,
  parseScope,
  updateSubagentAgent,
  type SubagentAgentInput,
} from "@/lib/subagents-config";
import { getRpcSession } from "@/lib/rpc-manager";
import { getAllowedFileRoots, isExistingFilePathAllowed } from "@/lib/file-access";

export const dynamic = "force-dynamic";

async function reloadActiveSession(sessionId: string | undefined): Promise<void> {
  if (!sessionId) return;
  const wrapper = getRpcSession(sessionId);
  if (!wrapper?.isAlive() || wrapper.isRunning()) return;
  try {
    await wrapper.send({ type: "reload" });
  } catch (error) {
    console.warn("[pi-web] 修改 subagents agent 后重载会话失败：", error instanceof Error ? error.message : error);
  }
}

async function cwdIsAllowed(cwd: string): Promise<boolean> {
  return isExistingFilePathAllowed(cwd, await getAllowedFileRoots());
}

export async function GET(req: Request) {
  const cwd = new URL(req.url).searchParams.get("cwd");
  if (!cwd) return NextResponse.json({ error: "cwd required" }, { status: 400 });
  if (!await cwdIsAllowed(cwd)) return NextResponse.json({ error: "Access denied" }, { status: 403 });
  try {
    return NextResponse.json(listSubagentAgents(cwd));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as {
      cwd?: string;
      scope?: unknown;
      agent?: SubagentAgentInput;
      sessionId?: string;
    };
    if (!body.cwd) return NextResponse.json({ error: "cwd required" }, { status: 400 });
    if (!await cwdIsAllowed(body.cwd)) return NextResponse.json({ error: "Access denied" }, { status: 403 });
    if (!body.agent || typeof body.agent !== "object") {
      return NextResponse.json({ error: "agent required" }, { status: 400 });
    }
    const agent = createSubagentAgent(body.cwd, parseScope(body.scope), body.agent);
    await reloadActiveSession(body.sessionId);
    return NextResponse.json({ success: true, agent });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json() as {
      cwd?: string;
      scope?: unknown;
      name?: string;
      agent?: SubagentAgentInput;
      sessionId?: string;
    };
    if (!body.cwd) return NextResponse.json({ error: "cwd required" }, { status: 400 });
    if (!await cwdIsAllowed(body.cwd)) return NextResponse.json({ error: "Access denied" }, { status: 403 });
    if (!body.name) return NextResponse.json({ error: "name required" }, { status: 400 });
    if (!body.agent || typeof body.agent !== "object") {
      return NextResponse.json({ error: "agent required" }, { status: 400 });
    }
    const agent = updateSubagentAgent(body.cwd, parseScope(body.scope), body.name, body.agent);
    await reloadActiveSession(body.sessionId);
    return NextResponse.json({ success: true, agent });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  try {
    const body = await req.json() as {
      cwd?: string;
      scope?: unknown;
      name?: string;
      sessionId?: string;
    };
    if (!body.cwd) return NextResponse.json({ error: "cwd required" }, { status: 400 });
    if (!await cwdIsAllowed(body.cwd)) return NextResponse.json({ error: "Access denied" }, { status: 403 });
    if (!body.name) return NextResponse.json({ error: "name required" }, { status: 400 });
    deleteSubagentAgent(body.cwd, parseScope(body.scope), body.name);
    await reloadActiveSession(body.sessionId);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
