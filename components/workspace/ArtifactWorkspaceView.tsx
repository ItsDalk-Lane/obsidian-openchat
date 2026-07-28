"use client";

import { FileViewer } from "../FileViewer";
import type { Artifact } from "@/lib/kernel";

interface Props {
  artifact: Artifact;
  cwd?: string;
  sourceSessionId?: string | null;
  initialDisplayMode?: "diff";
  onOpenFile?: (filePath: string) => void;
  onMentionLines?: (relativePath: string, startLine: number, endLine: number) => void;
  gitRefreshKey?: number;
}

export function ArtifactWorkspaceView({ artifact, ...viewerProps }: Props) {
  const fileRepresentation = artifact.representations.find((item) => item.kind === "file");
  if (!fileRepresentation) return null;
  return <FileViewer filePath={fileRepresentation.path} {...viewerProps} />;
}
