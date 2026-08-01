import { ApiResponse } from "@/server/http";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import path from "path";
import { getAgentDir, parseFrontmatter } from "@earendil-works/pi-coding-agent";
import { loadSkillsWithInstallInfo } from "@/lib/skills-service";
import { getAllowedFileRoots, isExistingFilePathAllowed } from "@/lib/file-access";
import { hasJsonContentType, isApiRequestAllowed } from "@/lib/request-security";

export const dynamic = "force-dynamic";

// GET /api/skills?cwd=<path>
// Uses DefaultResourceLoader (same logic as AgentSession startup) so settings.json
// skill paths, package skills, and .agents/skills directories are all included.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const cwd = searchParams.get("cwd");
  if (!cwd) return ApiResponse.json({ error: "cwd required" }, { status: 400 });

  try {
    const allowedRoots = await getAllowedFileRoots();
    if (!isExistingFilePathAllowed(cwd, allowedRoots)) {
      return ApiResponse.json({ error: "Access denied" }, { status: 403 });
    }
    return ApiResponse.json(await loadSkillsWithInstallInfo(cwd));
  } catch (e) {
    return ApiResponse.json({ error: String(e) }, { status: 500 });
  }
}

// PATCH /api/skills — toggle disable-model-invocation on a SKILL.md file
export async function PATCH(req: Request) {
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
    const body = await req.json() as {
      filePath?: unknown;
      disableModelInvocation?: unknown;
    };
    const { filePath, disableModelInvocation } = body;
    if (typeof filePath !== "string" || !filePath) {
      return ApiResponse.json({ error: "filePath required" }, { status: 400 });
    }
    if (typeof disableModelInvocation !== "boolean") {
      return ApiResponse.json(
        { error: "disableModelInvocation must be boolean" },
        { status: 400 },
      );
    }
    if (!existsSync(filePath)) return ApiResponse.json({ error: "file not found" }, { status: 404 });
    const allowedRoots = new Set(await getAllowedFileRoots());
    allowedRoots.add(getAgentDir());
    // 全局安装的技能可能通过符号链接出现在代理目录里，真实文件位于这个固定目录。
    const globalSkillsDir = path.join(homedir(), ".agents", "skills");
    if (existsSync(globalSkillsDir)) allowedRoots.add(globalSkillsDir);
    if (!isExistingFilePathAllowed(filePath, allowedRoots)) {
      return ApiResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const content = readFileSync(filePath, "utf8");
    const key = "disable-model-invocation";

    // Use parseFrontmatter to check current value, then do a surgical line edit
    // to preserve the original YAML formatting of all other fields.
    const { frontmatter } = parseFrontmatter<Record<string, unknown>>(content);
    const alreadySet = Boolean(frontmatter[key]);

    let updated = content;
    if (disableModelInvocation && !alreadySet) {
      // Add key after the opening --- line
      updated = content.replace(/^---\r?\n/, `---\n${key}: true\n`);
      // If no frontmatter exists, create one
      if (updated === content) updated = `---\n${key}: true\n---\n${content}`;
    } else if (!disableModelInvocation && alreadySet) {
      // Remove the key line entirely
      updated = content.replace(new RegExp(`^${key}\\s*:.*\\r?\\n`, "m"), "");
    }

    writeFileSync(filePath, updated, "utf8");
    return ApiResponse.json({ success: true });
  } catch (e) {
    return ApiResponse.json({ error: String(e) }, { status: 500 });
  }
}
