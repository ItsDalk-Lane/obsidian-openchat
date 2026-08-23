"use client";

import { type RefObject, useCallback, useRef, useState } from "react";
import { sendAgentCommand } from "@/lib/agent-client";
import { requestJson } from "@/lib/api-client";
import {
  getPresetFromTools,
  getToolNamesForPreset,
  type ToolEntry,
  type ToolPreset,
} from "@/lib/tool-presets";

export type ThinkingLevelOption =
  | "auto"
  | "off"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";

export type SelectedModel = { provider: string; modelId: string };
export type ModelEntry = { id: string; name: string; provider: string };

export interface ModelsResponse {
  models: Record<string, string>;
  modelList?: ModelEntry[];
  defaultModel?: SelectedModel | null;
  thinkingLevels?: Record<string, string[]>;
  thinkingLevelMaps?: Record<string, Record<string, string | null>>;
  modelError?: string;
}

export function pickNewSessionDefaultModel(
  response: ModelsResponse,
): SelectedModel | null {
  const modelList = response.modelList ?? [];
  const match = response.defaultModel
    ? modelList.find((model) => (
        model.id === response.defaultModel?.modelId
        && model.provider === response.defaultModel?.provider
      ))
    : undefined;
  const displayModel = match ?? modelList[0];
  return displayModel
    ? { provider: displayModel.provider, modelId: displayModel.id }
    : null;
}

export function resolveDisplayModel(options: {
  isNew: boolean;
  newSessionModel: SelectedModel | null;
  newSessionDefaultModel: SelectedModel | null;
  currentModelOverride: SelectedModel | null;
  currentSessionModel: SelectedModel | null;
  pendingModel: SelectedModel | null;
}): {
  currentModel: SelectedModel | null;
  displayModel: SelectedModel | null;
} {
  const currentModel = options.currentModelOverride
    ?? options.currentSessionModel
    ?? options.pendingModel
    ?? null;
  return {
    currentModel,
    displayModel: options.isNew
      ? options.newSessionModel ?? options.newSessionDefaultModel
      : currentModel,
  };
}

interface UseAgentConfigurationOptions {
  isNew: boolean;
  modelCwd: string;
  currentSessionModel: SelectedModel | null;
  sessionIdRef: RefObject<string | null>;
  ensuringNewSessionRef: RefObject<Promise<string | null> | null>;
  setToolPreset?: (preset: ToolPreset) => void;
}

