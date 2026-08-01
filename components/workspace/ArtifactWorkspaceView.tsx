"use client";

import { lazy, Suspense } from "react";
import type { Artifact } from "@/lib/kernel";

const ArtifactFileWorkspaceView = lazy(() => import("../artifacts/ArtifactFileWorkspaceView").then((module) => ({
  default: module.ArtifactFileWorkspaceView,
})));

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
  return (
    <Suspense fallback={<div aria-busy="true" style={{ height: "100%", background: "var(--bg)" }} />}>
      <ArtifactFileWorkspaceView filePath={fileRepresentation.path} {...viewerProps} />
    </Suspense>
  );
}
