import { ApiResponse } from "@/server/http";
import { getKernelServices } from "@/lib/server/kernel-services";
import { badRequest, isTaskId, notFound } from "../../task-route-helpers";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!isTaskId(id)) return badRequest("Invalid TaskId");
  const services = getKernelServices();
  if (!services.taskService.getTask(id)) return notFound("Task not found");
  return ApiResponse.json({ approvals: services.capabilityService.listApprovalsByTask(id) });
}
