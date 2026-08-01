import { NextResponse } from "@/server/next-compat";
import { getKernelServices } from "@/lib/server/kernel-services";
import { badRequest, isRunId, isTaskId, notFound, parsePositiveInt } from "../../task-route-helpers";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!isTaskId(id)) return badRequest("Invalid TaskId");
  try {
    const services = getKernelServices();
    if (!services.taskService.getTask(id)) return notFound("Task not found");
    const url = new URL(req.url);
    const runId = url.searchParams.get("runId");
    if (runId && !isRunId(runId)) return badRequest("Invalid RunId");
    const budgetChars = parsePositiveInt(url.searchParams.get("budgetChars"), 8000, 30000);
    const compiled = services.contextCompilerService.compileTaskContext(id, {
      runId: runId && isRunId(runId) ? runId : undefined,
      budgetChars,
    });
    return NextResponse.json(compiled);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}
