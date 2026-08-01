import type { Options as ReactMarkdownOptions } from "react-markdown";

interface MarkdownRuntime {
  remarkPlugins: ReactMarkdownOptions["remarkPlugins"];
  rehypePlugins: ReactMarkdownOptions["rehypePlugins"];
  normalizeDisplayMath: (markdown: string) => string;
}

export async function loadMarkdownRuntime(): Promise<MarkdownRuntime> {
  const module = await import("@/lib/markdown");
  return {
    remarkPlugins: module.markdownRemarkPlugins,
    rehypePlugins: module.markdownRehypePlugins,
    normalizeDisplayMath: module.normalizeDisplayMath,
  };
}
