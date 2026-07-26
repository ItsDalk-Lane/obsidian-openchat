import { NextResponse } from "next/server";
import { applyKernelEventRetention } from "@/lib/server/kernel-maintenance";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json() as {
      olderThanDays?: number;
      keepLatestPerTask?: number;
    };
    const olderThanDays = Number.isFinite(body.olderThanDays) ? Number(body.olderThanDays) : 30;
    const keepLatestPerTask = Number.isFinite(body.keepLatestPerTask) ? Number(body.keepLatestPerTask) : 200;
    if (olderThanDays < 1) {
      return NextResponse.json({ error: "olderThanDays must be >= 1" }, { status: 400 });
    }
    if (keepLatestPerTask < 1) {
      return NextResponse.json({ error: "keepLatestPerTask must be >= 1" }, { status: 400 });
    }
    const result = applyKernelEventRetention({ olderThanDays, keepLatestPerTask });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : String(error),
    }, { status: 400 });
  }
}
