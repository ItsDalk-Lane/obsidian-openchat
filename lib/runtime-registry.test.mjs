import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });

test("runtime registry registers adapters and prevents duplicates", async () => {
  const services = await jiti.import("./application/services/index.ts");
  services.resetRuntimeRegistryForTests();
  const registry = services.getRuntimeRegistry();

  const adapter = {
    descriptor: {
      id: "fake",
      version: "1.0.0",
      displayName: "Fake Runtime",
      capabilities: {
        streaming: false,
        resumable: true,
        cancellable: true,
        branching: false,
        nativeTools: false,
        contextInjection: true,
      },
    },
    async createRun(input) {
      return { taskId: input.taskId, runId: "run_fake", runtimeKind: "fake", nativeRuntimeId: "fake-1" };
    },
    async attachExisting(input) {
      return input.context;
    },
    async getState() {
      return { status: "idle" };
    },
    async send(_context, command) {
      if (command.type === "prompt") return null;
      return null;
    },
    subscribe() {
      return () => {};
    },
    async abort() {},
    async close() {},
  };

  registry.register(adapter);
  assert.equal(registry.get("fake")?.descriptor.displayName, "Fake Runtime");
  assert.throws(() => registry.register(adapter), /already registered/);
});

test("fake runtime adapter can create run, emit event, and complete operation", async () => {
  const services = await jiti.import("./application/services/index.ts");
  const kernel = await jiti.import("./kernel/index.ts");
  services.resetRuntimeRegistryForTests();
  const registry = services.getRuntimeRegistry();
  let listener = null;

  const fakeAdapter = {
    descriptor: {
      id: "fake-runtime",
      version: "1.0.0",
      displayName: "Fake Runtime",
      capabilities: {
        streaming: true,
        resumable: true,
        cancellable: true,
        branching: true,
        nativeTools: false,
        contextInjection: true,
      },
    },
    async createRun(input) {
      return { taskId: input.taskId, runId: "run_fake_1", runtimeKind: "fake-runtime", nativeRuntimeId: "fake-native-1" };
    },
    async attachExisting(input) {
      return input.context;
    },
    async getState() {
      return { status: "running", details: { fake: true } };
    },
    async send(context, command) {
      if (command.type === "prompt") {
        listener?.(
          kernel.createKernelEvent(
            "operation.started",
            context.taskId,
            context.runId,
            { operationKind: "prompt" },
            { kind: "runtime", adapter: "fake-runtime", nativeType: "fake_prompt" },
          ),
        );
        listener?.(
          kernel.createKernelEvent(
            "artifact.registered",
            context.taskId,
            context.runId,
            { artifactId: "artifact_fake", artifactType: "document" },
            { kind: "runtime", adapter: "fake-runtime", nativeType: "fake_artifact" },
          ),
        );
        listener?.(
          kernel.createKernelEvent(
            "operation.completed",
            context.taskId,
            context.runId,
            { operationKind: "prompt", result: { done: true } },
            { kind: "runtime", adapter: "fake-runtime", nativeType: "fake_done" },
          ),
        );
        return null;
      }
      return null;
    },
    subscribe(_context, callback) {
      listener = callback;
      return () => {
        listener = null;
      };
    },
    async abort() {},
    async close() {},
  };

  registry.register(fakeAdapter);
  const context = await fakeAdapter.createRun({ taskId: "task_fake", cwd: "C:\\fake" });
  const events = [];
  const unsubscribe = fakeAdapter.subscribe(context, (event) => events.push(event.type));
  await fakeAdapter.send(context, { type: "prompt", message: "go" });
  unsubscribe();
  await fakeAdapter.close(context);

  assert.deepEqual(events, ["operation.started", "artifact.registered", "operation.completed"]);
});
