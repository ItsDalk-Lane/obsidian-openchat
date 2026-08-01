import { NextResponse } from "@/server/next-compat";
import { getRuntimeRegistry } from "@/lib/server/runtime-registry";

export const runtime = "nodejs";

export async function GET() {
  const runtimes = getRuntimeRegistry().list();
  return NextResponse.json({ runtimes });
}
