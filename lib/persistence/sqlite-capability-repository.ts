import type { CapabilityRepository } from "@/lib/application/ports/capability-repository";
import type {
  CapabilityApproval,
  CapabilityDescriptor,
  CapabilityEvidence,
  RuntimeKind,
  TaskCapabilityBinding,
  TaskEvaluation,
  TaskId,
  WorkspaceContribution,
} from "@/lib/kernel";
import type { DatabaseSync } from "node:sqlite";
import { parseJsonArray, parseJsonRecord, parseJsonValue, stringifyJson } from "./sqlite-helpers";

type DescriptorRow = {
  id: string;
  runtime_kind: string;
  name: string;
  title: string;
  description: string | null;
  invokable: number;
  input_schema_json: string | null;
  output_schema_json: string | null;
  default_effects_json: string | null;
  metadata_json: string | null;
  updated_at: string;
};

type BindingRow = {
  task_id: string;
  capability_id: string;
  enabled: number;
  policy_json: string | null;
  config_json: string | null;
  updated_at: string;
};

type ApprovalRow = {
  id: string;
  task_id: string;
  run_id: string | null;
  capability_id: string;
  status: string;
  effects_json: string;
  input_json: string | null;
  decision_json: string | null;
  created_at: string;
  updated_at: string;
};

type EvidenceRow = {
  id: string;
  task_id: string;
  run_id: string | null;
  capability_id: string;
  artifact_id: string | null;
  summary: string;
  payload_json: string | null;
  created_at: string;
};

type EvaluationRow = {
  id: string;
  task_id: string;
  run_id: string | null;
  evaluator_id: string;
  score: number;
  status: string;
  summary: string;
  payload_json: string | null;
  created_at: string;
};

type ContributionRow = {
  id: string;
  task_id: string;
  run_id: string | null;
  kind: string;
  title: string;
  view_type: string;
  payload_json: string;
  priority: number;
  created_at: string;
  updated_at: string;
};

function mapDescriptor(row: DescriptorRow): CapabilityDescriptor {
  return {
    id: row.id,
    runtimeKind: row.runtime_kind as RuntimeKind,
    name: row.name,
    title: row.title,
    description: row.description ?? undefined,
    invokable: row.invokable === 1,
    inputSchema: parseJsonRecord(row.input_schema_json),
    outputSchema: parseJsonRecord(row.output_schema_json),
    defaultEffects: parseJsonArray(row.default_effects_json),
    metadata: parseJsonRecord(row.metadata_json),
    updatedAt: row.updated_at,
  };
}

function mapBinding(row: BindingRow): TaskCapabilityBinding {
  return {
    taskId: row.task_id as TaskId,
    capabilityId: row.capability_id,
    enabled: row.enabled === 1,
    policy: parseJsonValue(row.policy_json),
    config: parseJsonRecord(row.config_json),
    updatedAt: row.updated_at,
  };
}

