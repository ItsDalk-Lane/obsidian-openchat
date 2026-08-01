"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");

const {
  DEFAULT_WINDOW_STATE,
  clampWindowState,
  parseWindowState,
  readWindowState,
} = require("./window-state.cjs");

const WORK_AREA = { x: 0, y: 0, width: 1920, height: 1080 };

test("parseWindowState 校验 JSON 和全部持久化字段", () => {
  const fallback = { x: 10, y: 20, width: 1000, height: 700, isMaximized: false };

  assert.deepEqual(
    parseWindowState('{"x":-120,"y":40,"width":1200,"height":800,"isMaximized":true}', fallback),
    { x: -120, y: 40, width: 1200, height: 800, isMaximized: true },
  );
  assert.deepEqual(parseWindowState('{"x":1.4,"y":2.6,"width":1000.2,"height":700.8}', fallback), {
    x: 1,
    y: 3,
    width: 1000,
    height: 701,
    isMaximized: false,
  });
  assert.deepEqual(parseWindowState("{broken", fallback), fallback);
  assert.deepEqual(parseWindowState('{"x":0,"y":0,"width":1200}', fallback), fallback);
  assert.deepEqual(
    parseWindowState('{"x":0,"y":0,"width":1200,"height":800,"isMaximized":"yes"}', fallback),
    fallback,
  );
  assert.deepEqual(parseWindowState('{"x":0,"y":0,"width":0.4,"height":800}', fallback), fallback);
});

test("clampWindowState 把有效窗口钳制在目标显示器工作区", () => {
  assert.deepEqual(
    clampWindowState({ x: 100, y: 80, width: 1200, height: 800 }, WORK_AREA),
    { x: 100, y: 80, width: 1200, height: 800, isMaximized: false },
  );
  assert.deepEqual(
    clampWindowState({ x: -200, y: -50, width: 1200, height: 800, isMaximized: true }, WORK_AREA),
    { x: 0, y: 0, width: 1200, height: 800, isMaximized: true },
  );
  assert.deepEqual(
    clampWindowState({ x: 0, y: 0, width: 3000, height: 2000 }, WORK_AREA),
    { x: 0, y: 0, width: 1920, height: 1080, isMaximized: false },
  );
  assert.deepEqual(
    clampWindowState({ x: 4000, y: 3000, width: 1200, height: 800 }, WORK_AREA),
    DEFAULT_WINDOW_STATE,
  );
  assert.deepEqual(
    clampWindowState(
      { x: -1800, y: 100, width: 1200, height: 800 },
      { x: -1920, y: 0, width: 1920, height: 1080 },
    ),
    { x: -1800, y: 100, width: 1200, height: 800, isMaximized: false },
  );
  assert.deepEqual(
    clampWindowState({ x: 100, y: 80, width: 1200, height: 800 }, { x: 0, y: 0, width: 0, height: 1080 }),
    DEFAULT_WINDOW_STATE,
  );
});

test("readWindowState 读取文件并对缺失或损坏内容安全回退", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "pi-web-window-state-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));

  const validPath = join(directory, "valid.json");
  writeFileSync(validPath, JSON.stringify({ x: -100, y: 20, width: 1000, height: 700, isMaximized: true }));
  assert.deepEqual(readWindowState(validPath), {
    x: -100,
    y: 20,
    width: 1000,
    height: 700,
    isMaximized: true,
  });

  const brokenPath = join(directory, "broken.json");
  writeFileSync(brokenPath, "not-json");
  assert.deepEqual(readWindowState(brokenPath), DEFAULT_WINDOW_STATE);

  const invalidPath = join(directory, "invalid.json");
  writeFileSync(invalidPath, JSON.stringify({ x: 0, y: 0, width: -1, height: 700 }));
  assert.deepEqual(readWindowState(invalidPath), DEFAULT_WINDOW_STATE);

  assert.deepEqual(readWindowState(join(directory, "missing.json")), DEFAULT_WINDOW_STATE);
  assert.deepEqual(readWindowState(null), DEFAULT_WINDOW_STATE);
});
