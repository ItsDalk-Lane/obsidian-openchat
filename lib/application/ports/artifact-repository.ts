import type { Artifact, ArtifactId, RunId, TaskId } from "@/lib/kernel";

export interface TaskArtifactRecord {
  artifact: Artifact;
  taskId: TaskId;
  runId?: RunId;
  sourceSessionId?: string;
  attachedAt: string;
}

export interface AttachArtifactInput {
  taskId: TaskId;
  artifactId: ArtifactId;
  runId?: RunId;
  sourceSessionId?: string;
  attachedAt: string;
}

export interface ArtifactRepository {
  getById(id: ArtifactId): Artifact | null;
  listByTask(taskId: TaskId): TaskArtifactRecord[];
  upsert(artifact: Artifact): Artifact;
  attachToTask(input: AttachArtifactInput): TaskArtifactRecord;
  archive(id: ArtifactId, updatedAt: string): Artifact | null;
}
