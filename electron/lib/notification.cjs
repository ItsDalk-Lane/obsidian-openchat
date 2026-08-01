"use strict";

/**
 * 只有窗口未聚焦，且运行状态刚从“运行中”变成“已结束”时才需要发完成通知。
 */
function shouldSendCompletionNotification(state) {
  if (typeof state !== "object" || state === null || Array.isArray(state)) return false;

  const { isFocused, wasRunning, isRunning } = state;
  if (
    typeof isFocused !== "boolean"
    || typeof wasRunning !== "boolean"
    || typeof isRunning !== "boolean"
  ) {
    return false;
  }

  return !isFocused && wasRunning && !isRunning;
}

module.exports = { shouldSendCompletionNotification };
