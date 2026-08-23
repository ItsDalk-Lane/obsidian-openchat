"use client";

import { CodeBlock, MermaidBlock } from "../MermaidBlock";

interface Props {
  code: string;
  lang: string;
  isStreaming?: boolean;
}

export function MarkdownCodeBlock({ code, lang, isStreaming }: Props) {
  if (lang === "mermaid") {
    return <MermaidBlock code={code} isStreaming={isStreaming} />;
  }
  return <CodeBlock code={code} lang={lang} isStreaming={isStreaming} />;
}
