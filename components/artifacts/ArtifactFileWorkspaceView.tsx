"use client";

import { lazy, Suspense } from "react";

const FileViewer = lazy(() => import("../FileViewer").then((module) => ({ default: module.FileViewer })));

interface Props {
  filePath: string;
  cwd?: string;
  sourceSessionId?: string | null;
  initialDisplayMode?: "diff";
  onOpenFile?: (filePath: string) => void;
  onMentionLines?: (relativePath: string, startLine: number, endLine: number) => void;
  gitRefreshKey?: number;
}

export function ArtifactFileWorkspaceView({ filePath, ...viewerProps }: Props) {
  return (
    <Suspense fallback={<div aria-busy="true" style={{ height: "100%", background: "var(--bg)" }} />}>
      <FileViewer filePath={filePath} {...viewerProps} />
    </Suspense>
  );
}
