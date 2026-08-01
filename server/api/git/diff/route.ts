import { ApiRequest, ApiResponse } from "@/server/http";
import { getAllowedFileRoots, isExistingFilePathAllowed, isFilePathAllowed, isWindowsAbsolutePath } from "@/lib/file-access";
import { getGitFileDiff } from "@/lib/git-changes";

export async function GET(request: ApiRequest) {
  try {
    const cwd = request.requestUrl.searchParams.get("cwd")?.trim() ?? "";
    const filePath = request.requestUrl.searchParams.get("path")?.trim() ?? "";
    if (!cwd || (!cwd.startsWith("/") && !isWindowsAbsolutePath(cwd))) {
      return ApiResponse.json({ error: "cwd must be an absolute path" }, { status: 400 });
    }
    if (!filePath || (!filePath.startsWith("/") && !isWindowsAbsolutePath(filePath))) {
      return ApiResponse.json({ error: "path must be an absolute path" }, { status: 400 });
    }

    const allowedRoots = await getAllowedFileRoots();
    if (!isFilePathAllowed(cwd, allowedRoots) || !isFilePathAllowed(filePath, allowedRoots)) {
      return ApiResponse.json({ error: "Access denied" }, { status: 403 });
    }
    // 已删除文件本身不再存在；后续逻辑会再次确认它属于当前仓库且确实处于删除状态。
    if (!isExistingFilePathAllowed(cwd, allowedRoots)) {
      return ApiResponse.json({ error: "Access denied" }, { status: 403 });
    }

    return ApiResponse.json(await getGitFileDiff(cwd, filePath));
  } catch (error) {
    return ApiResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
