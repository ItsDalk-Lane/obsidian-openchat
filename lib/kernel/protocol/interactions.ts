export interface TextContent {
  type: "text";
  text: string;
}

export interface ImageContent {
  type: "image";
  source: {
    type: "base64" | "url";
    media_type?: string;
    data?: string;
    url?: string;
  };
}

export interface ThinkingContent {
  type: "thinking";
  thinking: string;
  deferred?: boolean;
}

export interface ToolCallContent {
  type: "toolCall";
  toolCallId: string;
  toolName: string;
  input: Record<string, unknown>;
  /**
   * Client-only buffer for streamed tool input (raw JSON / partial args).
   * Never persisted to session files; `normalizeStreamingToolCalls` injects it
   * while the tool-call block is still streaming, and `normalizeToolCalls`
   * drops it on the final persisted message.
   */
  rawInput?: string;
}

export type AssistantContentBlock = TextContent | ImageContent | ThinkingContent | ToolCallContent;

export interface UserMessage {
  role: "user";
  content: string | (TextContent | ImageContent)[];
  timestamp?: number;
}

export interface AssistantMessage {
  role: "assistant";
  content: AssistantContentBlock[];
  model: string;
  provider: string;
  stopReason?: string;
  errorMessage?: string;
  timestamp?: number;
  usage?: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    cost: {
      input: number;
      output: number;
      cacheRead: number;
      cacheWrite: number;
      total: number;
    };
  };
}

export interface ToolResultMessage {
  role: "toolResult";
  toolCallId: string;
  toolName?: string;
  content: (TextContent | ImageContent)[];
  isError?: boolean;
  details?: unknown;
  timestamp?: number;
}

export interface CustomMessage {
  role: "custom";
  customType: string;
  content: string | (TextContent | ImageContent)[];
  display: boolean;
  details?: unknown;
  timestamp?: number;
}

export interface BashExecutionMessage {
  role: "bashExecution";
  command: string;
  output: string;
  exitCode?: number;
  cancelled?: boolean;
  truncated?: boolean;
  fullOutputPath?: string;
  excludeFromContext?: boolean;
  timestamp?: number;
}

export type AgentMessage =
  | UserMessage
  | AssistantMessage
  | ToolResultMessage
  | CustomMessage
  | BashExecutionMessage;

export type ExtensionUiRequest =
  | {
      type: "extension_ui_request";
      id: string;
      method: "select";
      title: string;
      options: string[];
      timeout?: number;
      expiresAt?: number;
    }
  | {
      type: "extension_ui_request";
      id: string;
      method: "confirm";
      title: string;
      message: string;
      timeout?: number;
      expiresAt?: number;
    }
  | {
      type: "extension_ui_request";
      id: string;
      method: "input";
      title: string;
      placeholder?: string;
      timeout?: number;
      expiresAt?: number;
    }
  | {
      type: "extension_ui_request";
      id: string;
      method: "editor";
      title: string;
      prefill?: string;
      timeout?: number;
      expiresAt?: number;
    }
  | {
      type: "extension_ui_request";
      id: string;
      method: "notify";
      message: string;
      notifyType?: "info" | "warning" | "error";
    }
  | {
      type: "extension_ui_request";
      id: string;
      method: "setStatus";
      statusKey: string;
      statusText?: string;
    }
  | {
      type: "extension_ui_request";
      id: string;
      method: "setWidget";
      widgetKey: string;
      widgetLines?: string[];
      widgetPlacement?: "aboveEditor" | "belowEditor";
    }
  | {
      type: "extension_ui_request";
      id: string;
      method: "setTitle";
      title: string;
    }
  | {
      type: "extension_ui_request";
      id: string;
      method: "set_editor_text";
      text: string;
    }
  | {
      type: "extension_ui_request";
      id: string;
      method: "custom";
      lines: string[];
      closed?: boolean;
    };

export type ExtensionUiResponse =
  | { type: "extension_ui_response"; id: string; value: string }
  | { type: "extension_ui_response"; id: string; confirmed: boolean }
  | { type: "extension_ui_response"; id: string; cancelled: true };
