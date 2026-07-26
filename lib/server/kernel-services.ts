import { SqliteUnitOfWork } from "@/lib/persistence";
import { KernelServices } from "@/lib/application/services/kernel-services";
import { getRuntimeRegistry } from "@/lib/server/runtime-registry";

declare global {
  var __piWebKernelServices: KernelServices | undefined;
}

export function getKernelServices(): KernelServices {
  if (!globalThis.__piWebKernelServices) {
    globalThis.__piWebKernelServices = new KernelServices(new SqliteUnitOfWork(), {
      runtimeRegistry: getRuntimeRegistry(),
    });
  }
  return globalThis.__piWebKernelServices;
}

export function resetKernelServicesForTests(): void {
  globalThis.__piWebKernelServices = undefined;
}
