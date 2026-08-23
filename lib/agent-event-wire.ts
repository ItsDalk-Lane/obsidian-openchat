/**
 * Adapter that turns Pi runtime events into the wire shape the chat UI expects.
 *
 * The upstream type `JsonAgentSessionEvent` was added in Pi SDK 0.84. To keep
 * this fork compatible with Pi SDK 0.82 (the fork's current pin), we use a
 * structural fallback that mirrors the relevant variants. Once the fork
 * bumps Pi to 0.84 this module can switch to `Extract<JsonAgentSessionEvent, ...>`
 * for stricter typing.
 */

export interface AgentEventLike {
  type: string;
  [key: string]: unknown;
}

interface JsonToolCallStartEvent {
  type: "toolcall_start";
  contentIndex: number;
  partial?: { content?: Array<Record<string, unknown>> };
  id?: string;
  toolName?: string;
}

interface JsonToolCallDeltaEvent {
  type: "toolcall_delta";
  contentIndex: number;
  delta: string;
  partial?: { content?: Array<Record<string, unknown>> };
  id?: string;
  toolName?: string;
}

interface JsonToolCallEndEvent {
  type: "toolcall_end";
  contentIndex: number;
  toolCall: { id: string; name: string; arguments: Record<string, unknown> };
}

export type { JsonToolCallStartEvent, JsonToolCallDeltaEvent, JsonToolCallEndEvent };

interface JsonTextStartEvent {
  type: "text_start";
  contentIndex: number;
}

interface JsonTextDeltaEvent {
  type: "text_delta";
  contentIndex: number;
  delta: string;
}

interface JsonTextEndEvent {
  type: "text_end";
  contentIndex: number;
  content: string;
}

interface JsonThinkingStartEvent {
  type: "thinking_start";
  contentIndex: number;
}

interface JsonThinkingDeltaEvent {
  type: "thinking_delta";
  contentIndex: number;
  delta: string;
}

interface JsonThinkingEndEvent {
  type: "thinking_end";
  contentIndex: number;
  content: string;
}

type JsonAssistantMessageEvent =
  | JsonToolCallStartEvent
  | JsonToolCallDeltaEvent
  | JsonToolCallEndEvent
  | JsonTextStartEvent
  | JsonTextDeltaEvent
  | JsonTextEndEvent
  | JsonThinkingStartEvent
  | JsonThinkingDeltaEvent
  | JsonThinkingEndEvent
  | { type: string; contentIndex?: number; [key: string]: unknown };

interface JsonMessageUpdateEvent {
  type: "message_update";
  assistantMessageEvent: JsonAssistantMessageEvent;
  message?: unknown;
}

export type ClientAssistantMessageEvent =
  | Exclude<JsonAssistantMessageEvent, { type: "toolcall_start" | "toolcall_delta" }>
  | (JsonToolCallStartEvent & { id?: string; toolName?: string })
  | (JsonToolCallDeltaEvent & { id?: string; toolName?: string });

export type ClientMessageUpdateEvent = Omit<JsonMessageUpdateEvent, "assistantMessageEvent"> & {
  assistantMessageEvent: ClientAssistantMessageEvent;
};

const OMITTED_EVENT_TYPES = new Set([
  "turn_start",
  "turn_end",
]);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toolCallMetadata(
  event: Record<string, unknown>,
): { id: string; toolName: string } | null {
  if (
    (event.type !== "toolcall_start" && event.type !== "toolcall_delta")
    || !isObject(event.partial)
  ) return null;
  const content = event.partial.content;
  const contentIndex = event.contentIndex;
  if (!Array.isArray(content) || typeof contentIndex !== "number") return null;

  const block = content[contentIndex];
  if (!isObject(block) || block.type !== "toolCall") return null;
  const id = typeof block.id === "string"
    ? block.id
    : (typeof block.toolCallId === "string" ? block.toolCallId : null);
  const toolName = typeof block.name === "string"
    ? block.name
    : (typeof block.toolName === "string" ? block.toolName : null);
  return id !== null && toolName !== null ? { id, toolName } : null;
}

/**
 * Apply pi-web's event filters plus Pi 0.84's message_update projection.
 *
 * - `turn_start` / `turn_end` are dropped (chat completion is driven by
 *   `agent_start`/`agent_end`).
 * - `message_update` events have their `partial` removed and (for tool-call
 *   deltas) projected onto a flat `id` / `toolName` pair so React render code
 *   can recognize a tool-call start before the block has a populated
 *   `toolCallId` / `toolName`.
 * - `tool_execution_update` is forwarded so the UI can show in-progress tool
 *   output before the tool completes.
 * - `agent_end` is collapsed to a marker so the client knows the turn ended.
 */
export function toClientAgentEvent(
  event: AgentEventLike,
): AgentEventLike | ClientMessageUpdateEvent | null {
  if (OMITTED_EVENT_TYPES.has(event.type)) return null;

  if (event.type === "message_update") {
    const assistantMessageEvent = event.assistantMessageEvent;
    if (
      typeof assistantMessageEvent !== "object"
      || assistantMessageEvent === null
      || Array.isArray(assistantMessageEvent)
    ) return null;

    if (!("partial" in assistantMessageEvent)) {
      return {
        type: "message_update",
        assistantMessageEvent,
      } as ClientMessageUpdateEvent;
    }

    const metadata = toolCallMetadata(assistantMessageEvent as Record<string, unknown>);
    const { partial: _partial, ...deltaEvent } = assistantMessageEvent;
    void _partial;
    return {
      type: "message_update",
      assistantMessageEvent: metadata ? { ...deltaEvent, ...metadata } : deltaEvent,
    } as ClientMessageUpdateEvent;
  }

  if (event.type === "tool_execution_update") {
    return {
      type: "tool_execution_update",
      toolCallId: event.toolCallId,
      toolName: event.toolName,
      partialResult: event.partialResult,
    };
  }

  if (event.type === "agent_end") return { type: "agent_end" };
  return event;
}

export function isEventIncludedInSnapshot(
  event: AgentEventLike,
  snapshot: unknown,
): boolean {
  return snapshot !== undefined
    && (event.type === "message_start" || event.type === "message_update")
    && event.message === snapshot;
}
