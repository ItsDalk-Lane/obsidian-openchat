import type { AgentMessage } from "./types";
import { normalizePiMessage } from "./adapters/pi/pi-message-adapter";

/**
 * Normalize the public shape of a persisted / final message.
 *
 * Fork-specific: routes through `normalizePiMessage` (which owns the
 * tool-call field shape compatibility for the pi SDK).
 */
export function normalizeToolCalls(message: AgentMessage): AgentMessage {
  return normalizePiMessage(message);
}

/**
 * Normalize the shape of a still-streaming assistant message.
 *
 * Upstream parity: includes a client-only `rawInput` buffer on tool-call
 * blocks so the UI can render tool calls while their arguments are still
 * streaming. The buffer is dropped by `normalizeToolCalls` once the message
 * is persisted because partial JSON is not meaningful across reloads.
 *
 * The fork's pi adapter already enforces the canonical field shape; we
 * layer `rawInput` on top for tool-call blocks when present on the input
 * so the streaming reducer in `lib/streaming-message.ts` can display the
 * "Generating parameters..." state.
 */
export function normalizeStreamingToolCalls(message: AgentMessage): AgentMessage {
  const normalized = normalizePiMessage(message);
  if (normalized.role !== "assistant") return normalized;
  const content = (normalized as unknown as { content?: unknown }).content;
  if (!Array.isArray(content)) return normalized;
  let mutated = false;
  const next = content.map((block) => {
    if (
      block && typeof block === "object"
      && (block as { type?: unknown }).type === "toolCall"
    ) {
      const rawInput = (block as { rawInput?: unknown }).rawInput;
      if (typeof rawInput === "string") return block;
      mutated = true;
      return { ...(block as Record<string, unknown>), rawInput: "" };
    }
    return block;
  });
  if (!mutated) return normalized;
  return { ...(normalized as unknown as Record<string, unknown>), content: next } as AgentMessage;
}
