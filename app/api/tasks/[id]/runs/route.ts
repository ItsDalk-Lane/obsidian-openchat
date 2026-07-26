import { existsSync } from "fs";
import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { allowFileRoot } from "@/lib/file-access";
import { invalidateSessionListCache } from "@/lib/session-reader";
import { startRpcSession } from "@/lib/rpc-manager";
import { getKernelServices } from "@/lib/application/services";
import { badRequest, isTaskId, notFound } from "../../task-route-helpers";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!isTaskId(id)) return badRequest("Invalid TaskId");
  const services = getKernelServices();
  const task = services.taskService.getTask(id);
  if (!task) return notFound("Task not found");
  return NextResponse.json({ runs: services.runService.listByTask(id) });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!isTaskId(id)) return badRequest("Invalid TaskId");

  try {
    const services = getKernelServices();
    const task = services.taskService.getTask(id);
    if (!task) return notFound("Task not found");

    const body = await req.json() as {
      runtimeKind?: string;
      cwd?: string;
      provider?: string;
      modelId?: string;
      toolNames?: string[];
      thinkingLevel?: string;
    };
    if (body.runtimeKind !== "pi") return badRequest("Only runtimeKind=pi is supported");
    if (!body.cwd || typeof body.cwd !== "string") return badRequest("cwd is required");
    if (!existsSync(body.cwd)) return badRequest(`Directory does not exist: ${body.cwd}`);

    const tempKey = `__new__${randomUUID()}`;
    const { session, realSessionId, runtimeContext } = await startRpcSession(
      tempKey,
      "",
      body.cwd,
      Array.isArray(body.toolNames) ? body.toolNames : undefined,
      { taskId: id },
    );

    allowFileRoot(body.cwd);
    invalidateSessionListCache();

    if (body.provider && body.modelId) {
      await session.send({ type: "set_model", provider: body.provider, modelId: body.modelId });
    }
    if (body.thinkingLevel) {
      await session.send({ type: "set_thinking_level", level: body.thinkingLevel });
    }

    return NextResponse.json({
      sessionId: realSessionId,
      taskId: runtimeContext.taskId,
      runId: runtimeContext.runId,
      run: services.runService.listByTask(id).find((item) => item.id === runtimeContext.runId) ?? null,
    }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
