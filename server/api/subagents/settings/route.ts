import { NextResponse } from "@/server/next-compat";
import {
  parseScope,
  readSubagentSettings,
  updateSubagentSettings,
  type SubagentSettingsUpdate,
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
    console.warn("[pi-web] 修改 subagents settings 后重载会话失败：", error instanceof Error ? error.message : error);
  }
}

function readQuery(req: Request): { cwd: string; scope: ReturnType<typeof parseScope> } {
  const params = new URL(req.url).searchParams;
  const cwd = params.get("cwd");
  if (!cwd) throw new Error("cwd required");
  return { cwd, scope: parseScope(params.get("scope")) };
}

export async function GET(req: Request) {
  try {
    const { cwd, scope } = readQuery(req);
    if (!isExistingFilePathAllowed(cwd, await getAllowedFileRoots())) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
    return NextResponse.json(readSubagentSettings(cwd, scope));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}

export async function PUT(req: Request) {
  try {
    const { cwd, scope } = readQuery(req);
    if (!isExistingFilePathAllowed(cwd, await getAllowedFileRoots())) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
    const body = await req.json() as {
      settings?: SubagentSettingsUpdate;
      sessionId?: string;
    };
    if (!body.settings || typeof body.settings !== "object") {
      return NextResponse.json({ error: "settings required" }, { status: 400 });
    }
    const settings = updateSubagentSettings(cwd, scope, body.settings);
    await reloadActiveSession(body.sessionId);
    return NextResponse.json({ success: true, settings });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
