import { randomUUID } from "crypto";
import type { UnitOfWork } from "@/lib/application/ports/unit-of-work";
import type { RunId, TaskEvaluation, TaskId } from "@/lib/kernel";

export interface EvaluateTaskInput {
  taskId: TaskId;
  runId?: RunId;
  evaluatorId?: string;
}

export class EvaluationService {
  constructor(private readonly uow: UnitOfWork) {}

  listByTask(taskId: TaskId): TaskEvaluation[] {
    return this.uow.capabilities.listEvaluationsByTask(taskId);
  }

  evaluateTask(input: EvaluateTaskInput): TaskEvaluation {
    const task = this.uow.tasks.getById(input.taskId);
    if (!task) throw new Error("Task not found");

    const expectedArtifacts = task.contract?.expectedArtifacts ?? [];
    const acceptanceCriteria = task.contract?.acceptanceCriteria ?? [];
    const attachedArtifacts = this.uow.artifacts.listByTask(task.id);
    const evidences = this.uow.capabilities.listEvidenceByTask(task.id);

    const expectedSatisfied = expectedArtifacts.length === 0
      ? 1
      : expectedArtifacts.filter((expected) => {
        return attachedArtifacts.some((attached) => {
          if (expected.artifactType && attached.artifact.type !== expected.artifactType) return false;
          const title = (attached.titleOverride ?? attached.artifact.title).toLowerCase();
          return title.includes(expected.title.toLowerCase()) || expected.title.toLowerCase().includes(title);
        });
      }).length / expectedArtifacts.length;

    const criteriaSatisfied = acceptanceCriteria.length === 0
      ? 1
      : Math.min(1, evidences.length / acceptanceCriteria.length);

    const score = Number((expectedSatisfied * 0.6 + criteriaSatisfied * 0.4).toFixed(4));
    const status: TaskEvaluation["status"] = score >= 0.8 ? "passed" : score >= 0.4 ? "needs_revision" : "failed";
    const summary = status === "passed"
      ? "Task meets contract expectations."
      : status === "needs_revision"
        ? "Task partially satisfies contract; revisions recommended."
        : "Task does not satisfy contract expectations.";

    const createdAt = new Date().toISOString();
    const evaluation: TaskEvaluation = {
      id: `eval_${randomUUID()}`,
      taskId: task.id,
      runId: input.runId,
      evaluatorId: input.evaluatorId?.trim() || "task.contract-completion-v1",
      score,
      status,
      summary,
      payload: {
        expectedSatisfied,
        criteriaSatisfied,
        expectedArtifactCount: expectedArtifacts.length,
        acceptanceCriteriaCount: acceptanceCriteria.length,
        evidenceCount: evidences.length,
        attachedArtifactCount: attachedArtifacts.length,
      },
      createdAt,
    };
    return this.uow.capabilities.createEvaluation(evaluation);
  }

  canCompleteTask(taskId: TaskId): { ok: boolean; reason?: string; evaluation?: TaskEvaluation } {
    const latest = this.listByTask(taskId)[0];
    if (!latest) return { ok: false, reason: "No evaluation exists for this task yet" };
    if (latest.status !== "passed") {
      return { ok: false, reason: `Latest evaluation is ${latest.status}`, evaluation: latest };
    }
    return { ok: true, evaluation: latest };
  }
}
