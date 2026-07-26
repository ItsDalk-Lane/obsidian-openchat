import type { UnitOfWork } from "@/lib/application/ports/unit-of-work";
import type { RunId, TaskId } from "@/lib/kernel";

export interface CompiledContextSection {
  key: string;
  title: string;
  content: string;
}

export interface CompiledTaskContext {
  taskId: TaskId;
  runId?: RunId;
  compiled: string;
  sections: CompiledContextSection[];
  generatedAt: string;
}

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}\n...[truncated]`;
}

export class ContextCompilerService {
  constructor(private readonly uow: UnitOfWork) {}

  compileTaskContext(taskId: TaskId, options: { runId?: RunId; budgetChars?: number } = {}): CompiledTaskContext {
    const task = this.uow.tasks.getById(taskId);
    if (!task) throw new Error("Task not found");

    const budgetChars = Math.max(1_000, Math.min(options.budgetChars ?? 8_000, 30_000));
    const sections: CompiledContextSection[] = [];

    const contract = task.contract ?? {};
    const contractLines: string[] = [];
    if (contract.goal) contractLines.push(`Goal: ${contract.goal}`);
    if (contract.context) contractLines.push(`Context: ${contract.context}`);
    if (contract.constraints?.length) contractLines.push(`Constraints: ${contract.constraints.join(" | ")}`);
    if (contract.nonGoals?.length) contractLines.push(`Non-goals: ${contract.nonGoals.join(" | ")}`);
    if (contract.expectedArtifacts?.length) {
      contractLines.push(`Expected artifacts: ${contract.expectedArtifacts.map((item) => `${item.id}:${item.title}`).join(" ; ")}`);
    }
    if (contract.acceptanceCriteria?.length) {
      contractLines.push(`Acceptance criteria: ${contract.acceptanceCriteria.map((item) => `${item.id}:${item.description}`).join(" ; ")}`);
    }
    if (contractLines.length > 0) {
      sections.push({
        key: "task-contract",
        title: "Task Contract",
        content: contractLines.join("\n"),
      });
    }

    const artifacts = this.uow.artifacts.listByTask(taskId).slice(0, 10);
    if (artifacts.length > 0) {
      sections.push({
        key: "artifacts",
        title: "Recent Artifacts",
        content: artifacts.map((item) => {
          const title = item.titleOverride ?? item.artifact.title;
          return `- ${item.artifact.id} | ${item.artifact.type} | ${item.status} | ${title}`;
        }).join("\n"),
      });
    }

    const evidences = this.uow.capabilities.listEvidenceByTask(taskId).slice(0, 10);
    if (evidences.length > 0) {
      sections.push({
        key: "evidence",
        title: "Evidence",
        content: evidences.map((item) => `- ${item.capabilityId}: ${item.summary}`).join("\n"),
      });
    }

    const evaluations = this.uow.capabilities.listEvaluationsByTask(taskId).slice(0, 5);
    if (evaluations.length > 0) {
      sections.push({
        key: "evaluations",
        title: "Evaluations",
        content: evaluations.map((item) => `- ${item.evaluatorId} => ${item.status} (${item.score.toFixed(2)}): ${item.summary}`).join("\n"),
      });
    }

    const events = this.uow.events.getByTask(taskId, { limit: 30 });
    if (events.length > 0) {
      sections.push({
        key: "events",
        title: "Recent Events",
        content: events.map((entry) => `- #${entry.sequence} ${entry.event.type}`).join("\n"),
      });
    }

    const compiled = truncate(sections.map((item) => `## ${item.title}\n${item.content}`).join("\n\n"), budgetChars);
    return {
      taskId,
      runId: options.runId,
      compiled,
      sections,
      generatedAt: new Date().toISOString(),
    };
  }
}