export function useAgentConfiguration({
  isNew,
  modelCwd,
  currentSessionModel,
  sessionIdRef,
  ensuringNewSessionRef,
  setToolPreset: setExternalToolPreset,
}: UseAgentConfigurationOptions) {
  const [modelNames, setModelNames] = useState<Record<string, string>>({});
  const [modelList, setModelList] = useState<ModelEntry[]>([]);
  const [modelError, setModelError] = useState<string | null>(null);
  const [modelThinkingLevels, setModelThinkingLevels] = useState<Record<string, string[]>>({});
  const [modelThinkingLevelMaps, setModelThinkingLevelMaps] = useState<
    Record<string, Record<string, string | null>>
  >({});
  const [newSessionModel, setNewSessionModel] = useState<SelectedModel | null>(null);
  const [newSessionDefaultModel, setNewSessionDefaultModel] = useState<SelectedModel | null>(null);
  const [toolPreset, setToolPreset] = useState<ToolPreset>("default");
  const [thinkingLevel, setThinkingLevel] = useState<ThinkingLevelOption>("auto");
  const [currentModelOverride, setCurrentModelOverride] = useState<SelectedModel | null>(null);
  const [pendingModel, setPendingModel] = useState<SelectedModel | null>(null);
  const [modelSwitching, setModelSwitching] = useState(false);
  const modelSwitchPendingRef = useRef(false);

  const setToolPresetState = setExternalToolPreset ?? setToolPreset;
  const { currentModel, displayModel } = resolveDisplayModel({
    isNew,
    newSessionModel,
    newSessionDefaultModel,
    currentModelOverride,
    currentSessionModel,
    pendingModel,
  });

  const loadTools = useCallback(async (sid: string) => {
    try {
      const tools = await sendAgentCommand(
        sid,
        { type: "get_tools" },
      ) as unknown as ToolEntry[];
      if (tools) setToolPresetState(getPresetFromTools(tools));
    } catch (error) {
      console.error("Failed to load tools:", error);
    }
  }, [setToolPresetState]);

  const loadModels = useCallback(async (signal?: AbortSignal) => {
    const modelsUrl = modelCwd
      ? `/api/models?cwd=${encodeURIComponent(modelCwd)}`
      : "/api/models";
    const response = await requestJson<ModelsResponse>(
      modelsUrl,
      signal ? { signal } : undefined,
    );
    setModelNames(response.models);
    setModelError(response.modelError ?? null);
    setModelThinkingLevels(response.thinkingLevels ?? {});
    setModelThinkingLevelMaps(response.thinkingLevelMaps ?? {});
    setModelList(response.modelList ?? []);
    if (isNew) {
      setNewSessionDefaultModel(pickNewSessionDefaultModel(response));
    }
  }, [isNew, modelCwd]);

  const handleModelChange = useCallback(async (provider: string, modelId: string) => {
    if (modelSwitchPendingRef.current) return;
    if (isNew) {
      const selectedModel = { provider, modelId };
      setNewSessionModel(selectedModel);
      setPendingModel(selectedModel);
      const sid = sessionIdRef.current ?? await ensuringNewSessionRef.current;
      if (!sid) return;
      modelSwitchPendingRef.current = true;
      setModelSwitching(true);
      try {
        await sendAgentCommand(sid, { type: "set_model", provider, modelId });
      } catch (error) {
        console.error("Failed to set model:", error);
      } finally {
        modelSwitchPendingRef.current = false;
        setModelSwitching(false);
      }
      return;
    }
    const sid = sessionIdRef.current;
    if (!sid) return;
    const target = { provider, modelId };
    const previousOverride = currentModelOverride;
    modelSwitchPendingRef.current = true;
    setModelSwitching(true);
    // Optimistic override so the selector reflects the new model immediately;
    // reverted on failure.
    setCurrentModelOverride(target);
    try {
      await sendAgentCommand(sid, { type: "set_model", provider, modelId });
    } catch (error) {
      console.error("Failed to set model:", error);
      setCurrentModelOverride(previousOverride);
    } finally {
      modelSwitchPendingRef.current = false;
      setModelSwitching(false);
    }
  }, [currentModelOverride, ensuringNewSessionRef, isNew, sessionIdRef]);

  const handleThinkingLevelChange = useCallback(async (level: ThinkingLevelOption) => {
    setThinkingLevel(level);
    if (level === "auto") return;
    const sid = sessionIdRef.current ?? await ensuringNewSessionRef.current;
    if (!sid) return;
    try {
      await sendAgentCommand(sid, { type: "set_thinking_level", level });
    } catch (error) {
      console.error("Failed to set thinking level:", error);
    }
  }, [ensuringNewSessionRef, sessionIdRef]);

  const handleToolPresetChange = useCallback(async (preset: ToolPreset) => {
    const toolNames = getToolNamesForPreset(preset);
    setToolPresetState(preset);
    const sid = sessionIdRef.current ?? await ensuringNewSessionRef.current;
    if (!sid) return;
    try {
      await sendAgentCommand(sid, { type: "set_tools", toolNames });
    } catch (error) {
      console.error("Failed to set tools:", error);
    }
  }, [ensuringNewSessionRef, sessionIdRef, setToolPresetState]);

  const syncThinkingLevel = useCallback((level?: string | null) => {
    if (level !== undefined) {
      setThinkingLevel((level as ThinkingLevelOption | null) ?? "auto");
    }
  }, []);

  const resetCurrentModelOverride = useCallback(() => {
    // A session reload racing an in-flight model switch must not resurrect the
    // stale model in the selector.
    if (modelSwitchPendingRef.current) return;
    setCurrentModelOverride(null);
  }, []);

  const rememberPendingModel = useCallback((model: SelectedModel | null) => {
    setPendingModel(model);
  }, []);

  return {
    modelNames,
    modelList,
    modelError,
    modelThinkingLevels,
    modelThinkingLevelMaps,
    newSessionModel,
    newSessionDefaultModel,
    toolPreset,
    thinkingLevel,
    currentModel,
    displayModel,
    loadTools,
    loadModels,
    handleModelChange,
    modelSwitching,
    handleThinkingLevelChange,
    handleToolPresetChange,
    syncThinkingLevel,
    resetCurrentModelOverride,
    rememberPendingModel,
  };
}
