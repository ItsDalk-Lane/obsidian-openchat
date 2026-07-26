import type { AgentSessionLike } from "../../../pi-types";
import { probePiCapabilities } from "./capability-probe.ts";

export function applyEmptySystemPromptPatch(session: AgentSessionLike, enabled: boolean): void {
  if (!enabled) return;
  const capabilities = probePiCapabilities(session);
  if (capabilities.supportsMutableSystemPromptState && session.agent.state) {
    session.agent.state.systemPrompt = "";
  }
}

export function applySessionManagerFlushedPatch(session: AgentSessionLike): boolean {
  const capabilities = probePiCapabilities(session);
  if (!capabilities.supportsSessionManagerFlushedPatch) return false;
  (session.sessionManager as unknown as { flushed: boolean }).flushed = true;
  return true;
}

export function applyThinkingLevelPatch(session: AgentSessionLike, requestedLevel: string): void {
  if (requestedLevel !== "xhigh") return;
  const capabilities = probePiCapabilities(session);
  if (capabilities.supportsDeepseekThinkingCompat && session.agent.state) {
    session.agent.state.thinkingLevel = "xhigh";
  }
}
