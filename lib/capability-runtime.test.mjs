import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });

async function withHarness(t) {
  const root = await mkdtemp(join(tmpdir(), "pi-web-capability-runtime-"));
  const dataDir = join(root, "data");
  const agentDir = join(root, "agent");
  const repoDir = join(root, "repo");
  await mkdir(dataDir, { recursive: true });
  await mkdir(agentDir, { recursive: true });
  await mkdir(repoDir, { recursive: true });

  const prevData = process.env.PI_WEB_DATA_DIR;
  const prevAgent = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_WEB_DATA_DIR = dataDir;
  process.env.PI_CODING_AGENT_DIR = agentDir;

  const persistence = await jiti.import("./persistence/index.ts");
  const servicesModule = await jiti.import("./application/services/index.ts");

  t.after(async () => {
    servicesModule.resetKernelServicesForTests();
    servicesModule.resetKernelStartupRecoveryForTests?.();
    servicesModule.resetRuntimeRegistryForTests();
    persistence.resetKernelDatabaseForTests({ removeFiles: true, path: join(dataDir, "kernel.sqlite") });
    if (prevData === undefined) delete process.env.PI_WEB_DATA_DIR;
    else process.env.PI_WEB_DATA_DIR = prevData;
    if (prevAgent === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = prevAgent;
    await rm(root, { recursive: true, force: true });
  });

  return { servicesModule, repoDir };
}

test("workspace capability invocation supports policy approval flow", async (t) => {
  const { servicesModule, repoDir } = await withHarness(t);
  const services = servicesModule.getKernelServices();
  const task = services.taskService.createTask({
    title: "Workspace capability task",
    scope: { cwd: repoDir, projectRoot: repoDir },
  });

  const first = await services.capabilityService.invokeCapability({
    taskId: task.id,
    capabilityId: "system.workspace.open_view",
    input: { title: "Execution Summary", viewType: "execution.summary", payload: { x: 1 } },
  });
  assert.equal(first.status, "completed");

  const bindings = services.capabilityService.listTaskBindings(task.id);
  assert.equal(bindings.length, 0);

  services.capabilityService.setTaskBinding(task.id, {
    capabilityId: "system.workspace.open_view",
    policy: { requireApprovalEffectKinds: ["workspace.open_view"] },
  });
  const second = await services.capabilityService.invokeCapability({
    taskId: task.id,
    capabilityId: "system.workspace.open_view",
    input: { title: "Need Approval", viewType: "approval.view" },
  });
  assert.equal(second.status, "approval_required");
  assert.equal(second.approval.status, "pending");

  const approved = services.capabilityService.decideApproval({
    approvalId: second.approval.id,
    taskId: task.id,
    decision: "approved",
    decidedBy: "tester",
  });
  assert.equal(approved.status, "approved");

  const third = await services.capabilityService.invokeCapability({
    taskId: task.id,
    capabilityId: "system.workspace.open_view",
    approvalId: approved.id,
    input: { title: "Approved View", viewType: "approval.view" },
  });
  assert.equal(third.status, "completed");
  const workspace = services.capabilityService.listWorkspaceByTask(task.id);
  assert.ok(workspace.some((item) => item.title === "Approved View"));
});

test("context compiler and evaluator produce durable outputs", async (t) => {
  const { servicesModule, repoDir } = await withHarness(t);
  const services = servicesModule.getKernelServices();
  const task = services.taskService.createTask({
    title: "Evaluation task",
    goal: "Produce a report",
    expectedArtifacts: [{ id: "report", title: "Final report", artifactType: "document", required: true }],
    acceptanceCriteria: [{ id: "criteria-1", description: "Contains final summary" }],
    scope: { cwd: repoDir, projectRoot: repoDir },
  });

  const compiled = services.contextCompilerService.compileTaskContext(task.id);
  assert.ok(compiled.compiled.includes("Task Contract"));

  const evaluation = services.evaluationService.evaluateTask({ taskId: task.id });
  assert.ok(["failed", "needs_revision", "passed"].includes(evaluation.status));
  assert.equal(services.evaluationService.listByTask(task.id).length, 1);
});
