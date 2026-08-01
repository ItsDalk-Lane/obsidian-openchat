import { NextResponse } from "@/server/next-compat";
import { getKernelServices } from "@/lib/server/kernel-services";
import { badRequest, enforceSameOrigin, isTaskId, notFound } from "../../../task-route-helpers";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; approvalId: string }> },
) {
  const forbidden = enforceSameOrigin(req);
  if (forbidden) return forbidden;
  const { id, approvalId } = await params;
  if (!isTaskId(id)) return badRequest("Invalid TaskId");
  if (!approvalId) return badRequest("approvalId is required");
  try {
    const body = await req.json() as {
      decision?: "approved" | "rejected";
      decidedBy?: string;
      note?: string;
    };
    if (body.decision !== "approved" && body.decision !== "rejected") {
      return badRequest("decision must be approved or rejected");
    }
    const services = getKernelServices();
    if (!services.taskService.getTask(id)) return notFound("Task not found");
    const approval = services.capabilityService.decideApproval({
      approvalId,
      taskId: id,
      decision: body.decision,
      decidedBy: body.decidedBy?.trim() || "user",
      note: body.note,
    });
    return NextResponse.json({ approval });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
