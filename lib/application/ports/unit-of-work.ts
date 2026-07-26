import type { ArtifactRepository } from "./artifact-repository";
import type { CapabilityRepository } from "./capability-repository";
import type { EventJournal } from "./event-journal";
import type { RunRepository } from "./run-repository";
import type { TaskRepository } from "./task-repository";

export interface UnitOfWorkContext {
  tasks: TaskRepository;
  runs: RunRepository;
  artifacts: ArtifactRepository;
  capabilities: CapabilityRepository;
  events: EventJournal;
}

export interface UnitOfWork extends UnitOfWorkContext {
  transaction<T>(work: (context: UnitOfWorkContext) => T): T;
}
