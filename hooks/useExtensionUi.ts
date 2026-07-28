"use client";

import { useCallback, useReducer, type RefObject } from "react";
import { sendAgentCommand } from "@/lib/agent-client";
import type {
  ExtensionStatusItem,
  ExtensionUiRequest,
  ExtensionWidgetItem,
} from "@/lib/types";
import type { NoticeType } from "./useNoticeQueue";

export type ExtensionUiDialogRequest = Extract<
  ExtensionUiRequest,
  { method: "select" | "confirm" | "input" | "editor" }
>;
export type ExtensionUiCustomRequest = Extract<ExtensionUiRequest, { method: "custom" }>;

export interface ExtensionUiState {
  dialog: ExtensionUiDialogRequest | null;
  customUi: ExtensionUiCustomRequest | null;
  statuses: ExtensionStatusItem[];
  widgets: ExtensionWidgetItem[];
}

export type ExtensionUiAction =
  | {
      type: "sync_snapshot";
      statuses?: ExtensionStatusItem[];
      widgets?: ExtensionWidgetItem[];
    }
  | { type: "show_dialog"; request: ExtensionUiDialogRequest }
  | { type: "dismiss_dialog"; id: string }
  | { type: "set_status"; key: string; text?: string }
  | {
      type: "set_widget";
      key: string;
      lines?: string[];
      placement?: "aboveEditor" | "belowEditor";
    }
  | { type: "set_custom"; request: ExtensionUiCustomRequest };

export const initialExtensionUiState: ExtensionUiState = {
  dialog: null,
  customUi: null,
  statuses: [],
  widgets: [],
};

export function extensionUiReducer(
  state: ExtensionUiState,
  action: ExtensionUiAction,
): ExtensionUiState {
  switch (action.type) {
    case "sync_snapshot":
      return {
        ...state,
        ...(action.statuses !== undefined ? { statuses: action.statuses } : {}),
        ...(action.widgets !== undefined ? { widgets: action.widgets } : {}),
      };
    case "show_dialog":
      return { ...state, dialog: action.request };
    case "dismiss_dialog":
      return {
        ...state,
        dialog: state.dialog?.id === action.id ? null : state.dialog,
      };
    case "set_status": {
      const rest = state.statuses.filter((item) => item.key !== action.key);
      return {
        ...state,
        statuses: action.text ? [...rest, { key: action.key, text: action.text }] : rest,
      };
    }
    case "set_widget": {
      const rest = state.widgets.filter((item) => item.key !== action.key);
      return {
        ...state,
        widgets: action.lines
          ? [...rest, {
              key: action.key,
              lines: action.lines,
              placement: action.placement ?? "aboveEditor",
            }]
          : rest,
      };
    }
    case "set_custom":
      return {
        ...state,
        customUi: action.request.closed
          ? state.customUi?.id === action.request.id ? null : state.customUi
          : action.request,
      };
    default:
      return state;
  }
}

interface ExtensionInputHandle {
  insertText: (text: string) => void;
}

interface UseExtensionUiOptions {
  sessionIdRef: RefObject<string | null>;
  chatInputRef?: RefObject<ExtensionInputHandle | null>;
  addNotice: (notice: {
    id?: string;
    message: string;
    type?: NoticeType;
  }) => void;
}

export function useExtensionUi({
  sessionIdRef,
  chatInputRef,
  addNotice,
}: UseExtensionUiOptions) {
  const [state, dispatch] = useReducer(extensionUiReducer, initialExtensionUiState);

  const syncExtensionUiSnapshot = useCallback((snapshot: {
    statuses?: ExtensionStatusItem[];
    widgets?: ExtensionWidgetItem[];
  }) => {
    dispatch({ type: "sync_snapshot", ...snapshot });
  }, []);

  const respondToExtensionUi = useCallback(async (
    request: ExtensionUiDialogRequest,
    response: { value: string } | { confirmed: boolean } | { cancelled: true },
  ) => {
    const sid = sessionIdRef.current;
    dispatch({ type: "dismiss_dialog", id: request.id });
    if (!sid) return;
    try {
      await sendAgentCommand(sid, {
        type: "extension_ui_response",
        id: request.id,
        ...response,
      });
    } catch (error) {
      console.error("Failed to send extension UI response:", error);
    }
  }, [sessionIdRef]);

  const sendExtensionCustomInput = useCallback(async (
    request: ExtensionUiCustomRequest,
    data: string,
  ) => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    try {
      await sendAgentCommand(sid, {
        type: "extension_ui_input",
        id: request.id,
        data,
      });
    } catch (error) {
      console.error("Failed to send extension custom UI input:", error);
    }
  }, [sessionIdRef]);

  const handleExtensionUiRequest = useCallback((request: ExtensionUiRequest) => {
    switch (request.method) {
      case "select":
      case "confirm":
      case "input":
      case "editor":
        dispatch({ type: "show_dialog", request });
        break;
      case "notify":
        addNotice({
          id: request.id,
          message: request.message,
          type: request.notifyType ?? "info",
        });
        break;
      case "setStatus":
        dispatch({
          type: "set_status",
          key: request.statusKey,
          text: request.statusText,
        });
        break;
      case "setWidget":
        dispatch({
          type: "set_widget",
          key: request.widgetKey,
          lines: request.widgetLines,
          placement: request.widgetPlacement,
        });
        break;
      case "setTitle":
        if (request.title) document.title = request.title;
        break;
      case "set_editor_text":
        chatInputRef?.current?.insertText(request.text);
        break;
      case "custom":
        dispatch({ type: "set_custom", request });
        break;
    }
  }, [addNotice, chatInputRef]);

  return {
    extensionDialog: state.dialog,
    extensionCustomUi: state.customUi,
    extensionStatuses: state.statuses,
    extensionWidgets: state.widgets,
    syncExtensionUiSnapshot,
    handleExtensionUiRequest,
    respondToExtensionUi,
    sendExtensionCustomInput,
  };
}
