import { SqliteUnitOfWork } from "@/lib/persistence";
import { ArtifactService } from "./artifact-service";
import { EventService } from "./event-service";
import { PiSessionReconciler } from "./pi-session-reconciler";
import { RunService } from "./run-service";
import { TaskService } from "./task-service";

declare global {
  var __piWebKernelServices: KernelServices | undefined;
}

export class KernelServices {
  readonly uow = new SqliteUnitOfWork();
  readonly taskService = new TaskService(this.uow);
  readonly runService = new RunService(this.uow);
  readonly artifactService = new ArtifactService(this.uow);
  readonly eventService = new EventService(this.uow.events);
  readonly piSessionReconciler = new PiSessionReconciler(this.uow, this.runService);
}

export function getKernelServices(): KernelServices {
  if (!globalThis.__piWebKernelServices) {
    globalThis.__piWebKernelServices = new KernelServices();
  }
  return globalThis.__piWebKernelServices;
}

export function resetKernelServicesForTests(): void {
  globalThis.__piWebKernelServices = undefined;
}
