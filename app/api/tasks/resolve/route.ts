import { NextResponse } from "next/server";
import { getKernelServices } from "@/lib/application/services";
import { badRequest, summarizeTask } from "../task-route-helpers";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const runtimeKind = url.searchParams.get("runtimeKind");
    const nativeRuntimeId = url.searchParams.get("nativeRuntimeId");
    if (runtimeKind !== "pi" || !nativeRuntimeId) {
      return badRequest("runtimeKind=pi and nativeRuntimeId are required");
    }

    const services = getKernelServices();
    await services.piSessionReconciler.reconcileSession(nativeRuntimeId);
    const context = services.runService.getRuntimeContext("pi", nativeRuntimeId);
    if (!context) {
      return NextResponse.json({ error: "Task not found for runtime" }, { status: 404 });
    }
    const task = services.taskService.getTask(context.taskId);
    if (!task) {
      return NextResponse.json({ error: "Task not found for runtime" }, { status: 404 });
    }
    const summary = summarizeTask(task);
    return NextResponse.json({
      ...summary,
      run: summary.defaultRun?.id === context.runId
        ? summary.defaultRun
        : services.runService.listByTask(task.id).find((item) => item.id === context.runId) ?? null,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
