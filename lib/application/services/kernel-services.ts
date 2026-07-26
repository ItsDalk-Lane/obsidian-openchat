import type { UnitOfWork } from "@/lib/application/ports/unit-of-work";
import { ArtifactService } from "./artifact-service";
import { CapabilityService } from "./capability-service";
import { ContextCompilerService } from "./context-compiler-service";
import { EvaluationService } from "./evaluation-service";
import { EventService } from "./event-service";
import { PiSessionReconciler } from "./pi-session-reconciler";
import { RunService } from "./run-service";
import { TaskService } from "./task-service";
import type { RuntimeRegistry } from "./runtime-registry";

interface KernelServicesOptions {
  runtimeRegistry: RuntimeRegistry;
}

export class KernelServices {
  readonly taskService: TaskService;
  readonly runService: RunService;
  readonly artifactService: ArtifactService;
  readonly capabilityService: CapabilityService;
  readonly contextCompilerService: ContextCompilerService;
  readonly evaluationService: EvaluationService;
  readonly eventService: EventService;
  readonly piSessionReconciler: PiSessionReconciler;

  constructor(readonly uow: UnitOfWork, options: KernelServicesOptions) {
    this.taskService = new TaskService(this.uow);
    this.runService = new RunService(this.uow);
    this.artifactService = new ArtifactService(this.uow);
    this.contextCompilerService = new ContextCompilerService(this.uow);
    this.evaluationService = new EvaluationService(this.uow);
    this.capabilityService = new CapabilityService(this.uow, options.runtimeRegistry, this.contextCompilerService);
    this.eventService = new EventService(this.uow.events);
    this.piSessionReconciler = new PiSessionReconciler(this.uow, this.runService);
  }
}
