export interface PiRuntimeEvent {
  type: string;
  [key: string]: unknown;
}

const COMPACTION_START_TYPES = new Set(["auto_compaction_start", "compaction_start"]);
const COMPACTION_END_TYPES = new Set(["auto_compaction_end", "compaction_end"]);

export function normalizePiEvent(event: PiRuntimeEvent): PiRuntimeEvent {
  if (COMPACTION_START_TYPES.has(event.type)) {
    return { ...event, type: "compaction_start" };
  }
  if (COMPACTION_END_TYPES.has(event.type)) {
    return { ...event, type: "compaction_end" };
  }
  return event;
}
