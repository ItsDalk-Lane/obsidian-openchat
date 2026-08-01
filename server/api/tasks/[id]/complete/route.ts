import { ApiResponse } from "@/server/http";
import { getKernelServices } from "@/lib/server/kernel-services";
import { badRequest, enforceSameOrigin, isTaskId, notFound } from "../../task-route-helpers";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const forbidden = enforceSameOrigin(req);
  if (forbidden) return forbidden;
  const { id } = await params;
  if (!isTaskId(id)) return badRequest("Invalid TaskId");
  const services = getKernelServices();
  const task = services.taskService.getTask(id);
  if (!task) return notFound("Task not found");
  const gate = services.evaluationService.canCompleteTask(id);
  if (!gate.ok) {
    return ApiResponse.json({ error: gate.reason, evaluation: gate.evaluation ?? null }, { status: 409 });
  }
  const updated = services.taskService.updateTask(id, {
    status: "completed",
    expectedUpdatedAt: task.updatedAt,
  });
  return ApiResponse.json({ task: updated, evaluation: gate.evaluation });
}
