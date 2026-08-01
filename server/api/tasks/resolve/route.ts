import { NextResponse } from "@/server/next-compat";
import { getKernelServices } from "@/lib/server/kernel-services";
import { getRuntimeRegistry } from "@/lib/server/runtime-registry";
import { badRequest, summarizeTask } from "../task-route-helpers";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const runtimeKind = url.searchParams.get("runtimeKind");
    const nativeRuntimeId = url.searchParams.get("nativeRuntimeId");
    if (!runtimeKind || !nativeRuntimeId) {
      return badRequest("runtimeKind and nativeRuntimeId are required");
    }
    const adapter = getRuntimeRegistry().get(runtimeKind);
    if (!adapter) return badRequest(`Unsupported runtimeKind: ${runtimeKind}`);

    const services = getKernelServices();
    if (runtimeKind === "pi") {
      await services.piSessionReconciler.reconcileSession(nativeRuntimeId);
    }
    const context = services.runService.getRuntimeContext(runtimeKind, nativeRuntimeId);
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
