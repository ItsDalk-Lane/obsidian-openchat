import { NextResponse } from "@/server/next-compat";
import { getKernelServices } from "@/lib/server/kernel-services";
import { getRuntimeRegistry } from "@/lib/server/runtime-registry";
import { badRequest, enforceSameOrigin, isTaskId, notFound } from "../../task-route-helpers";

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
  const forbidden = enforceSameOrigin(req);
  if (forbidden) return forbidden;
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
    if (!body.runtimeKind || typeof body.runtimeKind !== "string") {
      return badRequest("runtimeKind is required");
    }
    if (!body.cwd || typeof body.cwd !== "string") return badRequest("cwd is required");
    const adapter = getRuntimeRegistry().get(body.runtimeKind);
    if (!adapter) return badRequest(`Unsupported runtimeKind: ${body.runtimeKind}`);
    const runtimeContext = await adapter.createRun({
      taskId: id,
      cwd: body.cwd,
      metadata: {
        toolNames: Array.isArray(body.toolNames) ? body.toolNames : undefined,
      },
    });

    if (body.provider && body.modelId) {
      await adapter.send(runtimeContext, { type: "set_model", provider: body.provider, modelId: body.modelId });
    }
    if (body.thinkingLevel) {
      await adapter.send(runtimeContext, { type: "set_thinking_level", level: body.thinkingLevel });
    }

    const run = services.runService.listByTask(id).find((item) => item.id === runtimeContext.runId) ?? null;
    return NextResponse.json({
      sessionId: runtimeContext.nativeRuntimeId,
      taskId: runtimeContext.taskId,
      runId: runtimeContext.runId,
      run,
    }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
