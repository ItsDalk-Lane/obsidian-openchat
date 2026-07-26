import type { AgentSessionLike } from "../../../pi-types";

export interface PiCapabilities {
  supportsMutableSystemPromptState: boolean;
  supportsSessionManagerFlushedPatch: boolean;
  supportsDeepseekThinkingCompat: boolean;
}

function hasMutableSystemPromptState(session: AgentSessionLike): boolean {
  return typeof session.agent?.state === "object" && session.agent.state !== null;
}

function hasSessionManagerFlushedFlag(manager: unknown): manager is { flushed: boolean } {
  return typeof manager === "object" && manager !== null && "flushed" in manager;
}

function hasDeepseekThinkingCompat(session: AgentSessionLike): boolean {
  const model = session.model as { compat?: { thinkingFormat?: string } } | undefined;
  return model?.compat?.thinkingFormat === "deepseek";
}

export function probePiCapabilities(session: AgentSessionLike): PiCapabilities {
  return {
    supportsMutableSystemPromptState: hasMutableSystemPromptState(session),
    supportsSessionManagerFlushedPatch: hasSessionManagerFlushedFlag(session.sessionManager),
    supportsDeepseekThinkingCompat: hasDeepseekThinkingCompat(session),
  };
}
