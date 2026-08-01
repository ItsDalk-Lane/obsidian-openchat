import { NextResponse } from "@/server/next-compat";
import { createFileArtifact } from "@/lib/artifacts";
import { getKernelServices } from "@/lib/server/kernel-services";
import { getAllowedFileRoots, isExistingFilePathAllowed, isFilePathAllowed } from "@/lib/file-access";
import { listAllSessions } from "@/lib/session-reader";
import { badRequest, enforceSameOrigin, isRunId, isTaskId, notFound } from "../../task-route-helpers";

export const runtime = "nodejs";

async function validateFileAccess(filePath: string, sourceSessionId?: string): Promise<boolean> {
  const allowedRoots = await getAllowedFileRoots();
  if (!isFilePathAllowed(filePath, allowedRoots) || !isExistingFilePathAllowed(filePath, allowedRoots)) {
    return false;
  }
  if (!sourceSessionId) return true;
  const sessions = await listAllSessions();
  const session = sessions.find((item) => item.id === sourceSessionId);
  if (!session) return false;
  const sessionRoots = new Set<string>([session.cwd, session.projectRoot ?? session.cwd].filter(Boolean));
  return isFilePathAllowed(filePath, sessionRoots) && isExistingFilePathAllowed(filePath, sessionRoots);
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!isTaskId(id)) return badRequest("Invalid TaskId");
  const services = getKernelServices();
  const task = services.taskService.getTask(id);
  if (!task) return notFound("Task not found");
  return NextResponse.json({
    artifacts: services.artifactService.listByTask(id),
  });
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
    const body = await req.json() as {
      filePath?: string;
      title?: string;
      sourceSessionId?: string;
      runId?: string;
    };
    if (!body.filePath || typeof body.filePath !== "string") {
      return badRequest("filePath is required");
    }
    if (body.runId !== undefined && !isRunId(body.runId)) {
      return badRequest("Invalid RunId");
    }
    if (!(await validateFileAccess(body.filePath, body.sourceSessionId))) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const artifact = createFileArtifact(body.filePath, {
      title: body.title,
      sourceSessionId: body.sourceSessionId,
    });
    const record = getKernelServices().artifactService.registerArtifact({
      taskId: id,
      artifact,
      runId: body.runId,
      sourceSessionId: body.sourceSessionId,
    });
    return NextResponse.json(record, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "Run not found for task") {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
