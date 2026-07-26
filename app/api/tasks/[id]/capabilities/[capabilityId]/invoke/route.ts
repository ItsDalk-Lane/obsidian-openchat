import { NextResponse } from "next/server";
import { getKernelServices } from "@/lib/server/kernel-services";
import type { RunId } from "@/lib/kernel";
import { badRequest, enforceSameOrigin, isRunId, isTaskId, notFound } from "../../../../task-route-helpers";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; capabilityId: string }> },
) {
  const forbidden = enforceSameOrigin(req);
  if (forbidden) return forbidden;
  const { id, capabilityId } = await params;
  if (!isTaskId(id)) return badRequest("Invalid TaskId");
  if (!capabilityId) return badRequest("CapabilityId is required");
  try {
    const body = await req.json() as {
      runId?: string;
      input?: Record<string, unknown>;
      requestedBy?: string;
      approvalId?: string;
    };
    if (body.runId && !isRunId(body.runId)) return badRequest("Invalid RunId");
    const services = getKernelServices();
    if (!services.taskService.getTask(id)) return notFound("Task not found");
    const result = await services.capabilityService.invokeCapability({
      taskId: id,
      capabilityId,
      runId: body.runId as RunId | undefined,
      input: body.input,
      requestedBy: body.requestedBy,
      approvalId: body.approvalId,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
