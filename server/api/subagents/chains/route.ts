import { ApiResponse } from "@/server/http";
import { listSubagentChains } from "@/lib/subagents-config";
import { getAllowedFileRoots, isExistingFilePathAllowed } from "@/lib/file-access";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const cwd = new URL(req.url).searchParams.get("cwd");
  if (!cwd) return ApiResponse.json({ error: "cwd required" }, { status: 400 });
  if (!isExistingFilePathAllowed(cwd, await getAllowedFileRoots())) {
    return ApiResponse.json({ error: "Access denied" }, { status: 403 });
  }
  try {
    return ApiResponse.json({ chains: listSubagentChains(cwd) });
  } catch (error) {
    return ApiResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
