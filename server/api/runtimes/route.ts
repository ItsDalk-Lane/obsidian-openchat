import { ApiResponse } from "@/server/http";
import { getRuntimeRegistry } from "@/lib/server/runtime-registry";

export const runtime = "nodejs";

export async function GET() {
  const runtimes = getRuntimeRegistry().list();
  return ApiResponse.json({ runtimes });
}
