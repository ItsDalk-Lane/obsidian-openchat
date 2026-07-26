"use client";

import type { ReactNode } from "react";
import type { Artifact } from "@/lib/kernel";

export interface ArtifactRendererProps<TContext> {
  artifact: Artifact;
  context: TContext;
}

export interface ArtifactRenderer<TContext> {
  id: string;
  priority: number;
  canRender: (artifact: Artifact) => boolean;
  render: (props: ArtifactRendererProps<TContext>) => ReactNode;
}

export function selectArtifactRenderer<TContext>(
  artifact: Artifact,
  renderers: ArtifactRenderer<TContext>[],
): ArtifactRenderer<TContext> | null {
  const matched = renderers
    .filter((renderer) => renderer.canRender(artifact))
    .sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id));
  return matched[0] ?? null;
}
