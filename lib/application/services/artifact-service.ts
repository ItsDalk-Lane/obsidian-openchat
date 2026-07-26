import type { UnitOfWork } from "@/lib/application/ports/unit-of-work";
import type { TaskArtifactAttachmentStatus, TaskArtifactRecord } from "@/lib/application/ports/artifact-repository";
import { createKernelEvent, type Artifact, type ArtifactId, type RunId, type TaskId } from "@/lib/kernel";

export interface RegisterArtifactInput {
  taskId: TaskId;
  artifact: Artifact;
  runId?: RunId;
  sourceSessionId?: string;
  attachmentStatus?: TaskArtifactAttachmentStatus;
  titleOverride?: string;
  role?: string;
  attachmentMetadata?: Record<string, unknown>;
}

export interface UpdateArtifactInput {
  taskId: TaskId;
  artifactId: ArtifactId;
  titleOverride?: string;
  status?: TaskArtifactAttachmentStatus;
  role?: string;
  runId?: RunId;
  metadata?: Record<string, unknown>;
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
        status: input.attachmentStatus ?? "ready",
        titleOverride: input.titleOverride,
        role: input.role,
        metadata: input.attachmentMetadata,
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

  updateArtifact(input: UpdateArtifactInput): TaskArtifactRecord {
    return this.uow.transaction(({ runs, artifacts, events }) => {
      const attached = artifacts.listByTask(input.taskId).find((record) => record.artifact.id === input.artifactId);
      if (!attached) throw new Error("Artifact not found");
      if (input.runId) {
        const run = runs.getById(input.runId);
        if (!run || run.taskId !== input.taskId) {
          throw new Error("Run not found for task");
        }
      }
      const updatedAttachment = artifacts.updateTaskAttachment({
        taskId: input.taskId,
        artifactId: input.artifactId,
        runId: input.runId,
        status: input.status,
        titleOverride: input.titleOverride?.trim() ? input.titleOverride.trim() : undefined,
        role: input.role?.trim() ? input.role.trim() : undefined,
        metadata: input.metadata,
      });
      if (!updatedAttachment) throw new Error("Artifact not found");
      events.append(createKernelEvent(
        input.status === "archived" ? "artifact.archived" : "artifact.updated",
        input.taskId,
        input.runId,
        input.status === "archived"
          ? { artifactId: updatedAttachment.artifact.id }
          : { artifactId: updatedAttachment.artifact.id, changedFields: ["taskAttachment"] },
        { kind: "system" },
      ), "durable");
      return updatedAttachment;
    });
  }
}
