"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { shouldSendCompletionNotification } = require("./notification.cjs");

test("shouldSendCompletionNotification 只接受未聚焦时的运行结束跃迁", () => {
  assert.equal(
    shouldSendCompletionNotification({ isFocused: false, wasRunning: true, isRunning: false }),
    true,
  );
  assert.equal(
    shouldSendCompletionNotification({ isFocused: true, wasRunning: true, isRunning: false }),
    false,
  );
  assert.equal(
    shouldSendCompletionNotification({ isFocused: false, wasRunning: true, isRunning: true }),
    false,
  );
  assert.equal(
    shouldSendCompletionNotification({ isFocused: false, wasRunning: false, isRunning: false }),
    false,
  );
  assert.equal(shouldSendCompletionNotification(null), false);
  assert.equal(
    shouldSendCompletionNotification({ isFocused: false, wasRunning: 1, isRunning: false }),
    false,
  );
});
