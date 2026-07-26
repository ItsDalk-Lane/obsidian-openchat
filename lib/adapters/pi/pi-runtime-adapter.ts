import type { AgentSessionLike, ToolInfo } from "../../pi-types";
import { applyThinkingLevelPatch } from "./compatibility/patches.ts";
import { withExtensionTools } from "./pi-extension-adapter.ts";

export interface PiRuntimeState {
  sessionId: string;
  sessionFile: string;
  isStreaming: boolean;
  isPromptRunning: boolean;
  isBashRunning: boolean;
  isCompacting: boolean;
  autoCompactionEnabled: boolean;
  autoRetryEnabled: boolean;
  model: { id: string; provider: string } | undefined;
  pendingMessageCount: number;
  queuedMessages: { steering: string[]; followUp: string[] };
  contextUsage: { percent: number | null; contextWindow: number; tokens: number | null } | null;
  systemPrompt: string;
  thinkingLevel: string;
}

export class PiRuntimeAdapter {
  private readonly session: AgentSessionLike;

  constructor(session: AgentSessionLike) {
    this.session = session;
  }

  getState(promptRunning: boolean): PiRuntimeState {
    const model = this.session.model;
    const contextUsage = this.session.getContextUsage();
    return {
      sessionId: this.session.sessionId,
      sessionFile: this.session.sessionFile ?? "",
      isStreaming: this.session.isStreaming,
      isPromptRunning: promptRunning,
      isBashRunning: this.session.isBashRunning,
      isCompacting: this.session.isCompacting,
      autoCompactionEnabled: this.session.autoCompactionEnabled,
      autoRetryEnabled: this.session.autoRetryEnabled,
      model: model ? { id: model.id, provider: model.provider } : undefined,
      pendingMessageCount: this.session.pendingMessageCount,
      queuedMessages: {
        steering: [...this.session.getSteeringMessages()],
        followUp: [...this.session.getFollowUpMessages()],
      },
      contextUsage: contextUsage
        ? { percent: contextUsage.percent, contextWindow: contextUsage.contextWindow, tokens: contextUsage.tokens }
        : null,
      systemPrompt: this.session.agent.state?.systemPrompt ?? "",
      thinkingLevel: this.session.agent.state?.thinkingLevel ?? "off",
    };
  }

  setThinkingLevel(level: string): void {
    this.session.setThinkingLevel(level);
    applyThinkingLevelPatch(this.session, level);
  }

  setTools(toolNames: string[]): void {
    this.session.setActiveToolsByName(withExtensionTools(this.session, toolNames));
  }

  getTools(): Array<ToolInfo & { active: boolean }> {
    const all: ToolInfo[] = this.session.getAllTools();
    const active = new Set<string>(this.session.getActiveToolNames());
    return all.map((tool) => ({
      name: tool.name,
      description: tool.description,
      active: active.has(tool.name),
    }));
  }
}
