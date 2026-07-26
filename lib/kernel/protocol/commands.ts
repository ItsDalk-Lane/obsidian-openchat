import type { ExtensionUiResponse } from "./interactions";

export type RuntimeCommand =
  | PromptCommand
  | AbortCommand
  | GetStateCommand
  | SetModelCommand
  | ForkCommand
  | NavigateTreeCommand
  | SetThinkingLevelCommand
  | CompactCommand
  | SetSessionNameCommand
  | GetSessionStatsCommand
  | GetLastAssistantTextCommand
  | SetAutoCompactionCommand
  | ClearQueueCommand
  | SteerCommand
  | FollowUpCommand
  | GetToolsCommand
  | GetCommandsCommand
  | SetToolsCommand
  | ReloadCommand
  | AbortCompactionCommand
  | ExtensionUiResponseCommand
  | ExtensionUiInputCommand
  | SetAutoRetryCommand
  | BashCommand
  | AbortBashCommand;

export type BootstrapCommand = EnsureSessionCommand;
export type NewSessionCommand = RuntimeCommand | BootstrapCommand;

export interface AgentImageInput {
  type: "image";
  data: string;
  mimeType: string;
}

export interface PromptCommand {
  type: "prompt";
  message: string;
  images?: AgentImageInput[];
  streamingBehavior?: "steer" | "followUp";
}
export interface AbortCommand { type: "abort" }
export interface GetStateCommand { type: "get_state" }
export interface SetModelCommand { type: "set_model"; provider: string; modelId: string }
export interface ForkCommand { type: "fork"; entryId: string }
export interface NavigateTreeCommand { type: "navigate_tree"; targetId: string }
export interface SetThinkingLevelCommand { type: "set_thinking_level"; level: string }
export interface CompactCommand { type: "compact"; customInstructions?: string }
export interface SetSessionNameCommand { type: "set_session_name"; name: string }
export interface GetSessionStatsCommand { type: "get_session_stats" }
export interface GetLastAssistantTextCommand { type: "get_last_assistant_text" }
export interface SetAutoCompactionCommand { type: "set_auto_compaction"; enabled: boolean }
export interface ClearQueueCommand { type: "clear_queue" }
export interface SteerCommand { type: "steer"; message: string; images?: AgentImageInput[] }
export interface FollowUpCommand { type: "follow_up"; message: string; images?: AgentImageInput[] }
export interface GetToolsCommand { type: "get_tools" }
export interface GetCommandsCommand { type: "get_commands" }
export interface SetToolsCommand { type: "set_tools"; toolNames: string[] }
export interface ReloadCommand { type: "reload" }
export interface AbortCompactionCommand { type: "abort_compaction" }
export type ExtensionUiResponseCommand = ExtensionUiResponse;
export interface ExtensionUiInputCommand { type: "extension_ui_input"; id: string; data: string }
export interface SetAutoRetryCommand { type: "set_auto_retry"; enabled: boolean }
export interface BashCommand { type: "bash"; command: string; excludeFromContext?: boolean }
export interface AbortBashCommand { type: "abort_bash" }
export interface EnsureSessionCommand { type: "ensure_session" }

export type RuntimeCommandResultMap = {
  prompt: null;
  abort: null;
  get_state: {
    isStreaming?: boolean;
    isPromptRunning?: boolean;
    isBashRunning?: boolean;
    isCompacting?: boolean;
    thinkingLevel?: string;
    contextUsage?: { percent: number | null; contextWindow: number; tokens: number | null } | null;
    extensionStatuses?: Array<{ key: string; text: string }>;
    extensionWidgets?: Array<{ key: string; lines: string[]; placement: "aboveEditor" | "belowEditor" }>;
    queuedMessages?: { steering?: string[]; followUp?: string[] } | null;
  };
  set_model: { id: string; provider: string };
  fork: { cancelled: boolean; newSessionId?: string };
  navigate_tree: { cancelled: boolean };
  set_thinking_level: null;
  compact: { tokensBefore?: number; estimatedTokensAfter?: number } | null;
  set_session_name: null;
  get_session_stats: Record<string, unknown>;
  get_last_assistant_text: { text: string };
  set_auto_compaction: null;
  clear_queue: { steering?: string[]; followUp?: string[] } | null;
  steer: null;
  follow_up: null;
  get_tools: string[];
  get_commands: { commands: Array<Record<string, unknown>> };
  set_tools: null;
  reload: { success: true };
  abort_compaction: null;
  extension_ui_response: null;
  extension_ui_input: null;
  set_auto_retry: null;
  bash: Record<string, unknown> | null;
  abort_bash: null;
};

export type RuntimeCommandResult<C extends RuntimeCommand> = RuntimeCommandResultMap[C["type"]];

