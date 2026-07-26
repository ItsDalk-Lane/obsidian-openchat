import type { ArtifactId, RunId, TaskId } from "./ids";
import type { RuntimeKind } from "./runtime-context";

export type CapabilityRiskLevel = "low" | "medium" | "high";

export interface CapabilityEffectDescriptor {
  kind: string;
  summary: string;
  riskLevel: CapabilityRiskLevel;
  target?: string;
  metadata?: Record<string, unknown>;
}

export interface CapabilityDescriptor {
  id: string;
  runtimeKind: RuntimeKind;
  name: string;
  title: string;
  description?: string;
  invokable: boolean;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  defaultEffects?: CapabilityEffectDescriptor[];
  metadata?: Record<string, unknown>;
  updatedAt: string;
}

export interface TaskCapabilityPolicy {
  blockedEffectKinds?: string[];
  requireApprovalEffectKinds?: string[];
  autoApproveRiskLevelAtOrBelow?: CapabilityRiskLevel;
}

export interface TaskCapabilityBinding {
  taskId: TaskId;
  capabilityId: string;
  enabled: boolean;
  policy?: TaskCapabilityPolicy;
  config?: Record<string, unknown>;
  updatedAt: string;
}

export type CapabilityApprovalStatus = "pending" | "approved" | "rejected" | "cancelled";

export interface CapabilityApprovalDecision {
  decidedBy: string;
  decidedAt: string;
  note?: string;
}

export interface CapabilityApproval {
  id: string;
  taskId: TaskId;
  runId?: RunId;
  capabilityId: string;
  status: CapabilityApprovalStatus;
  effects: CapabilityEffectDescriptor[];
  input?: Record<string, unknown>;
  decision?: CapabilityApprovalDecision;
  createdAt: string;
  updatedAt: string;
}

export interface CapabilityEvidence {
  id: string;
  taskId: TaskId;
  runId?: RunId;
  capabilityId: string;
  artifactId?: ArtifactId;
  summary: string;
  payload?: Record<string, unknown>;
  createdAt: string;
}

export type EvaluationStatus = "passed" | "failed" | "needs_revision";

export interface TaskEvaluation {
  id: string;
  taskId: TaskId;
  runId?: RunId;
  evaluatorId: string;
  score: number;
  status: EvaluationStatus;
  summary: string;
  payload?: Record<string, unknown>;
  createdAt: string;
}

export type WorkspaceContributionKind = "artifact" | "view" | "note";

export interface WorkspaceContribution {
  id: string;
  taskId: TaskId;
  runId?: RunId;
  kind: WorkspaceContributionKind;
  title: string;
  viewType: string;
  payload: Record<string, unknown>;
  priority: number;
  createdAt: string;
  updatedAt: string;
}
