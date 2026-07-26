import type { ArtifactId, RunId, TaskId } from "./ids";

export interface ArtifactRepresentationBase {
  kind: string;
  mediaType?: string;
}

export interface FileArtifactRepresentation extends ArtifactRepresentationBase {
  kind: "file";
  path: string;
  size?: number;
}

export type ArtifactRepresentation = FileArtifactRepresentation;

export interface ArtifactProvenance {
  kind?: "file" | "runtime";
  taskId?: TaskId;
  runId?: RunId;
  sourceSessionId?: string;
  capturedAt?: string;
}

export type ArtifactStatus = "draft" | "ready" | "archived";

export interface Artifact {
  id: ArtifactId;
  type: string;
  title: string;
  mediaType?: string;
  version: number;
  status: ArtifactStatus;
  createdAt: string;
  updatedAt: string;
  representations: ArtifactRepresentation[];
  provenance?: ArtifactProvenance;
  metadata?: Record<string, unknown>;
}
