import { stat } from "fs/promises";
import { resolve } from "path";
import { ApiResponse } from "@/server/http";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { getAllowedFileRoots, isExistingFilePathAllowed } from "@/lib/file-access";
import { invalidateModelsCache } from "@/lib/models-cache";
import { getProjectTrustStatus, trustProject } from "@/lib/project-trust";
import { destroyRpcSessionsForCwd, hasBusyRpcSessionForCwd } from "@/lib/rpc-manager";
import { hasJsonContentType, isApiRequestAllowed } from "@/lib/request-security";

export const dynamic = "force-dynamic";

async function validateCwd(value: unknown): Promise<
  { cwd: string } | { response: ApiResponse }
> {
  if (typeof value !== "string" || !value.trim()) {
    return { response: ApiResponse.json({ error: "cwd required" }, { status: 400 }) };
  }

  const cwd = resolve(value);
  try {
    if (!(await stat(cwd)).isDirectory()) {
      return {
        response: ApiResponse.json(
          { error: "cwd must be a directory" },
          { status: 400 },
        ),
      };
    }
  } catch {
    return {
      response: ApiResponse.json(
        { error: "Directory does not exist" },
        { status: 400 },
      ),
    };
  }

  const allowedRoots = await getAllowedFileRoots();
  if (!isExistingFilePathAllowed(cwd, allowedRoots)) {
    return { response: ApiResponse.json({ error: "Access denied" }, { status: 403 }) };
  }
  return { cwd };
}

export async function GET(req: Request) {
  const result = await validateCwd(new URL(req.url).searchParams.get("cwd"));
  if ("response" in result) return result.response;
  return ApiResponse.json(getProjectTrustStatus(result.cwd, getAgentDir()));
}

export async function POST(req: Request) {
  if (!isApiRequestAllowed(req)) {
    return ApiResponse.json({ error: "Untrusted API request" }, { status: 403 });
  }
  if (!hasJsonContentType(req)) {
    return ApiResponse.json(
      { error: "Content-Type must be application/json" },
      { status: 415 },
    );
  }

  try {
    const body = await req.json() as { cwd?: unknown };
    const result = await validateCwd(body.cwd);
    if ("response" in result) return result.response;

    const agentDir = getAgentDir();
    const current = getProjectTrustStatus(result.cwd, agentDir);
    if (!current.requiresTrust) {
      return ApiResponse.json(
        { error: "这个项目没有需要确认信任的本地资源" },
        { status: 409 },
      );
    }
    if (hasBusyRpcSessionForCwd(result.cwd)) {
      return ApiResponse.json(
        { error: "请等当前会话结束后再信任这个项目" },
        { status: 409 },
      );
    }

    const status = trustProject(result.cwd, agentDir);
    invalidateModelsCache();
    destroyRpcSessionsForCwd(result.cwd);
    return ApiResponse.json(status);
  } catch (error) {
    return ApiResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
