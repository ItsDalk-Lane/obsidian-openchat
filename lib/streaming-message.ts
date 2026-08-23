import type { ClientAssistantMessageEvent } from "./agent-event-wire";
import {
  type JsonToolCallDeltaEvent,
  type JsonToolCallEndEvent,
  type JsonToolCallStartEvent,
} from "./agent-event-wire";
import { normalizeStreamingToolCalls } from "./normalize";
import type {
  AgentMessage,
  AssistantContentBlock,
  AssistantMessage,
} from "./types";

export type { ClientAssistantMessageEvent } from "./agent-event-wire";

export interface StreamingState {
  isStreaming: boolean;
  streamingMessage: AssistantMessage | null;
}

export type StreamAction =
  | { type: "start" }
  | { type: "snapshot"; message: AgentMessage }
  | { type: "delta"; event: ClientAssistantMessageEvent }
  | { type: "end" };

export const INITIAL_STREAMING_STATE: StreamingState = {
  isStreaming: false,
  streamingMessage: null,
};

function updateContentBlock(
  state: StreamingState,
  contentIndex: number,
  update: (current: AssistantContentBlock | undefined) => AssistantContentBlock | null,
): StreamingState {
  const message = state.streamingMessage;
  if (!message || !Number.isInteger(contentIndex) || contentIndex < 0) return state;

  const content = [...message.content];
  const nextBlock = update(content[contentIndex]);
  if (!nextBlock) return state;
  content[contentIndex] = nextBlock;
  return {
    isStreaming: true,
    streamingMessage: { ...message, content },
  };
}

function applyDelta(
  state: StreamingState,
  event: ClientAssistantMessageEvent,
): StreamingState {
  const contentIndex = (event as { contentIndex?: number }).contentIndex;
  switch (event.type) {
    case "text_start":
      return updateContentBlock(state, contentIndex ?? -1, (current) => (
        current?.type === "text" ? current : { type: "text", text: "" }
      ));
    case "text_delta":
      return updateContentBlock(state, contentIndex ?? -1, (current) => (
        current?.type === "text"
          ? { ...current, text: current.text + (event as { delta: string }).delta }
          : null
      ));
    case "text_end":
      return updateContentBlock(state, contentIndex ?? -1, (current) => ({
        ...(current?.type === "text" ? current : {}),
        type: "text",
        text: (event as { content: string }).content,
      }));
    case "thinking_start":
      return updateContentBlock(state, contentIndex ?? -1, (current) => (
        current?.type === "thinking" ? current : { type: "thinking", thinking: "" }
      ));
    case "thinking_delta":
      return updateContentBlock(state, contentIndex ?? -1, (current) => (
        current?.type === "thinking"
          ? { ...current, thinking: current.thinking + (event as { delta: string }).delta }
          : null
      ));
    case "thinking_end":
      return updateContentBlock(state, contentIndex ?? -1, (current) => ({
        ...(current?.type === "thinking" ? current : {}),
        type: "thinking",
        thinking: (event as { content: string }).content,
      }));
    case "toolcall_start":
      return updateContentBlock(state, contentIndex ?? -1, (current) => {
        const ev = event as JsonToolCallStartEvent;
        if (current?.type === "toolCall") {
          return {
            ...current,
            toolCallId: ev.id ?? current.toolCallId,
            toolName: ev.toolName ?? current.toolName,
            rawInput: current.rawInput ?? "",
          };
        }
        if (typeof ev.toolName !== "string") return null;
        return {
          type: "toolCall",
          toolCallId: ev.id ?? "",
          toolName: ev.toolName,
          input: {},
          rawInput: "",
        };
      });
    case "toolcall_delta":
      return updateContentBlock(state, contentIndex ?? -1, (current) => {
        const ev = event as JsonToolCallDeltaEvent;
        return current?.type === "toolCall"
          ? {
            ...current,
            toolCallId: ev.id || current.toolCallId,
            toolName: ev.toolName || current.toolName,
            rawInput: (current.rawInput ?? "") + ev.delta,
          }
          : null;
      });
    case "toolcall_end":
      return updateContentBlock(state, contentIndex ?? -1, () => {
        const ev = event as JsonToolCallEndEvent;
        return {
          type: "toolCall",
          toolCallId: ev.toolCall.id,
          toolName: ev.toolCall.name,
          input: ev.toolCall.arguments,
        };
      });
    default:
      return state;
  }
}

export function streamReducer(
  state: StreamingState,
  action: StreamAction,
): StreamingState {
  switch (action.type) {
    case "start":
      return { isStreaming: true, streamingMessage: null };
    case "snapshot": {
      const message = normalizeStreamingToolCalls(action.message);
      return message.role === "assistant"
        ? { isStreaming: true, streamingMessage: message }
        : state;
    }
    case "delta":
      return applyDelta(state, action.event);
    case "end":
      return INITIAL_STREAMING_STATE;
    default:
      return state;
  }
}
