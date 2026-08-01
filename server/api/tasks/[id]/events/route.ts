import { ApiResponse } from "@/server/http";
import { getKernelServices } from "@/lib/server/kernel-services";
import { badRequest, isKernelEventType, isRunId, isTaskId, notFound, parsePositiveInt } from "../../task-route-helpers";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!isTaskId(id)) return badRequest("Invalid TaskId");
  const services = getKernelServices();
  const task = services.taskService.getTask(id);
  if (!task) return notFound("Task not found");

  const url = new URL(req.url);
  const after = Number.parseInt(url.searchParams.get("after") ?? "0", 10);
  const limit = parsePositiveInt(url.searchParams.get("limit"), 100, 200);
  const rawRunId = url.searchParams.get("runId");
  const rawType = url.searchParams.get("type");
  if (rawRunId && !isRunId(rawRunId)) return badRequest("Invalid RunId");
  if (rawType && !isKernelEventType(rawType)) return badRequest("Invalid event type");
  const runId = rawRunId && isRunId(rawRunId) ? rawRunId : undefined;
  const type = rawType && isKernelEventType(rawType) ? rawType : undefined;
  const events = services.uow.events.getByTask(id, {
    afterSequence: Number.isFinite(after) && after >= 0 ? after : 0,
    limit: limit + 1,
    runId,
    type,
  });
  const page = events.slice(0, limit);
  const lastSequence = page.length > 0 ? page[page.length - 1].sequence : after;
  return ApiResponse.json({
    events: page,
    nextSequence: lastSequence,
    hasMore: events.length > limit,
  });
}
