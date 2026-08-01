import { ApiResponse } from "@/server/http";
import { getKernelServices } from "@/lib/server/kernel-services";
import { getRunningRpcSessionIds } from "@/lib/rpc-manager";
import type { TaskContractAcceptanceCriterion, TaskContractArtifactExpectation } from "@/lib/kernel";
import { badRequest, enforceSameOrigin, isTaskStatus, summarizeTask } from "./task-route-helpers";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const services = getKernelServices();
    const rawStatus = url.searchParams.get("status");
    if (rawStatus && !isTaskStatus(rawStatus)) {
      return badRequest("Invalid task status");
    }
    const status = rawStatus && isTaskStatus(rawStatus) ? rawStatus : undefined;
    await services.piSessionReconciler.reconcileAll({
      runningSessionIds: new Set(getRunningRpcSessionIds()),
    });
    const tasks = services.taskService.listTasks({
      originKind: url.searchParams.get("origin") === "pi-session" || url.searchParams.get("origin") === "native"
        ? url.searchParams.get("origin") as "pi-session" | "native"
        : undefined,
      status: status ?? undefined,
      projectRoot: url.searchParams.get("project") ?? undefined,
      includeArchived: url.searchParams.get("includeArchived") === "1",
    });
    return ApiResponse.json({
      tasks: tasks.map((task) => summarizeTask(task)),
    });
  } catch (error) {
    return ApiResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const forbidden = enforceSameOrigin(req);
  if (forbidden) return forbidden;
  try {
    const body = await req.json() as {
      title?: string;
      goal?: string;
      context?: string;
      constraints?: string[];
      nonGoals?: string[];
      expectedArtifacts?: TaskContractArtifactExpectation[];
      acceptanceCriteria?: TaskContractAcceptanceCriterion[];
      scope?: { cwd?: string; projectRoot?: string; worktreeBranch?: string };
    };
    if (!body.title || typeof body.title !== "string") {
      return badRequest("title is required");
    }

    const task = getKernelServices().taskService.createTask({
      title: body.title,
      goal: body.goal,
      context: body.context,
      constraints: body.constraints,
      nonGoals: body.nonGoals,
      expectedArtifacts: body.expectedArtifacts,
      acceptanceCriteria: body.acceptanceCriteria,
      scope: body.scope,
    });
    return ApiResponse.json(summarizeTask(task), { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return ApiResponse.json({ error: message }, { status: 400 });
  }
}
