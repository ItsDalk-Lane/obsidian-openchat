"use strict";

const fs = require("node:fs");

const DEFAULT_WINDOW_STATE = Object.freeze({
  x: 260,
  y: 90,
  width: 1400,
  height: 900,
  isMaximized: false,
});

const MIN_WINDOW_WIDTH = 900;
const MIN_WINDOW_HEIGHT = 600;
const MIN_VISIBLE_EDGE = 64;

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeWindowState(value) {
  if (!isRecord(value)) return null;

  const { x, y, width, height, isMaximized } = value;
  if (
    !Number.isFinite(x)
    || !Number.isFinite(y)
    || !Number.isFinite(width)
    || !Number.isFinite(height)
    || (isMaximized !== undefined && typeof isMaximized !== "boolean")
  ) {
    return null;
  }

  const normalized = {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
  };
  if (
    !Number.isSafeInteger(normalized.x)
    || !Number.isSafeInteger(normalized.y)
    || !Number.isSafeInteger(normalized.width)
    || !Number.isSafeInteger(normalized.height)
    || normalized.width <= 0
    || normalized.height <= 0
  ) {
    return null;
  }

  return {
    ...normalized,
    isMaximized: isMaximized === true,
  };
}

function safeFallback(fallback) {
  return normalizeWindowState(fallback) ?? { ...DEFAULT_WINDOW_STATE };
}

/**
 * 解析磁盘中的窗口状态。任何坏 JSON 或非法字段都会整体回退，避免半份状态污染窗口。
 */
function parseWindowState(serialized, fallback = DEFAULT_WINDOW_STATE) {
  const defaultState = safeFallback(fallback);
  if (typeof serialized !== "string" || serialized.trim() === "") {
    return defaultState;
  }

  try {
    return normalizeWindowState(JSON.parse(serialized)) ?? defaultState;
  } catch {
    return defaultState;
  }
}

function normalizeWorkArea(workArea) {
  if (!isRecord(workArea)) return null;
  const { x, y, width, height } = workArea;
  if (
    !Number.isFinite(x)
    || !Number.isFinite(y)
    || !Number.isFinite(width)
    || !Number.isFinite(height)
  ) {
    return null;
  }
  const normalized = {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
  };
  if (
    !Number.isSafeInteger(normalized.x)
    || !Number.isSafeInteger(normalized.y)
    || !Number.isSafeInteger(normalized.width)
    || !Number.isSafeInteger(normalized.height)
    || normalized.width <= 0
    || normalized.height <= 0
  ) {
    return null;
  }
  return normalized;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function centeredFallback(workArea, fallback) {
  const defaultState = safeFallback(fallback);
  const minimumWidth = Math.min(MIN_WINDOW_WIDTH, workArea.width);
  const minimumHeight = Math.min(MIN_WINDOW_HEIGHT, workArea.height);
  const width = clamp(defaultState.width, minimumWidth, workArea.width);
  const height = clamp(defaultState.height, minimumHeight, workArea.height);

  return {
    x: workArea.x + Math.floor((workArea.width - width) / 2),
    y: workArea.y + Math.floor((workArea.height - height) / 2),
    width,
    height,
    isMaximized: defaultState.isMaximized,
  };
}

/**
 * 把窗口放回指定显示器的可用区域。完全丢失或只剩极窄边缘可见时回到居中默认值。
 */
function clampWindowState(state, workArea, fallback = DEFAULT_WINDOW_STATE) {
  const area = normalizeWorkArea(workArea);
  if (!area) return safeFallback(fallback);

  const defaultState = centeredFallback(area, fallback);
  const candidate = normalizeWindowState(state);
  if (!candidate) return defaultState;

  const visibleWidth = Math.min(candidate.x + candidate.width, area.x + area.width)
    - Math.max(candidate.x, area.x);
  const visibleHeight = Math.min(candidate.y + candidate.height, area.y + area.height)
    - Math.max(candidate.y, area.y);
  const requiredVisibleWidth = Math.min(MIN_VISIBLE_EDGE, candidate.width);
  const requiredVisibleHeight = Math.min(MIN_VISIBLE_EDGE, candidate.height);
  if (visibleWidth < requiredVisibleWidth || visibleHeight < requiredVisibleHeight) {
    return defaultState;
  }

  const minimumWidth = Math.min(MIN_WINDOW_WIDTH, area.width);
  const minimumHeight = Math.min(MIN_WINDOW_HEIGHT, area.height);
  const width = clamp(candidate.width, minimumWidth, area.width);
  const height = clamp(candidate.height, minimumHeight, area.height);
  const maximumX = area.x + area.width - width;
  const maximumY = area.y + area.height - height;

  return {
    x: clamp(candidate.x, area.x, maximumX),
    y: clamp(candidate.y, area.y, maximumY),
    width,
    height,
    isMaximized: candidate.isMaximized,
  };
}

/**
 * 从文件读取窗口状态。文件不存在、不可读或内容损坏时都返回安全默认值。
 */
function readWindowState(filePath, fallback = DEFAULT_WINDOW_STATE) {
  let serialized;
  try {
    serialized = fs.readFileSync(filePath, "utf8");
  } catch {
    return safeFallback(fallback);
  }

  return parseWindowState(serialized, fallback);
}

module.exports = {
  DEFAULT_WINDOW_STATE,
  clampWindowState,
  parseWindowState,
  readWindowState,
};
