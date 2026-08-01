import { NextResponse } from "@/server/next-compat";
import { createKernelBackup } from "@/lib/server/kernel-maintenance";

export const runtime = "nodejs";

export async function POST() {
  try {
    const result = createKernelBackup();
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
