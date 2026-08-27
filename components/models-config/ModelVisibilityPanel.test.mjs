import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});
const {
  buildScopePayload,
  patternMatchesModel,
} = await jiti.import("./ModelVisibilityPanel.tsx");

const GROUPS = [
  { provider: "anthropic", models: [
    { provider: "anthropic", id: "claude-a", name: "A" },
    { provider: "anthropic", id: "claude-b", name: "B" },
  ] },
  { provider: "minimax-cn", models: [
    { provider: "minimax-cn", id: "MiniMax-M3", name: "M3" },
  ] },
];

test("patternMatchesModel matches exact refs, case-insensitively, with optional :level pin", () => {
  const model = GROUPS[0].models[0];
  assert.equal(patternMatchesModel("anthropic/claude-a", model), true);
  assert.equal(patternMatchesModel("Anthropic/Claude-A", model), true);
  assert.equal(patternMatchesModel("anthropic/claude-a:high", model), true);
  assert.equal(patternMatchesModel("anthropic/*", model), false);
  assert.equal(patternMatchesModel("minimax-cn/MiniMax-M3", model), false);
});

test("unrestricted + everything checked stays unrestricted", () => {
  const checked = new Set(["anthropic/claude-a", "anthropic/claude-b"]);
  assert.equal(buildScopePayload({
    groups: GROUPS, providerId: "anthropic", checked, previousPatterns: null,
  }), null);
});

test("partial selection collapses other providers to globs and keeps refs", () => {
  const payload = buildScopePayload({
    groups: GROUPS,
    providerId: "anthropic",
    checked: new Set(["anthropic/claude-b"]),
    previousPatterns: null,
  });
  assert.deepEqual(payload, ["anthropic/claude-b", "minimax-cn/*"]);
});

test("restricted scope replaces only the edited provider and keeps the rest", () => {
  const payload = buildScopePayload({
    groups: GROUPS,
    providerId: "anthropic",
    checked: new Set(["anthropic/claude-a", "anthropic/claude-b"]),
    previousPatterns: ["minimax-cn/MiniMax-M3"],
  });
  // Target becomes a whole-provider glob; other rules survive untouched.
  assert.deepEqual(payload, ["anthropic/*", "minimax-cn/MiniMax-M3"]);
});

test("hidden target provider drops its patterns; CLI rules for others survive", () => {
  const payload = buildScopePayload({
    groups: GROUPS,
    providerId: "minimax-cn",
    checked: new Set(),
    previousPatterns: ["minimax-cn/*", "anthropic/claude-a:high"],
  });
  assert.deepEqual(payload, ["anthropic/claude-a:high"]);
});
