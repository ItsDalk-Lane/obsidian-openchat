"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

const DROPDOWN_ANIMATION_MS = 140;

export function displayCwd(cwd: string, homeDir?: string): string {
  return homeDir && cwd.startsWith(homeDir)
    ? `~${cwd.slice(homeDir.length)}`
    : cwd;
}

export function PathLabel({
  text,
  style,
}: {
  text: string;
  style?: CSSProperties;
}) {
  return (
    <span
      style={{
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        display: "block",
        minWidth: 0,
        lineHeight: 1.35,
        direction: "rtl",
        textAlign: "left",
        ...style,
      }}
    >
      <span style={{ unicodeBidi: "plaintext" }}>{text}</span>
    </span>
  );
}

export function AnimatedDropdown({
  open,
  children,
  style,
  from = "top",
}: {
  open: boolean;
  children: ReactNode;
  style: CSSProperties;
  /** Anchor edge the dropdown grows from; "bottom" for menus opening upward. */
  from?: "top" | "bottom";
}) {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(open);

  useEffect(() => {
    let frame: number | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    if (open) {
      setMounted(true);
      setVisible(false);
      frame = window.requestAnimationFrame(() => {
        frame = window.requestAnimationFrame(() => setVisible(true));
      });
    } else {
      setVisible(false);
      timeout = setTimeout(() => setMounted(false), DROPDOWN_ANIMATION_MS);
    }

    return () => {
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      if (timeout) clearTimeout(timeout);
    };
  }, [open]);

  if (!mounted) return null;

  return (
    <div
      style={{
        ...style,
        opacity: visible ? 1 : 0,
        transform: visible
          ? "translateY(0) scale(1)"
          : `translateY(${from === "top" ? "-8px" : "8px"}) scale(0.96)`,
        transformOrigin: from === "top" ? "top center" : "bottom center",
        transition: `opacity ${DROPDOWN_ANIMATION_MS}ms ease, transform ${DROPDOWN_ANIMATION_MS}ms ease`,
        pointerEvents: open ? "auto" : "none",
      }}
    >
      {children}
    </div>
  );
}
