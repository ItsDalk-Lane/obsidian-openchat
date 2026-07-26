import type { Artifact, WorkspaceView } from "./kernel";

export interface ArtifactWorkbenchTab {
  id: string;
  kind: "artifact";
  label: string;
  artifact: Artifact;
  sourceSessionId?: string | null;
  iconKey?: string;
}

export interface WorkspaceViewTab {
  id: string;
  kind: "view";
  label: string;
  view: WorkspaceView;
  iconKey?: string;
}

export type WorkbenchTab = ArtifactWorkbenchTab | WorkspaceViewTab;
