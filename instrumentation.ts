export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { configureHttpDispatcher } = await import("@/lib/http-dispatcher");
  const { ensureKernelStartupRecovery } = await import("@/lib/application/services");
  configureHttpDispatcher();
  ensureKernelStartupRecovery();
}
