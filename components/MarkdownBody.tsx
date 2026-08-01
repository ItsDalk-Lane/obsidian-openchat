"use client";

import { lazy, Suspense, useEffect, useMemo, useState, type MouseEvent } from "react";
import ReactMarkdown, { type Options as ReactMarkdownOptions } from "react-markdown";
import { resolveLocalFileHref } from "@/lib/file-links";
import { encodeFilePathForApi } from "@/lib/file-paths";

const MarkdownCodeBlock = lazy(() => import("./artifacts/MarkdownCodeBlock").then((module) => ({
  default: module.MarkdownCodeBlock,
})));

interface MarkdownRuntime {
  remarkPlugins: ReactMarkdownOptions["remarkPlugins"];
  rehypePlugins: ReactMarkdownOptions["rehypePlugins"];
  normalizeDisplayMath: (markdown: string) => string;
}

interface MarkdownBodyProps {
  children: string;
  className?: string;
  isStreaming?: boolean;
  cwd?: string;
  onOpenFile?: (filePath: string) => void;
}

export function MarkdownBody({ children, className, isStreaming, cwd, onOpenFile }: MarkdownBodyProps) {
  const [runtime, setRuntime] = useState<MarkdownRuntime | null>(null);

  useEffect(() => {
    let active = true;
    import("./artifacts/MarkdownRuntimeLoader")
      .then((module) => module.loadMarkdownRuntime())
      .then((loadedRuntime) => {
        if (active) setRuntime(loadedRuntime);
      }, () => {
        if (active) setRuntime(null);
      });
    return () => {
      active = false;
    };
  }, []);

  // 渲染函数身份要保持稳定，否则外层刷新会卸载图表并丢掉正在打开的预览状态。
  const markdownComponents = useMemo<NonNullable<ReactMarkdownOptions["components"]>>(() => ({
    code({ className, children, ...props }) {
      const lang = className?.replace("language-", "").toLowerCase() ?? "";
      const raw = String(children);
      const isBlock = className?.includes("language-") || raw.includes("\n");
      if (isBlock) {
        return (
          <Suspense fallback={<CodeBlockFallback code={raw.replace(/\n$/, "")} lang={lang} />}>
            <MarkdownCodeBlock
              code={raw.replace(/\n$/, "")}
              lang={lang}
              isStreaming={isStreaming}
            />
          </Suspense>
        );
      }
      return (
        <code
          className="markdown-inline-code"
          {...props}
        >
          {children}
        </code>
      );
    },
    pre({ children }) {
      return <>{children}</>;
    },
    a({ href, children, ...props }) {
      // `node` 是渲染器内部信息，不能透传给页面元素。
      delete props.node;
      const filePath = onOpenFile ? resolveLocalFileHref(href, cwd) : null;
      const openFile = onOpenFile;
      if (!filePath || !openFile) {
        return (
          <a href={href} {...props} target="_blank" rel="noopener noreferrer">
            {children}
          </a>
        );
      }

      const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
        if (event.defaultPrevented || event.button !== 0) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const target = event.currentTarget.getAttribute("target");
        if (target && target !== "_self") return;
        event.preventDefault();
        openFile(filePath);
      };

      return (
        <a href={href} {...props} onClick={handleClick}>
          {children}
        </a>
      );
    },
    img({ src, alt, ...props }) {
      delete props.node;
      const filePath = typeof src === "string" ? resolveLocalFileHref(src, cwd) : null;
      const imageSrc = filePath
        ? `/api/files/${encodeFilePathForApi(filePath)}?type=read`
        : src;
      return <img src={imageSrc} alt={alt ?? ""} loading="lazy" {...props} />;
    },
    table({ children }) {
      return (
        <div className="markdown-table-wrap">
          <table>{children}</table>
        </div>
      );
    },
  }), [cwd, isStreaming, onOpenFile]);

  const normalizedMarkdown = useMemo(
    () => runtime?.normalizeDisplayMath(children) ?? children,
    [children, runtime],
  );

  return (
    <div className={["markdown-body", className].filter(Boolean).join(" ")}>
      <ReactMarkdown
        remarkPlugins={runtime?.remarkPlugins}
        rehypePlugins={runtime?.rehypePlugins}
        components={markdownComponents}
      >
        {normalizedMarkdown}
      </ReactMarkdown>
    </div>
  );
}

function CodeBlockFallback({ code, lang }: { code: string; lang: string }) {
  return (
    <div className="markdown-code-block" aria-busy="true">
      <div className="markdown-code-header">
        <span className="markdown-code-lang">{lang || "text"}</span>
      </div>
      <pre style={{ margin: 0, padding: "11px 13px", overflow: "auto" }}>
        <code style={{ fontFamily: "var(--font-mono)", fontSize: 12.5, lineHeight: 1.62 }}>{code}</code>
      </pre>
    </div>
  );
}
