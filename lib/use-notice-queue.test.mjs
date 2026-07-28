import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { initialNoticeState, noticeReducer } = await jiti.import("../hooks/useNoticeQueue.ts");

function notice(id) {
  return { id, message: id, type: "info" };
}

test("keeps five notices visible and queues the next notice", () => {
  let state = initialNoticeState;
  for (let index = 1; index <= 6; index += 1) {
    state = noticeReducer(state, { type: "add", notice: notice(String(index)) });
  }

  assert.equal(state.visible.length, 5);
  assert.equal(state.visible[0].exiting, true);
  assert.deepEqual(state.pending.map((item) => item.id), ["6"]);
});

test("promotes the oldest pending notice after an exiting notice is removed", () => {
  const state = {
    visible: [
      { ...notice("1"), exiting: true },
      notice("2"),
      notice("3"),
      notice("4"),
      notice("5"),
    ],
    pending: [notice("6"), notice("7")],
  };

  const next = noticeReducer(state, { type: "remove", id: "1" });

  assert.deepEqual(next.visible.map((item) => item.id), ["2", "3", "4", "5", "6"]);
  assert.equal(next.visible[0].exiting, true);
  assert.deepEqual(next.pending.map((item) => item.id), ["7"]);
});

test("marks the oldest notice that is not already exiting", () => {
  const state = {
    visible: [{ ...notice("1"), exiting: true }, notice("2")],
    pending: [],
  };

  const next = noticeReducer(state, { type: "mark_oldest_exiting" });

  assert.equal(next.visible[0].exiting, true);
  assert.equal(next.visible[1].exiting, true);
});
