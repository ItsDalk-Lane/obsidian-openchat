import type { KernelEvent, KernelEventDurability, RunId, StoredKernelEvent, TaskId } from "@/lib/kernel";

export interface EventQueryFilters {
  afterSequence?: number;
  limit?: number;
  runId?: RunId;
  type?: KernelEvent["type"];
}

export interface EventJournal {
  append(event: KernelEvent, durability: KernelEventDurability): StoredKernelEvent | null;
  appendMany(events: Array<{ event: KernelEvent; durability: KernelEventDurability }>): StoredKernelEvent[];
  getByTask(taskId: TaskId, filters?: EventQueryFilters): StoredKernelEvent[];
  getByRun(runId: RunId, filters?: Omit<EventQueryFilters, "runId">): StoredKernelEvent[];
  readAfter(sequence: number, limit?: number): StoredKernelEvent[];
  hasEvent(eventId: string): boolean;
  getLatestSequence(): number;
}
