import { NextResponse } from "@/server/next-compat";
import { getKernelServices } from "@/lib/server/kernel-services";
import { getKernelSchemaVersion } from "@/lib/persistence";
import { getRuntimeRegistry } from "@/lib/server/runtime-registry";

export const runtime = "nodejs";

export async function GET() {
  try {
    const services = getKernelServices();
    const tasks = services.taskService.listTasks({ includeArchived: true });
    const counts = tasks.reduce<Record<string, number>>((acc, task) => {
      acc[task.status] = (acc[task.status] ?? 0) + 1;
      return acc;
    }, {});
    return NextResponse.json({
      ok: true,
      kernelSchemaVersion: getKernelSchemaVersion(),
      runtimeCount: getRuntimeRegistry().list().length,
      taskCounts: counts,
      warnings: [
        ...(process.env.PI_WEB_DATA_DIR ? [] : ["PI_WEB_DATA_DIR not set; using default kernel data path"]),
      ],
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
