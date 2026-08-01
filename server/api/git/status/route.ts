import fs from "fs";
import { ApiRequest, ApiResponse } from "@/server/http";
import { getAllowedFileRoots, isExistingFilePathAllowed, isFilePathAllowed, isWindowsAbsolutePath } from "@/lib/file-access";
import { getGitStatus } from "@/lib/git-changes";

export async function GET(request: ApiRequest) {
  try {
    const cwd = request.requestUrl.searchParams.get("cwd")?.trim() ?? "";
    if (!cwd || (!cwd.startsWith("/") && !isWindowsAbsolutePath(cwd))) {
      return ApiResponse.json({ error: "cwd must be an absolute path" }, { status: 400 });
    }

    const allowedRoots = await getAllowedFileRoots();
    if (!isFilePathAllowed(cwd, allowedRoots)) {
      return ApiResponse.json({ error: "Access denied" }, { status: 403 });
    }

    let stat: fs.Stats;
    try {
      stat = fs.statSync(cwd);
    } catch {
      return ApiResponse.json({ error: "Directory not found" }, { status: 404 });
    }
    if (!stat.isDirectory()) {
      return ApiResponse.json({ error: "Not a directory" }, { status: 400 });
    }
    if (!isExistingFilePathAllowed(cwd, allowedRoots)) {
      return ApiResponse.json({ error: "Access denied" }, { status: 403 });
    }

    return ApiResponse.json(await getGitStatus(cwd));
  } catch (error) {
    return ApiResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
