"use client";

import { requestJson } from "@/lib/api-client";
import type { CwdSystemPickResponse } from "@/lib/api-types";

export type NativeDirectoryPickResult =
  | { status: "selected"; path: string }
  | { status: "cancelled" }
  | { status: "unavailable" }
  | { status: "error"; message: string };

export async function pickNativeDirectory(): Promise<NativeDirectoryPickResult> {
  if (typeof window === "undefined") return { status: "unavailable" };

  // Desktop app: use Electron native dialog first.
  if (window.piDesktop?.selectDirectory) {
    try {
      const selected = await window.piDesktop.selectDirectory();
      if (!selected) return { status: "cancelled" };
      return { status: "selected", path: selected };
    } catch (error) {
      return {
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // Browser fallback: ask server to open a system folder picker.
  try {
    const data = await requestJson<CwdSystemPickResponse>("/api/cwd/system-pick", {
      method: "POST",
    });
    if (data.cancelled || !data.cwd) return { status: "cancelled" };
    return { status: "selected", path: data.cwd };
  } catch {
    return { status: "unavailable" };
  }
}
