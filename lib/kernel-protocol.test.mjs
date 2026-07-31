import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const {
  createTaskId,
  createRunId,
  createKernelEvent,
  createOperationId,
  decodeKernelEvent,
  parseRuntimeCommand,
  parseNewSessionCommand,
} = await jiti.import("./kernel/index.ts");

test("runtime command parser accepts supported command and validates required fields", () => {
  const ok = parseRuntimeCommand({ type: "set_model", provider: "x", modelId: "y" });
  assert.equal(ok.ok, true);
  const bad = parseRuntimeCommand({ type: "set_model", provider: "x" });
  assert.equal(bad.ok, false);
});

test("runtime command parser rejects unknown commands", () => {
  const bad = parseRuntimeCommand({ type: "unknown_command" });
  assert.equal(bad.ok, false);
});

test("runtime command parser covers all currently supported command types", () => {
  const commands = [
    { type: "prompt", message: "hi" },
    { type: "abort" },
    { type: "get_state" },
    { type: "set_model", provider: "p", modelId: "m" },
    { type: "fork", entryId: "entry" },
    { type: "navigate_tree", targetId: "entry" },
    { type: "set_thinking_level", level: "high" },
    { type: "compact" },
    { type: "set_session_name", name: "name" },
    { type: "get_session_stats" },
    { type: "get_last_assistant_text" },
    { type: "set_auto_compaction", enabled: true },
    { type: "clear_queue" },
    { type: "steer", message: "s" },
    { type: "follow_up", message: "f" },
    { type: "get_tools" },
    { type: "get_commands" },
    { type: "set_tools", toolNames: ["read"] },
    { type: "reload" },
    { type: "abort_compaction" },
    { type: "extension_ui_response", id: "1", cancelled: true },
    { type: "extension_ui_input", id: "1", data: "x" },
    { type: "set_auto_retry", enabled: true },
    { type: "bash", command: "echo 1" },
    { type: "abort_bash" },
    { type: "mcp_action", action: "reconnect" },
    { type: "mcp_action", action: "auth", server: "linear" },
    { type: "mcp_action", action: "logout", server: "linear" },
  ];
  for (const command of commands) {
    const parsed = parseRuntimeCommand(command);
    assert.equal(parsed.ok, true, command.type);
  }
});

test("runtime command parser validates mcp_action fields", () => {
  const missingAction = parseRuntimeCommand({ type: "mcp_action" });
  assert.equal(missingAction.ok, false);
  const badAction = parseRuntimeCommand({ type: "mcp_action", action: "restart" });
  assert.equal(badAction.ok, false);
  const badServer = parseRuntimeCommand({ type: "mcp_action", action: "auth", server: 42 });
  assert.equal(badServer.ok, false);
  const ok = parseRuntimeCommand({ type: "mcp_action", action: "reconnect", server: "svc" });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.value, { type: "mcp_action", action: "reconnect", server: "svc" });
});

test("new session parser supports ensure_session as bootstrap command", () => {
  const ensure = parseNewSessionCommand({ type: "ensure_session" });
  assert.equal(ensure.ok, true);
});

test("kernel event factory includes schema/version/ids", () => {
  const event = createKernelEvent(
    "operation.started",
    createTaskId("t"),
    createRunId("r"),
    { operationKind: "prompt" },
    { kind: "runtime", adapter: "pi", nativeType: "agent_start" },
    createOperationId("prompt"),
  );
  assert.equal(event.schemaVersion, 1);
  assert.equal(typeof event.id, "string");
  assert.equal(typeof event.occurredAt, "string");
  assert.equal(typeof event.taskId, "string");
  assert.equal(typeof event.runId, "string");
});

test("kernel event decoder accepts v1 event payload directly", () => {
  const taskId = createTaskId("task");
  const runId = createRunId("run");
  const source = { kind: "runtime", adapter: "pi", nativeType: "agent_start" };
  const v1 = createKernelEvent("operation.started", taskId, runId, { operationKind: "prompt" }, source);
  const decoded = decodeKernelEvent(v1, { taskId, runId, sessionId: "s1" });
  assert.equal(decoded.type, "operation.started");
});

test("kernel event decoder maps legacy compaction event names", () => {
  const taskId = createTaskId("task");
  const runId = createRunId("run");
  const decoded = decodeKernelEvent({ type: "auto_compaction_start" }, { taskId, runId, sessionId: "s1" });
  assert.equal(decoded.type, "compaction.started");
});

test("kernel event decoder rejects unknown legacy event types", () => {
  const taskId = createTaskId("task");
  const runId = createRunId("run");
  const decoded = decodeKernelEvent({ type: "totally_new", foo: 1 }, { taskId, runId, sessionId: "s1" });
  assert.equal(decoded, null);
});
