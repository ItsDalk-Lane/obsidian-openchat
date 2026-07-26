import { NextResponse } from "next/server";
import type { TaskCapabilityPolicy } from "@/lib/kernel";
import { getKernelServices } from "@/lib/server/kernel-services";
import { badRequest, enforceSameOrigin, isRunId, isTaskId, notFound } from "../../task-route-helpers";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!isTaskId(id)) return badRequest("Invalid TaskId");
  try {
    const services = getKernelServices();
    const task = services.taskService.getTask(id);
    if (!task) return notFound("Task not found");
    const url = new URL(req.url);
    const discoverForRunId = url.searchParams.get("discoverForRunId");
    if (discoverForRunId) {
      if (!isRunId(discoverForRunId)) return badRequest("Invalid RunId");
      const run = services.runService.listByTask(id).find((item) => item.id === discoverForRunId);
      if (!run) return notFound("Run not found for task");
      await services.capabilityService.discoverPiCapabilities({
        taskId: run.taskId,
        runId: run.id,
        runtimeKind: run.runtimeKind,
        nativeRuntimeId: run.nativeRuntimeId,
      });
    }
    return NextResponse.json({
      capabilities: services.capabilityService.listCapabilities(),
      bindings: services.capabilityService.listTaskBindings(id),
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const forbidden = enforceSameOrigin(req);
  if (forbidden) return forbidden;
  const { id } = await params;
  if (!isTaskId(id)) return badRequest("Invalid TaskId");
  try {
    const body = await req.json() as {
      capabilityId?: string;
      enabled?: boolean;
      policy?: TaskCapabilityPolicy;
      config?: Record<string, unknown>;
    };
    if (!body.capabilityId || typeof body.capabilityId !== "string") {
      return badRequest("capabilityId is required");
    }
    const binding = getKernelServices().capabilityService.setTaskBinding(id, {
      capabilityId: body.capabilityId,
      enabled: body.enabled,
      policy: body.policy,
      config: body.config,
    });
    return NextResponse.json({ binding });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "Task not found") return notFound(message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
