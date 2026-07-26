import type { Artifact } from "./artifact";
import type { RunId, TaskId, WorkspaceViewId } from "./ids";

export interface ChatWorkspaceView {
  id: WorkspaceViewId;
  type: "chat";
  title: string;
  closable: boolean;
  ref: {
    sessionId: string | null;
    taskId?: TaskId;
    runId?: RunId;
  };
}

export interface ArtifactWorkspaceView {
  id: WorkspaceViewId;
  type: "artifact";
  title: string;
  closable: boolean;
  ref: {
    artifact: Artifact;
  };
}

export type WorkspaceView = ChatWorkspaceView | ArtifactWorkspaceView;
