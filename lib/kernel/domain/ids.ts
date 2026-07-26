export type TaskId = string & { readonly __brand: "TaskId" };
export type RunId = string & { readonly __brand: "RunId" };
export type ArtifactId = string & { readonly __brand: "ArtifactId" };
export type WorkspaceViewId = string & { readonly __brand: "WorkspaceViewId" };

function hashFNV1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function createScopedId(prefix: string, stableSource: string): string {
  return `${prefix}_${hashFNV1a(stableSource)}`;
}

export function createTaskId(stableSource: string): TaskId {
  return createScopedId("task", stableSource) as TaskId;
}

export function createRunId(stableSource: string): RunId {
  return createScopedId("run", stableSource) as RunId;
}

export function createArtifactId(stableSource: string): ArtifactId {
  return createScopedId("artifact", stableSource) as ArtifactId;
}

export function createWorkspaceViewId(stableSource: string): WorkspaceViewId {
  return createScopedId("view", stableSource) as WorkspaceViewId;
}
