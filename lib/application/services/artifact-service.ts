import type { UnitOfWork } from "@/lib/application/ports/unit-of-work";
import { createKernelEvent, type Artifact, type ArtifactId, type RunId, type TaskId } from "@/lib/kernel";

export interface RegisterArtifactInput {
  taskId: TaskId;
  artifact: Artifact;
  runId?: RunId;
  sourceSessionId?: string;
}

export interface UpdateArtifactInput {
  taskId: TaskId;
  artifactId: ArtifactId;
  title?: string;
  status?: Artifact["status"];
  runId?: RunId;
}

export class ArtifactService {
  constructor(private readonly uow: UnitOfWork) {}

  listByTask(taskId: TaskId) {
    return this.uow.artifacts.listByTask(taskId);
  }

  registerArtifact(input: RegisterArtifactInput) {
    return this.uow.transaction(({ tasks, runs, artifacts, events }) => {
      const task = tasks.getById(input.taskId);
      if (!task) throw new Error("Task not found");
      if (input.runId) {
        const run = runs.getById(input.runId);
        if (!run || run.taskId !== input.taskId) {
          throw new Error("Run not found for task");
        }
      }
      const existing = artifacts.getById(input.artifact.id);
      const stored = artifacts.upsert(input.artifact);
      const attachment = artifacts.attachToTask({
        taskId: input.taskId,
        artifactId: stored.id,
        runId: input.runId,
        sourceSessionId: input.sourceSessionId,
        attachedAt: input.artifact.updatedAt,
      });
      events.append(createKernelEvent(
        existing ? "artifact.updated" : "artifact.registered",
        input.taskId,
        input.runId ?? task.defaultRunId,
        existing
          ? { artifactId: stored.id, changedFields: ["metadata", "representations"] }
          : { artifactId: stored.id, artifactType: stored.type },
        { kind: "system" },
      ), "durable");
      return attachment;
    });
  }

  updateArtifact(input: UpdateArtifactInput): Artifact {
    return this.uow.transaction(({ runs, artifacts, events }) => {
      const attached = artifacts.listByTask(input.taskId).find((record) => record.artifact.id === input.artifactId);
      if (!attached) throw new Error("Artifact not found");
      if (input.runId) {
        const run = runs.getById(input.runId);
        if (!run || run.taskId !== input.taskId) {
          throw new Error("Run not found for task");
        }
      }
      const existing = artifacts.getById(input.artifactId);
      if (!existing) throw new Error("Artifact not found");
      const updatedAt = new Date().toISOString();
      const next: Artifact = {
        ...existing,
        title: input.title?.trim() ? input.title.trim() : existing.title,
        status: input.status ?? existing.status,
        updatedAt,
      };
      artifacts.upsert(next);
      events.append(createKernelEvent(
        next.status === "archived" ? "artifact.archived" : "artifact.updated",
        input.taskId,
        input.runId,
        next.status === "archived"
          ? { artifactId: next.id }
          : { artifactId: next.id, changedFields: ["title", "status"] },
        { kind: "system" },
      ), "durable");
      return next;
    });
  }
}
