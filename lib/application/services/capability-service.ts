import { randomUUID } from "crypto";
import type { UnitOfWork } from "@/lib/application/ports/unit-of-work";
import {
  createKernelEvent,
  type CapabilityApproval,
  type CapabilityDescriptor,
  type CapabilityEffectDescriptor,
  type CapabilityEvidence,
  type RunId,
  type RuntimeAdapter,
  type RuntimeContext,
  type RuntimeKind,
  type TaskCapabilityBinding,
  type TaskCapabilityPolicy,
  type TaskId,
  type WorkspaceContribution,
} from "@/lib/kernel";
import type { ContextCompilerService } from "./context-compiler-service";

interface RuntimeAdapterLookup {
  get(runtimeKind: RuntimeKind): RuntimeAdapter | null;
}

const RISK_RANK: Record<CapabilityEffectDescriptor["riskLevel"], number> = {
  low: 1,
  medium: 2,
  high: 3,
};

export interface InvokeCapabilityInput {
  taskId: TaskId;
  capabilityId: string;
  runId?: RunId;
  input?: Record<string, unknown>;
  requestedBy?: string;
  approvalId?: string;
}

export type InvokeCapabilityResult =
  | { status: "blocked"; reason: string; effects: CapabilityEffectDescriptor[] }
  | { status: "approval_required"; approval: CapabilityApproval; effects: CapabilityEffectDescriptor[] }
  | { status: "completed"; output?: Record<string, unknown>; evidence: CapabilityEvidence };

