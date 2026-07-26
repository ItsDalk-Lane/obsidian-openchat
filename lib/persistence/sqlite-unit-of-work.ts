import type { UnitOfWork, UnitOfWorkContext } from "@/lib/application/ports/unit-of-work";
import { getKernelDatabase, type KernelDatabase } from "./sqlite-database";
import { SqliteArtifactRepository } from "./sqlite-artifact-repository";
import { SqliteCapabilityRepository } from "./sqlite-capability-repository";
import { SqliteEventJournal } from "./sqlite-event-journal";
import { SqliteRunRepository } from "./sqlite-run-repository";
import { SqliteTaskRepository } from "./sqlite-task-repository";

export class SqliteUnitOfWork implements UnitOfWork {
  readonly tasks;
  readonly runs;
  readonly artifacts;
  readonly events;
  readonly capabilities;

  constructor(private readonly database: KernelDatabase = getKernelDatabase()) {
    const db = this.database.connection;
    this.tasks = new SqliteTaskRepository(db);
    this.runs = new SqliteRunRepository(db);
    this.artifacts = new SqliteArtifactRepository(db);
    this.capabilities = new SqliteCapabilityRepository(db);
    this.events = new SqliteEventJournal(db);
  }

  transaction<T>(work: (context: UnitOfWorkContext) => T): T {
    return this.database.transaction(() => work(this));
  }
}
