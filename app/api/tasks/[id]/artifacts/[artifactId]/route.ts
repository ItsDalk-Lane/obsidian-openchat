import { NextResponse } from "next/server";
import { getKernelServices } from "@/lib/application/services";
import { badRequest, isArtifactStatus, isRunId, isTaskId, notFound } from "../../../task-route-helpers";

export const runtime = "nodejs";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; artifactId: string }> },
) {
  const { id, artifactId } = await params;
  if (!isTaskId(id)) return badRequest("Invalid TaskId");
  try {
    const body = await req.json() as { title?: string; status?: "draft" | "ready" | "archived"; runId?: string };
    if (body.status !== undefined && !isArtifactStatus(body.status)) {
      return badRequest("Invalid artifact status");
    }
    if (body.runId !== undefined && !isRunId(body.runId)) {
      return badRequest("Invalid RunId");
    }
    const artifact = getKernelServices().artifactService.updateArtifact({
      taskId: id,
      artifactId: artifactId as never,
      title: body.title,
      status: body.status,
      runId: body.runId,
    });
    return NextResponse.json({ artifact });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "Artifact not found") return notFound(message);
    if (message === "Run not found for task") return notFound(message);
    return badRequest(message);
  }
}
