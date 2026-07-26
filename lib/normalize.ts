import type { AgentMessage } from "./types";
import { normalizePiMessage } from "./adapters/pi/pi-message-adapter";

export function normalizeToolCalls(message: AgentMessage): AgentMessage {
  return normalizePiMessage(message);
}
