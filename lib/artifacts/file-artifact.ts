import type { Artifact } from "../kernel";
import { createArtifactId } from "../kernel";
import { getFileExt, getAudioMime, getDocumentMime, getImageMime } from "../file-types";
import { getFileName } from "../file-paths";

export interface FileArtifactOptions {
  sourceSessionId?: string | null;
  cwd?: string;
  title?: string;
}

const TEXT_EXT_TO_MEDIA: Record<string, string> = {
  md: "text/markdown",
  markdown: "text/markdown",
  txt: "text/plain",
  ts: "text/typescript",
  tsx: "text/tsx",
  js: "text/javascript",
  jsx: "text/jsx",
  json: "application/json",
  yaml: "application/yaml",
  yml: "application/yaml",
  html: "text/html",
  css: "text/css",
  py: "text/x-python",
  go: "text/x-go",
  rs: "text/x-rust",
  java: "text/x-java-source",
  c: "text/x-c",
  cpp: "text/x-c++src",
  cs: "text/x-csharp",
  sh: "text/x-shellscript",
  xml: "application/xml",
};

function normalizePathForId(path: string): string {
  const slashPath = path.replace(/\\/g, "/");
  if (/^[a-zA-Z]:\//.test(slashPath) || slashPath.startsWith("//")) {
    return slashPath.toLowerCase();
  }
  return slashPath;
}

function inferMediaType(filePath: string): string | undefined {
  return getImageMime(filePath)
    ?? getAudioMime(filePath)
    ?? getDocumentMime(filePath)
    ?? TEXT_EXT_TO_MEDIA[getFileExt(filePath)]
    ?? undefined;
}

function inferArtifactType(filePath: string, mediaType?: string): string {
  const fileName = getFileName(filePath);
  const hasExtension = fileName.includes(".") && !fileName.endsWith(".");
  if (mediaType?.startsWith("image/")) return "image";
  if (mediaType?.startsWith("audio/")) return "audio";
  if (mediaType === "application/pdf" || mediaType?.includes("wordprocessingml")) return "document";
  if (mediaType?.startsWith("text/") || mediaType === "application/json" || mediaType === "application/xml") return "text";
  if (hasExtension) return "file";
  return "unknown";
}

export function createFileArtifact(filePath: string, options: FileArtifactOptions = {}): Artifact {
  const stablePath = normalizePathForId(filePath);
  const mediaType = inferMediaType(filePath);
  const now = new Date().toISOString();
  return {
    id: createArtifactId(`file:${stablePath}`),
    type: inferArtifactType(filePath, mediaType),
    title: options.title ?? getFileName(filePath) ?? filePath,
    mediaType,
    version: 1,
    status: "ready",
    createdAt: now,
    updatedAt: now,
    representations: [
      {
        kind: "file",
        path: filePath,
        mediaType,
      },
    ],
    provenance: {
      kind: "file",
      sourceSessionId: options.sourceSessionId ?? undefined,
      capturedAt: now,
    },
    metadata: {
      cwd: options.cwd,
      extension: getFileExt(filePath),
    },
  };
}
