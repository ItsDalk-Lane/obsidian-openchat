import { NextResponse } from "next/server";
import { getKernelServices } from "@/lib/application/services";
import { badRequest, conflict, isTaskId, isTaskStatus, notFound, summarizeTask } from "../task-route-helpers";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!isTaskId(id)) return badRequest("Invalid TaskId");
  try {
    const task = getKernelServices().taskService.getTask(id);
    if (!task) return notFound("Task not found");
    return NextResponse.json(summarizeTask(task));
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!isTaskId(id)) return badRequest("Invalid TaskId");
  try {
    const body = await req.json() as {
      title?: string;
      goal?: string;
      context?: string;
      constraints?: string[];
      nonGoals?: string[];
      scope?: { cwd?: string; projectRoot?: string; worktreeBranch?: string };
      status?: string;
      expectedUpdatedAt?: string;
    };
    if (body.status !== undefined && !isTaskStatus(body.status)) {
      return badRequest("Invalid task status");
    }

    const task = getKernelServices().taskService.updateTask(id, {
      title: body.title,
      goal: body.goal,
      context: body.context,
      constraints: body.constraints,
      nonGoals: body.nonGoals,
      scope: body.scope,
      status: body.status,
      expectedUpdatedAt: body.expectedUpdatedAt,
    });
    return NextResponse.json(summarizeTask(task));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("another request")) return conflict(message);
    if (message === "Task not found") return notFound(message);
    if (message.startsWith("Illegal task status transition")) return badRequest(message);
    return badRequest(message);
  }
}