function mapApproval(row: ApprovalRow): CapabilityApproval {
  return {
    id: row.id,
    taskId: row.task_id as TaskId,
    runId: row.run_id ? row.run_id as CapabilityApproval["runId"] : undefined,
    capabilityId: row.capability_id,
    status: row.status as CapabilityApproval["status"],
    effects: parseJsonArray(row.effects_json) ?? [],
    input: parseJsonRecord(row.input_json),
    decision: parseJsonValue(row.decision_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapEvidence(row: EvidenceRow): CapabilityEvidence {
  return {
    id: row.id,
    taskId: row.task_id as TaskId,
    runId: row.run_id ? row.run_id as CapabilityEvidence["runId"] : undefined,
    capabilityId: row.capability_id,
    artifactId: row.artifact_id ? row.artifact_id as CapabilityEvidence["artifactId"] : undefined,
    summary: row.summary,
    payload: parseJsonRecord(row.payload_json),
    createdAt: row.created_at,
  };
}

function mapEvaluation(row: EvaluationRow): TaskEvaluation {
  return {
    id: row.id,
    taskId: row.task_id as TaskId,
    runId: row.run_id ? row.run_id as TaskEvaluation["runId"] : undefined,
    evaluatorId: row.evaluator_id,
    score: row.score,
    status: row.status as TaskEvaluation["status"],
    summary: row.summary,
    payload: parseJsonRecord(row.payload_json),
    createdAt: row.created_at,
  };
}

function mapContribution(row: ContributionRow): WorkspaceContribution {
  return {
    id: row.id,
    taskId: row.task_id as TaskId,
    runId: row.run_id ? row.run_id as WorkspaceContribution["runId"] : undefined,
    kind: row.kind as WorkspaceContribution["kind"],
    title: row.title,
    viewType: row.view_type,
    payload: parseJsonRecord(row.payload_json) ?? {},
    priority: row.priority,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SqliteCapabilityRepository implements CapabilityRepository {
  constructor(private readonly db: DatabaseSync) {}

  upsertDescriptor(descriptor: CapabilityDescriptor): CapabilityDescriptor {
    this.db.prepare(`
      INSERT INTO capability_descriptors (
        id, runtime_kind, name, title, description, invokable,
        input_schema_json, output_schema_json, default_effects_json, metadata_json, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        runtime_kind = excluded.runtime_kind,
        name = excluded.name,
        title = excluded.title,
        description = excluded.description,
        invokable = excluded.invokable,
        input_schema_json = excluded.input_schema_json,
        output_schema_json = excluded.output_schema_json,
        default_effects_json = excluded.default_effects_json,
        metadata_json = excluded.metadata_json,
        updated_at = excluded.updated_at
    `).run(
      descriptor.id,
      descriptor.runtimeKind,
      descriptor.name,
      descriptor.title,
      descriptor.description ?? null,
      descriptor.invokable ? 1 : 0,
      stringifyJson(descriptor.inputSchema),
      stringifyJson(descriptor.outputSchema),
      stringifyJson(descriptor.defaultEffects),
      stringifyJson(descriptor.metadata),
      descriptor.updatedAt,
    );
    return this.getDescriptor(descriptor.id) ?? descriptor;
  }

  getDescriptor(capabilityId: string): CapabilityDescriptor | null {
    const row = this.db.prepare(`
      SELECT id, runtime_kind, name, title, description, invokable,
             input_schema_json, output_schema_json, default_effects_json, metadata_json, updated_at
      FROM capability_descriptors
      WHERE id = ?
    `).get(capabilityId) as DescriptorRow | undefined;
    return row ? mapDescriptor(row) : null;
  }

  listDescriptors(filters?: { runtimeKind?: RuntimeKind; invokableOnly?: boolean }): CapabilityDescriptor[] {
    const clauses: string[] = [];
    const values: Array<string | number> = [];
    if (filters?.runtimeKind) {
      clauses.push("runtime_kind = ?");
      values.push(filters.runtimeKind);
    }
    if (filters?.invokableOnly) {
      clauses.push("invokable = 1");
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = this.db.prepare(`
      SELECT id, runtime_kind, name, title, description, invokable,
             input_schema_json, output_schema_json, default_effects_json, metadata_json, updated_at
      FROM capability_descriptors
      ${where}
      ORDER BY runtime_kind ASC, name ASC
    `).all(...values) as DescriptorRow[];
    return rows.map(mapDescriptor);
  }

  upsertTaskBinding(binding: TaskCapabilityBinding): TaskCapabilityBinding {
    this.db.prepare(`
      INSERT INTO task_capability_bindings (task_id, capability_id, enabled, policy_json, config_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(task_id, capability_id) DO UPDATE SET
        enabled = excluded.enabled,
        policy_json = excluded.policy_json,
        config_json = excluded.config_json,
        updated_at = excluded.updated_at
    `).run(
      binding.taskId,
      binding.capabilityId,
      binding.enabled ? 1 : 0,
      stringifyJson(binding.policy),
      stringifyJson(binding.config),
      binding.updatedAt,
    );
    return this.getTaskBinding(binding.taskId, binding.capabilityId) ?? binding;
  }

  getTaskBinding(taskId: TaskId, capabilityId: string): TaskCapabilityBinding | null {
    const row = this.db.prepare(`
      SELECT task_id, capability_id, enabled, policy_json, config_json, updated_at
      FROM task_capability_bindings
      WHERE task_id = ? AND capability_id = ?
    `).get(taskId, capabilityId) as BindingRow | undefined;
    return row ? mapBinding(row) : null;
  }

  listTaskBindings(taskId: TaskId): TaskCapabilityBinding[] {
    const rows = this.db.prepare(`
      SELECT task_id, capability_id, enabled, policy_json, config_json, updated_at
      FROM task_capability_bindings
      WHERE task_id = ?
      ORDER BY capability_id ASC
    `).all(taskId) as BindingRow[];
    return rows.map(mapBinding);
  }

  createApproval(approval: CapabilityApproval): CapabilityApproval {
    this.db.prepare(`
      INSERT INTO capability_approvals (
        id, task_id, run_id, capability_id, status, effects_json,
        input_json, decision_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      approval.id,
      approval.taskId,
      approval.runId ?? null,
      approval.capabilityId,
      approval.status,
      stringifyJson(approval.effects),
      stringifyJson(approval.input),
      stringifyJson(approval.decision),
      approval.createdAt,
      approval.updatedAt,
    );
    return approval;
  }

  getApproval(approvalId: string): CapabilityApproval | null {
    const row = this.db.prepare(`
      SELECT id, task_id, run_id, capability_id, status, effects_json, input_json, decision_json, created_at, updated_at
      FROM capability_approvals
      WHERE id = ?
    `).get(approvalId) as ApprovalRow | undefined;
    return row ? mapApproval(row) : null;
  }

  updateApproval(approval: CapabilityApproval): CapabilityApproval {
    this.db.prepare(`
      UPDATE capability_approvals
      SET status = ?, effects_json = ?, input_json = ?, decision_json = ?, updated_at = ?
      WHERE id = ?
    `).run(
      approval.status,
      stringifyJson(approval.effects),
      stringifyJson(approval.input),
      stringifyJson(approval.decision),
      approval.updatedAt,
      approval.id,
    );
    return approval;
  }

  listApprovalsByTask(taskId: TaskId): CapabilityApproval[] {
    const rows = this.db.prepare(`
      SELECT id, task_id, run_id, capability_id, status, effects_json, input_json, decision_json, created_at, updated_at
      FROM capability_approvals
      WHERE task_id = ?
      ORDER BY created_at DESC
    `).all(taskId) as ApprovalRow[];
    return rows.map(mapApproval);
  }

  createEvidence(evidence: CapabilityEvidence): CapabilityEvidence {
    this.db.prepare(`
      INSERT INTO capability_evidence (id, task_id, run_id, capability_id, artifact_id, summary, payload_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      evidence.id,
      evidence.taskId,
      evidence.runId ?? null,
      evidence.capabilityId,
      evidence.artifactId ?? null,
      evidence.summary,
      stringifyJson(evidence.payload),
      evidence.createdAt,
    );
    return evidence;
  }

  listEvidenceByTask(taskId: TaskId): CapabilityEvidence[] {
    const rows = this.db.prepare(`
      SELECT id, task_id, run_id, capability_id, artifact_id, summary, payload_json, created_at
      FROM capability_evidence
      WHERE task_id = ?
      ORDER BY created_at DESC
    `).all(taskId) as EvidenceRow[];
    return rows.map(mapEvidence);
  }

  createEvaluation(evaluation: TaskEvaluation): TaskEvaluation {
    this.db.prepare(`
      INSERT INTO task_evaluations (id, task_id, run_id, evaluator_id, score, status, summary, payload_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      evaluation.id,
      evaluation.taskId,
      evaluation.runId ?? null,
      evaluation.evaluatorId,
      evaluation.score,
      evaluation.status,
      evaluation.summary,
      stringifyJson(evaluation.payload),
      evaluation.createdAt,
    );
    return evaluation;
  }

  listEvaluationsByTask(taskId: TaskId): TaskEvaluation[] {
    const rows = this.db.prepare(`
      SELECT id, task_id, run_id, evaluator_id, score, status, summary, payload_json, created_at
      FROM task_evaluations
      WHERE task_id = ?
      ORDER BY created_at DESC
    `).all(taskId) as EvaluationRow[];
    return rows.map(mapEvaluation);
  }

  upsertWorkspaceContribution(contribution: WorkspaceContribution): WorkspaceContribution {
    this.db.prepare(`
      INSERT INTO workspace_contributions (
        id, task_id, run_id, kind, title, view_type, payload_json, priority, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        kind = excluded.kind,
        title = excluded.title,
        view_type = excluded.view_type,
        payload_json = excluded.payload_json,
        priority = excluded.priority,
        updated_at = excluded.updated_at
    `).run(
      contribution.id,
      contribution.taskId,
      contribution.runId ?? null,
      contribution.kind,
      contribution.title,
      contribution.viewType,
      stringifyJson(contribution.payload),
      contribution.priority,
      contribution.createdAt,
      contribution.updatedAt,
    );
    return contribution;
  }

  listWorkspaceContributionsByTask(taskId: TaskId): WorkspaceContribution[] {
    const rows = this.db.prepare(`
      SELECT id, task_id, run_id, kind, title, view_type, payload_json, priority, created_at, updated_at
      FROM workspace_contributions
      WHERE task_id = ?
      ORDER BY priority ASC, updated_at DESC
    `).all(taskId) as ContributionRow[];
    return rows.map(mapContribution);
  }
}
