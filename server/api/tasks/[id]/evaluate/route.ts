import { ApiResponse } from "@/server/http";
import type { RunId } from "@/lib/kernel";
import { getKernelServices } from "@/lib/server/kernel-services";
import { badRequest, enforceSameOrigin, isRunId, isTaskId, notFound } from "../../task-route-helpers";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!isTaskId(id)) return badRequest("Invalid TaskId");
  const services = getKernelServices();
  if (!services.taskService.getTask(id)) return notFound("Task not found");
  return ApiResponse.json({ evaluations: services.evaluationService.listByTask(id) });
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
    const body = await req.json() as { runId?: string; evaluatorId?: string };
    if (body.runId && !isRunId(body.runId)) return badRequest("Invalid RunId");
    const services = getKernelServices();
    if (!services.taskService.getTask(id)) return notFound("Task not found");
    const evaluation = services.evaluationService.evaluateTask({
      taskId: id,
      runId: body.runId as RunId | undefined,
      evaluatorId: body.evaluatorId,
    });
    return ApiResponse.json({ evaluation });
  } catch (error) {
    return ApiResponse.json({ error: String(error) }, { status: 400 });
  }
}
