import { NextResponse } from "@/server/next-compat";
import { getKernelServices } from "@/lib/server/kernel-services";
import { badRequest, enforceSameOrigin, isArtifactStatus, isRunId, isTaskId, notFound } from "../../../task-route-helpers";

export const runtime = "nodejs";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; artifactId: string }> },
) {
  const forbidden = enforceSameOrigin(req);
  if (forbidden) return forbidden;
  const { id, artifactId } = await params;
  if (!isTaskId(id)) return badRequest("Invalid TaskId");
  try {
    const body = await req.json() as {
      title?: string;
      titleOverride?: string;
      status?: "draft" | "ready" | "archived";
      role?: string;
      runId?: string;
    };
    if (body.status !== undefined && !isArtifactStatus(body.status)) {
      return badRequest("Invalid artifact status");
    }
    if (body.runId !== undefined && !isRunId(body.runId)) {
      return badRequest("Invalid RunId");
    }
    const record = getKernelServices().artifactService.updateArtifact({
      taskId: id,
      artifactId: artifactId as never,
      titleOverride: body.titleOverride ?? body.title,
      status: body.status,
      role: body.role,
      runId: body.runId,
    });
    return NextResponse.json(record);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "Artifact not found") return notFound(message);
    if (message === "Run not found for task") return notFound(message);
    return badRequest(message);
  }
}
