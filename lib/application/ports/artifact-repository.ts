import type { Artifact, ArtifactId, RunId, TaskId } from "@/lib/kernel";

export type TaskArtifactAttachmentStatus = "draft" | "ready" | "archived";

export interface TaskArtifactRecord {
  artifact: Artifact;
  taskId: TaskId;
  runId?: RunId;
  sourceSessionId?: string;
  attachedAt: string;
  status: TaskArtifactAttachmentStatus;
  titleOverride?: string;
  role?: string;
  provenance?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface AttachArtifactInput {
  taskId: TaskId;
  artifactId: ArtifactId;
  runId?: RunId;
  sourceSessionId?: string;
  attachedAt: string;
  status?: TaskArtifactAttachmentStatus;
  titleOverride?: string;
  role?: string;
  provenance?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface UpdateTaskArtifactAttachmentInput {
  taskId: TaskId;
  artifactId: ArtifactId;
  runId?: RunId;
  status?: TaskArtifactAttachmentStatus;
  titleOverride?: string;
  role?: string;
  metadata?: Record<string, unknown>;
}

export interface ArtifactRepository {
  getById(id: ArtifactId): Artifact | null;
  listByTask(taskId: TaskId): TaskArtifactRecord[];
  upsert(artifact: Artifact): Artifact;
  attachToTask(input: AttachArtifactInput): TaskArtifactRecord;
  updateTaskAttachment(input: UpdateTaskArtifactAttachmentInput): TaskArtifactRecord | null;
  archive(id: ArtifactId, updatedAt: string): Artifact | null;
}