type ParseSuccess<T> = { ok: true; value: T };
type ParseFailure = { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function asImageArray(value: unknown): AgentImageInput[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return undefined;
  const parsed: AgentImageInput[] = [];
  for (const item of value) {
    if (!isRecord(item)) return undefined;
    if (item.type !== "image" || !isString(item.data) || !isString(item.mimeType)) return undefined;
    parsed.push({ type: "image", data: item.data, mimeType: item.mimeType });
  }
  return parsed;
}

function fail(error: string): ParseFailure {
  return { ok: false, error };
}

export function parseRuntimeCommand(input: unknown): ParseSuccess<RuntimeCommand> | ParseFailure {
  if (!isRecord(input) || !isString(input.type)) return fail("Invalid command payload");
  const type = input.type;
  switch (type) {
    case "prompt":
      if (!isString(input.message)) return fail("prompt.message is required");
      return { ok: true, value: { type, message: input.message, images: asImageArray(input.images), streamingBehavior: input.streamingBehavior === "steer" || input.streamingBehavior === "followUp" ? input.streamingBehavior : undefined } };
    case "abort":
    case "get_state":
    case "get_session_stats":
    case "get_last_assistant_text":
    case "clear_queue":
    case "get_tools":
    case "get_commands":
    case "reload":
    case "abort_compaction":
    case "abort_bash":
      return { ok: true, value: { type } };
    case "set_model":
      if (!isString(input.provider) || !isString(input.modelId)) return fail("set_model.provider and set_model.modelId are required");
      return { ok: true, value: { type, provider: input.provider, modelId: input.modelId } };
    case "fork":
      if (!isString(input.entryId)) return fail("fork.entryId is required");
      return { ok: true, value: { type, entryId: input.entryId } };
    case "navigate_tree":
      if (!isString(input.targetId)) return fail("navigate_tree.targetId is required");
      return { ok: true, value: { type, targetId: input.targetId } };
    case "set_thinking_level":
      if (!isString(input.level)) return fail("set_thinking_level.level is required");
      return { ok: true, value: { type, level: input.level } };
    case "compact":
      if (input.customInstructions !== undefined && !isString(input.customInstructions)) return fail("compact.customInstructions must be a string");
      return { ok: true, value: { type, customInstructions: input.customInstructions } };
    case "set_session_name":
      if (!isString(input.name)) return fail("set_session_name.name is required");
      return { ok: true, value: { type, name: input.name } };
    case "set_auto_compaction":
      if (!isBoolean(input.enabled)) return fail("set_auto_compaction.enabled is required");
      return { ok: true, value: { type, enabled: input.enabled } };
    case "steer":
    case "follow_up":
      if (!isString(input.message)) return fail(`${type}.message is required`);
      return { ok: true, value: { type, message: input.message, images: asImageArray(input.images) } };
    case "set_tools":
      if (!Array.isArray(input.toolNames) || input.toolNames.some((item) => !isString(item))) return fail("set_tools.toolNames must be a string array");
      return { ok: true, value: { type, toolNames: [...input.toolNames] } };
    case "extension_ui_response":
      if (!isString(input.id)) return fail("extension_ui_response.id is required");
      if (isString(input.value)) return { ok: true, value: { type, id: input.id, value: input.value } };
      if (isBoolean(input.confirmed)) return { ok: true, value: { type, id: input.id, confirmed: input.confirmed } };
      if (input.cancelled === true) return { ok: true, value: { type, id: input.id, cancelled: true } };
      return fail("extension_ui_response requires value, confirmed, or cancelled");
    case "extension_ui_input":
      if (!isString(input.id) || !isString(input.data)) return fail("extension_ui_input.id and extension_ui_input.data are required");
      return { ok: true, value: { type, id: input.id, data: input.data } };
    case "set_auto_retry":
      if (!isBoolean(input.enabled)) return fail("set_auto_retry.enabled is required");
      return { ok: true, value: { type, enabled: input.enabled } };
    case "bash":
      if (!isString(input.command)) return fail("bash.command is required");
      if (input.excludeFromContext !== undefined && !isBoolean(input.excludeFromContext)) return fail("bash.excludeFromContext must be boolean");
      return { ok: true, value: { type, command: input.command, excludeFromContext: input.excludeFromContext } };
    default:
      return fail(`Unsupported command: ${type}`);
  }
}

export function parseNewSessionCommand(input: unknown): ParseSuccess<NewSessionCommand> | ParseFailure {
  if (isRecord(input) && input.type === "ensure_session") {
    return { ok: true, value: { type: "ensure_session" } };
  }
  return parseRuntimeCommand(input);
}
