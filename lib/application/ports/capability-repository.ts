import type {
  CapabilityApproval,
  CapabilityDescriptor,
  CapabilityEvidence,
  TaskCapabilityBinding,
  TaskEvaluation,
  TaskId,
  WorkspaceContribution,
  RuntimeKind,
} from "@/lib/kernel";

export interface CapabilityRepository {
  upsertDescriptor(descriptor: CapabilityDescriptor): CapabilityDescriptor;
  getDescriptor(capabilityId: string): CapabilityDescriptor | null;
  listDescriptors(filters?: { runtimeKind?: RuntimeKind; invokableOnly?: boolean }): CapabilityDescriptor[];

  upsertTaskBinding(binding: TaskCapabilityBinding): TaskCapabilityBinding;
  getTaskBinding(taskId: TaskId, capabilityId: string): TaskCapabilityBinding | null;
  listTaskBindings(taskId: TaskId): TaskCapabilityBinding[];

  createApproval(approval: CapabilityApproval): CapabilityApproval;
  getApproval(approvalId: string): CapabilityApproval | null;
  updateApproval(approval: CapabilityApproval): CapabilityApproval;
  listApprovalsByTask(taskId: TaskId): CapabilityApproval[];

  createEvidence(evidence: CapabilityEvidence): CapabilityEvidence;
  listEvidenceByTask(taskId: TaskId): CapabilityEvidence[];

  createEvaluation(evaluation: TaskEvaluation): TaskEvaluation;
  listEvaluationsByTask(taskId: TaskId): TaskEvaluation[];

  upsertWorkspaceContribution(contribution: WorkspaceContribution): WorkspaceContribution;
  listWorkspaceContributionsByTask(taskId: TaskId): WorkspaceContribution[];
}