export class CapabilityService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly runtimeRegistry: RuntimeAdapterLookup,
    private readonly contextCompiler: ContextCompilerService,
  ) {
    this.ensureBuiltinDescriptors();
  }

  private ensureBuiltinDescriptors(): void {
    const now = new Date().toISOString();
    const builtins: CapabilityDescriptor[] = [
      {
        id: "pi.runtime.prompt",
        runtimeKind: "pi",
        name: "prompt",
        title: "Send Runtime Prompt",
        description: "Send a prompt to an existing runtime run.",
        invokable: true,
        inputSchema: {
          type: "object",
          required: ["message"],
          properties: {
            message: { type: "string" },
            includeCompiledContext: { type: "boolean" },
          },
        },
        defaultEffects: [
          { kind: "runtime.session", summary: "Send prompt to runtime agent session", riskLevel: "medium" },
        ],
        metadata: { source: "builtin" },
        updatedAt: now,
      },
      {
        id: "system.workspace.open_view",
        runtimeKind: "system",
        name: "workspace.open_view",
        title: "Open Workspace View",
        description: "Contribute a dynamic view card to task workspace.",
        invokable: true,
        inputSchema: {
          type: "object",
          required: ["title", "viewType"],
          properties: {
            title: { type: "string" },
            viewType: { type: "string" },
            payload: { type: "object" },
            priority: { type: "number" },
          },
        },
        defaultEffects: [
          { kind: "workspace.open_view", summary: "Add dynamic workspace contribution", riskLevel: "low" },
        ],
        metadata: { source: "builtin" },
        updatedAt: now,
      },
    ];
    for (const descriptor of builtins) {
      this.uow.capabilities.upsertDescriptor(descriptor);
    }
  }

  listCapabilities(filters?: { runtimeKind?: RuntimeKind; invokableOnly?: boolean }): CapabilityDescriptor[] {
    return this.uow.capabilities.listDescriptors(filters);
  }

  listTaskBindings(taskId: TaskId): TaskCapabilityBinding[] {
    return this.uow.capabilities.listTaskBindings(taskId);
  }

  setTaskBinding(taskId: TaskId, input: {
    capabilityId: string;
    enabled?: boolean;
    policy?: TaskCapabilityPolicy;
    config?: Record<string, unknown>;
  }): TaskCapabilityBinding {
    const task = this.uow.tasks.getById(taskId);
    if (!task) throw new Error("Task not found");
    const descriptor = this.uow.capabilities.getDescriptor(input.capabilityId);
    if (!descriptor) throw new Error("Capability not found");
    const now = new Date().toISOString();
    return this.uow.capabilities.upsertTaskBinding({
      taskId,
      capabilityId: input.capabilityId,
      enabled: input.enabled !== false,
      policy: input.policy,
      config: input.config,
      updatedAt: now,
    });
  }

  async discoverPiCapabilities(runtimeContext: RuntimeContext): Promise<CapabilityDescriptor[]> {
    if (runtimeContext.runtimeKind !== "pi") return [];
    const adapter = this.runtimeRegistry.get("pi");
    if (!adapter) throw new Error("Pi runtime adapter is not registered");
    const tools = await adapter.send(runtimeContext, { type: "get_tools" });
    const names = Array.isArray(tools) ? tools.filter((item): item is string => typeof item === "string") : [];
    const now = new Date().toISOString();
    const descriptors: CapabilityDescriptor[] = names.map((name) => ({
      id: `pi.tool.${name}`,
      runtimeKind: "pi",
      name,
      title: `Tool: ${name}`,
      description: "Discovered runtime tool capability",
      invokable: false,
      defaultEffects: [{ kind: "runtime.tool", summary: `Invoke tool ${name}`, riskLevel: "medium" }],
      metadata: { source: "runtime-discovery", toolName: name },
      updatedAt: now,
    }));
    for (const descriptor of descriptors) {
      this.uow.capabilities.upsertDescriptor(descriptor);
    }
    return descriptors;
  }

  listApprovalsByTask(taskId: TaskId): CapabilityApproval[] {
    return this.uow.capabilities.listApprovalsByTask(taskId);
  }

  decideApproval(input: {
    approvalId: string;
    taskId: TaskId;
    decision: "approved" | "rejected";
    decidedBy: string;
    note?: string;
  }): CapabilityApproval {
    const approval = this.uow.capabilities.getApproval(input.approvalId);
    if (!approval || approval.taskId !== input.taskId) throw new Error("Approval not found");
    if (approval.status !== "pending") throw new Error("Approval is no longer pending");
    const updated: CapabilityApproval = {
      ...approval,
      status: input.decision,
      decision: {
        decidedBy: input.decidedBy,
        decidedAt: new Date().toISOString(),
        note: input.note?.trim() || undefined,
      },
      updatedAt: new Date().toISOString(),
    };
    return this.uow.capabilities.updateApproval(updated);
  }

  listEvidenceByTask(taskId: TaskId): CapabilityEvidence[] {
    return this.uow.capabilities.listEvidenceByTask(taskId);
  }

  listWorkspaceByTask(taskId: TaskId): WorkspaceContribution[] {
    const persisted = this.uow.capabilities.listWorkspaceContributionsByTask(taskId);
    if (persisted.length > 0) return persisted;
    const task = this.uow.tasks.getById(taskId);
    if (!task) return [];
    return [{
      id: `workspace_overview_${task.id}`,
      taskId,
      kind: "view",
      title: "Task Overview",
      viewType: "task.overview",
      payload: {
        title: task.title,
        status: task.status,
        expectedArtifacts: task.contract?.expectedArtifacts?.length ?? 0,
        acceptanceCriteria: task.contract?.acceptanceCriteria?.length ?? 0,
      },
      priority: 10,
      createdAt: task.updatedAt,
      updatedAt: task.updatedAt,
    }];
  }

  async invokeCapability(input: InvokeCapabilityInput): Promise<InvokeCapabilityResult> {
    const task = this.uow.tasks.getById(input.taskId);
    if (!task) throw new Error("Task not found");

    const descriptor = this.uow.capabilities.getDescriptor(input.capabilityId);
    if (!descriptor) throw new Error("Capability not found");
    if (!descriptor.invokable) throw new Error("Capability is not invokable");

    const binding = this.uow.capabilities.getTaskBinding(input.taskId, input.capabilityId);
    if (binding && !binding.enabled) {
      return {
        status: "blocked",
        reason: "Capability is disabled for this task",
        effects: descriptor.defaultEffects ?? [],
      };
    }

    let runContext: RuntimeContext | undefined;
    if (input.runId) {
      const run = this.uow.runs.getById(input.runId);
      if (!run || run.taskId !== input.taskId) throw new Error("Run not found for task");
      runContext = {
        taskId: run.taskId,
        runId: run.id,
        runtimeKind: run.runtimeKind,
        nativeRuntimeId: run.nativeRuntimeId,
      };
    }

    const effects = descriptor.defaultEffects ?? [];
    const policyCheck = this.checkPolicy(effects, binding?.policy);
    if (policyCheck.blocked) {
      return { status: "blocked", reason: policyCheck.reason, effects };
    }

    if (policyCheck.requiresApproval) {
      if (!input.approvalId) {
        const now = new Date().toISOString();
        const approval: CapabilityApproval = {
          id: `approval_${randomUUID()}`,
          taskId: input.taskId,
          runId: input.runId,
          capabilityId: descriptor.id,
          status: "pending",
          effects,
          input: input.input,
          createdAt: now,
          updatedAt: now,
        };
        this.uow.capabilities.createApproval(approval);
        return { status: "approval_required", approval, effects };
      }
      const approval = this.uow.capabilities.getApproval(input.approvalId);
      if (!approval || approval.taskId !== input.taskId || approval.capabilityId !== descriptor.id) {
        throw new Error("Approval not found");
      }
      if (approval.status === "pending") {
        return { status: "approval_required", approval, effects };
      }
      if (approval.status !== "approved") {
        return { status: "blocked", reason: `Approval was ${approval.status}`, effects };
      }
    }

    const executionId = `exec_${randomUUID()}`;
    const activeRunId = input.runId ?? runContext?.runId ?? task.defaultRunId;
    this.uow.events.append(createKernelEvent(
      "capability.execution.started",
      input.taskId,
      activeRunId,
      { executionId, capabilityName: descriptor.name },
      { kind: "system" },
    ), "durable");

    const output = await this.executeCapability(descriptor, input, runContext);
    const evidence = this.uow.capabilities.createEvidence({
      id: `evidence_${randomUUID()}`,
      taskId: input.taskId,
      runId: activeRunId,
      capabilityId: descriptor.id,
      summary: output.summary,
      payload: output.payload,
      createdAt: new Date().toISOString(),
    });

    this.uow.events.append(createKernelEvent(
      "capability.execution.completed",
      input.taskId,
      activeRunId,
      { executionId },
      { kind: "system" },
    ), "durable");

    return { status: "completed", output: output.payload, evidence };
  }

  private checkPolicy(
    effects: CapabilityEffectDescriptor[],
    policy: TaskCapabilityPolicy | undefined,
  ): { blocked: boolean; requiresApproval: boolean; reason: string } {
    if (effects.length === 0) return { blocked: false, requiresApproval: false, reason: "" };
    const blockedKinds = new Set(policy?.blockedEffectKinds ?? []);
    for (const effect of effects) {
      if (blockedKinds.has(effect.kind)) {
        return { blocked: true, requiresApproval: false, reason: `Effect ${effect.kind} is blocked by policy` };
      }
    }
    const requiresApprovalKinds = new Set(policy?.requireApprovalEffectKinds ?? []);
    const threshold = policy?.autoApproveRiskLevelAtOrBelow ?? "low";
    const thresholdRank = RISK_RANK[threshold];
    const requiresApproval = effects.some((effect) => {
      if (requiresApprovalKinds.has(effect.kind)) return true;
      return RISK_RANK[effect.riskLevel] > thresholdRank;
    });
    return { blocked: false, requiresApproval, reason: "" };
  }

  private async executeCapability(
    descriptor: CapabilityDescriptor,
    input: InvokeCapabilityInput,
    runContext?: RuntimeContext,
  ): Promise<{ summary: string; payload: Record<string, unknown> }> {
    if (descriptor.id === "pi.runtime.prompt") {
      if (!runContext) throw new Error("runId is required for pi.runtime.prompt");
      const adapter = this.runtimeRegistry.get(runContext.runtimeKind);
      if (!adapter) throw new Error(`Runtime adapter not found: ${runContext.runtimeKind}`);
      const rawMessage = typeof input.input?.message === "string" ? input.input.message : "";
      if (!rawMessage.trim()) throw new Error("message is required");
      const includeCompiledContext = input.input?.includeCompiledContext !== false;
      const compiled = includeCompiledContext
        ? this.contextCompiler.compileTaskContext(input.taskId, { runId: runContext.runId, budgetChars: 4_000 }).compiled
        : "";
      const message = includeCompiledContext
        ? `${rawMessage}\n\n[Compiled Task Context]\n${compiled}`
        : rawMessage;
      await adapter.send(runContext, { type: "prompt", message });
      return {
        summary: "Prompt submitted to runtime session",
        payload: { submitted: true, runId: runContext.runId, runtimeKind: runContext.runtimeKind },
      };
    }

    if (descriptor.id === "system.workspace.open_view") {
      const title = typeof input.input?.title === "string" ? input.input.title.trim() : "";
      const viewType = typeof input.input?.viewType === "string" ? input.input.viewType.trim() : "";
      if (!title || !viewType) throw new Error("title and viewType are required");
      const now = new Date().toISOString();
      const contribution: WorkspaceContribution = {
        id: `view_${randomUUID()}`,
        taskId: input.taskId,
        runId: input.runId,
        kind: "view",
        title,
        viewType,
        payload: typeof input.input?.payload === "object" && input.input.payload
          ? input.input.payload as Record<string, unknown>
          : {},
        priority: typeof input.input?.priority === "number" ? Math.round(input.input.priority) : 100,
        createdAt: now,
        updatedAt: now,
      };
      this.uow.capabilities.upsertWorkspaceContribution(contribution);
      return {
        summary: `Workspace contribution created: ${title}`,
        payload: { contributionId: contribution.id, viewType: contribution.viewType },
      };
    }

    throw new Error(`Unsupported invokable capability: ${descriptor.id}`);
  }
}
