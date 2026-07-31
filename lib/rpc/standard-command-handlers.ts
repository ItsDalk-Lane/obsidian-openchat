import type { SlashCommandInfo } from "@earendil-works/pi-coding-agent";
import { invalidateModelsCache } from "../models-cache";
import { invalidateSessionListCache } from "../session-reader";
import type { McpControlAction, McpControlResult, McpStatusSnapshot } from "../mcp-extension";
import type { AgentSessionLike } from "../pi-types";
import type { RuntimeCommand } from "../kernel";
import { parseAgentImages, type PiRuntimeAdapter } from "../adapters/pi";
import type { ExtensionUiBridge } from "./extension-ui-bridge";

export const STANDARD_COMMAND_NOT_HANDLED = Symbol("standard-command-not-handled");

type StandardCommandContext = {
  inner: AgentSessionLike;
  runtime: Pick<PiRuntimeAdapter, "getState" | "setThinkingLevel" | "getTools" | "setTools">;
  extensionUi: ExtensionUiBridge;
  isPromptRunning: () => boolean;
  getMcpStatus: () => McpStatusSnapshot | null;
  isMcpControlReady: () => boolean;
  sendMcpControl: (request: { action: McpControlAction; server?: string }) => Promise<McpControlResult>;
  waitForExtensionsBound: () => Promise<void>;
  setForceEmptySystemPrompt: (force: boolean) => void;
  applyForcedEmptySystemPrompt: () => void;
  syncProjectTrust: () => void;
};

type StandardCommandHandler = (
  command: RuntimeCommand,
  context: StandardCommandContext,
) => unknown | Promise<unknown>;

function expectCommand<T extends RuntimeCommand["type"]>(
  command: RuntimeCommand,
  type: T,
): Extract<RuntimeCommand, { type: T }> {
  if (command.type !== type) {
    throw new Error(`Command handler mismatch: expected ${type}, received ${command.type}`);
  }
  return command as Extract<RuntimeCommand, { type: T }>;
}

const STANDARD_COMMAND_HANDLERS: Partial<Record<RuntimeCommand["type"], StandardCommandHandler>> = {
  get_state: (_command, context) => {
    const state = context.runtime.getState(context.isPromptRunning());
    return {
      ...state,
      messageCount: 0,
      extensionStatuses: context.extensionUi.getStatuses(),
      extensionWidgets: context.extensionUi.getWidgets(),
      mcpStatus: context.getMcpStatus(),
    };
  },

  set_model: async (command, context) => {
    const { provider, modelId } = expectCommand(command, "set_model");
    let model = context.inner.modelRuntime.getModel(provider, modelId);
    if (!model) {
      await context.inner.modelRuntime.refresh?.({ allowNetwork: false });
      model = context.inner.modelRuntime.getModel(provider, modelId);
    }
    if (!model) throw new Error(`Model not found: ${provider}/${modelId}`);
    await context.inner.setModel(model);
    invalidateModelsCache();
    invalidateSessionListCache();
    return { id: model.id, provider: model.provider };
  },

  set_thinking_level: (command, context) => {
    context.runtime.setThinkingLevel(expectCommand(command, "set_thinking_level").level);
    invalidateSessionListCache();
    return null;
  },

  set_session_name: (command, context) => {
    const name = expectCommand(command, "set_session_name").name?.trim();
    if (!name) throw new Error("Session name cannot be empty");
    context.inner.setSessionName(name);
    invalidateSessionListCache();
    return null;
  },

  get_session_stats: (_command, context) => ({
    ...context.inner.getSessionStats(),
    sessionName: context.inner.sessionManager.getSessionName(),
  }),

  get_last_assistant_text: (_command, context) => ({
    text: context.inner.getLastAssistantText() ?? "",
  }),

  set_auto_compaction: (command, context) => {
    context.inner.setAutoCompactionEnabled(expectCommand(command, "set_auto_compaction").enabled);
    return null;
  },

  clear_queue: (_command, context) => context.inner.clearQueue(),

  steer: async (command, context) => {
    const { message, images } = expectCommand(command, "steer");
    await context.inner.steer(message, parseAgentImages(images, "steer"));
    return null;
  },

  follow_up: async (command, context) => {
    const { message, images } = expectCommand(command, "follow_up");
    await context.inner.followUp(message, parseAgentImages(images, "follow_up"));
    return null;
  },

  get_tools: (_command, context) => context.runtime.getTools(),

  get_commands: (_command, context) => {
    const commands: SlashCommandInfo[] = [];
    for (const registered of context.inner.extensionRunner.getRegisteredCommands()) {
      commands.push({
        name: registered.invocationName,
        description: registered.description,
        source: "extension",
        sourceInfo: registered.sourceInfo,
      });
    }
    for (const template of context.inner.promptTemplates) {
      commands.push({
        name: template.name,
        description: template.description,
        source: "prompt",
        sourceInfo: template.sourceInfo,
      });
    }
    for (const skill of context.inner.resourceLoader.getSkills().skills) {
      commands.push({
        name: `skill:${skill.name}`,
        description: skill.description,
        source: "skill",
        sourceInfo: skill.sourceInfo,
      });
    }
    return { commands };
  },

  set_tools: (command, context) => {
    const toolNames = expectCommand(command, "set_tools").toolNames;
    context.setForceEmptySystemPrompt(toolNames.length === 0);
    context.runtime.setTools(toolNames);
    context.applyForcedEmptySystemPrompt();
    return null;
  },

  reload: async (_command, context) => {
    await context.waitForExtensionsBound();
    context.syncProjectTrust();
    context.extensionUi.clearDecorations();
    await context.inner.reload();
    if (typeof context.inner.bindExtensions !== "function") {
      context.inner.extensionRunner.setUIContext?.(context.extensionUi.createContext(), "rpc");
    }
    context.applyForcedEmptySystemPrompt();
    return { success: true };
  },

  extension_ui_response: (command, context) => {
    context.extensionUi.resolveResponse(expectCommand(command, "extension_ui_response"));
    return null;
  },

  extension_ui_input: (command, context) => {
    const { id, data } = expectCommand(command, "extension_ui_input");
    context.extensionUi.handleInput(id, data);
    return null;
  },

  set_auto_retry: (command, context) => {
    context.inner.setAutoRetryEnabled(expectCommand(command, "set_auto_retry").enabled);
    return null;
  },

  mcp_action: async (command, context) => {
    const { action, server } = expectCommand(command, "mcp_action");
    // The adapter's control listener is installed during extension load, which
    // finishes before session binding; waiting here covers commands racing the
    // initial bind.
    await context.waitForExtensionsBound();
    if (!context.isMcpControlReady()) {
      return { ok: false, message: "MCP 控制通道不可用", started: false };
    }
    const result = await context.sendMcpControl({ action, ...(server ? { server } : {}) });
    return { ok: result.ok, ...(result.message ? { message: result.message } : {}), ...(result.started ? { started: result.started } : {}) };
  },
};

export async function dispatchStandardCommand(
  command: RuntimeCommand,
  context: StandardCommandContext,
): Promise<unknown | typeof STANDARD_COMMAND_NOT_HANDLED> {
  const handler = STANDARD_COMMAND_HANDLERS[command.type];
  if (!handler) return STANDARD_COMMAND_NOT_HANDLED;
  return handler(command, context);
}
