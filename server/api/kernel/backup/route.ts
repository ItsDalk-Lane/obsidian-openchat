import { ApiResponse } from "@/server/http";
import { createKernelBackup } from "@/lib/server/kernel-maintenance";

export const runtime = "nodejs";

export async function POST() {
  try {
    const result = createKernelBackup();
    return ApiResponse.json(result, { status: 201 });
  } catch (error) {
    return ApiResponse.json({
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
