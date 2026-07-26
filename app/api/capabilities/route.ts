import { NextResponse } from "next/server";
import { getKernelServices } from "@/lib/server/kernel-services";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const runtimeKind = url.searchParams.get("runtimeKind") ?? undefined;
    const invokableOnly = url.searchParams.get("invokableOnly") === "1";
    const capabilities = getKernelServices().capabilityService.listCapabilities({
      runtimeKind: runtimeKind || undefined,
      invokableOnly,
    });
    return NextResponse.json({ capabilities });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
