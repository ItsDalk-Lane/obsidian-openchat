import type { EventJournal } from "@/lib/application/ports/event-journal";
import type { KernelEvent, KernelEventDurability, StoredKernelEvent } from "@/lib/kernel";

const DURABLE_EVENT_TYPES = new Set<KernelEvent["type"]>([
  "task.created",
  "task.updated",
  "task.status.changed",
  "run.created",
  "run.status.changed",
  "run.interrupted",
  "operation.started",
  "operation.completed",
  "operation.failed",
  "operation.aborted",
  "capability.execution.started",
  "capability.execution.completed",
  "compaction.started",
  "compaction.completed",
  "retry.started",
  "retry.completed",
  "extension.failed",
  "artifact.registered",
  "artifact.updated",
  "artifact.archived",
]);

export function getKernelEventDurability(event: KernelEvent): KernelEventDurability {
  return DURABLE_EVENT_TYPES.has(event.type) ? "durable" : "transient";
}

export class EventService {
  constructor(private readonly journal: EventJournal) {}

  appendIfDurable(event: KernelEvent): StoredKernelEvent | null {
    const durability = getKernelEventDurability(event);
    if (durability !== "durable") return null;
    return this.journal.append(event, durability);
  }

  appendManyIfDurable(events: KernelEvent[]): StoredKernelEvent[] {
    const entries = events
      .map((event) => ({ event, durability: getKernelEventDurability(event) }))
      .filter((entry) => entry.durability === "durable");
    return this.journal.appendMany(entries);
  }

  tryAppendRuntimeEvent(event: KernelEvent): StoredKernelEvent | null {
    try {
      return this.appendIfDurable(event);
    } catch (error) {
      console.error("[pi-web] failed to persist kernel event:", error instanceof Error ? error.message : error);
      return null;
    }
  }
}
