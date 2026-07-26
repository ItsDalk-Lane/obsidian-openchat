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
  taskId?: TaskId;
  runId?: RunId;
  sourceSessionId?: string;
}

export interface Artifact {
  id: ArtifactId;
  type: string;
  title: string;
  mediaType?: string;
  representations: ArtifactRepresentation[];
  provenance?: ArtifactProvenance;
  metadata?: Record<string, unknown>;
}
