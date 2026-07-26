import { getKernelServices } from "@/lib/server/kernel-services";

declare global {
  var __piWebKernelStartupRecovered: boolean | undefined;
}

export function ensureKernelStartupRecovery(): void {
  if (globalThis.__piWebKernelStartupRecovered) return;
  getKernelServices().piSessionReconciler.interruptStaleRuns(new Set());
  globalThis.__piWebKernelStartupRecovered = true;
}

export function resetKernelStartupRecoveryForTests(): void {
  globalThis.__piWebKernelStartupRecovered = undefined;
}
