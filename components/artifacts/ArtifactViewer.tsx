"use client";

import type { ReactNode } from "react";
import type { Artifact } from "@/lib/kernel";
import { selectArtifactRenderer, type ArtifactRenderer } from "./artifact-renderer-registry";

interface Props<TContext> {
  artifact: Artifact;
  context: TContext;
  renderers: ArtifactRenderer<TContext>[];
  fallback: (artifact: Artifact, context: TContext) => ReactNode;
}

export function ArtifactViewer<TContext>({ artifact, context, renderers, fallback }: Props<TContext>) {
  const renderer = selectArtifactRenderer(artifact, renderers);
  if (!renderer) return <>{fallback(artifact, context)}</>;
  return <>{renderer.render({ artifact, context })}</>;
}
