import type { DatabaseSync } from "node:sqlite";

export const migration003CapabilityPolicyEvaluationWorkspace = {
  version: 3,
  description: "Capability registry, policy approvals, evidence and workspace contributions",
  apply(db: DatabaseSync): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS capability_descriptors (
        id TEXT PRIMARY KEY,
        runtime_kind TEXT NOT NULL,
        name TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        invokable INTEGER NOT NULL DEFAULT 0,
        input_schema_json TEXT,
        output_schema_json TEXT,
        default_effects_json TEXT,
        metadata_json TEXT,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_capability_descriptors_runtime_kind
        ON capability_descriptors(runtime_kind);

      CREATE TABLE IF NOT EXISTS task_capability_bindings (
        task_id TEXT NOT NULL,
        capability_id TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        policy_json TEXT,
        config_json TEXT,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (task_id, capability_id),
        FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE,
        FOREIGN KEY(capability_id) REFERENCES capability_descriptors(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS capability_approvals (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        run_id TEXT,
        capability_id TEXT NOT NULL,
        status TEXT NOT NULL,
        effects_json TEXT NOT NULL,
        input_json TEXT,
        decision_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE,
        FOREIGN KEY(run_id) REFERENCES runs(id) ON DELETE SET NULL,
        FOREIGN KEY(capability_id) REFERENCES capability_descriptors(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_capability_approvals_task_created
        ON capability_approvals(task_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS capability_evidence (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        run_id TEXT,
        capability_id TEXT NOT NULL,
        artifact_id TEXT,
        summary TEXT NOT NULL,
        payload_json TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE,
        FOREIGN KEY(run_id) REFERENCES runs(id) ON DELETE SET NULL,
        FOREIGN KEY(capability_id) REFERENCES capability_descriptors(id) ON DELETE CASCADE,
        FOREIGN KEY(artifact_id) REFERENCES artifacts(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_capability_evidence_task_created
        ON capability_evidence(task_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS task_evaluations (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        run_id TEXT,
        evaluator_id TEXT NOT NULL,
        score REAL NOT NULL,
        status TEXT NOT NULL,
        summary TEXT NOT NULL,
        payload_json TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE,
        FOREIGN KEY(run_id) REFERENCES runs(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_task_evaluations_task_created
        ON task_evaluations(task_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS workspace_contributions (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        run_id TEXT,
        kind TEXT NOT NULL,
        title TEXT NOT NULL,
        view_type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        priority INTEGER NOT NULL DEFAULT 100,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE,
        FOREIGN KEY(run_id) REFERENCES runs(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_workspace_contributions_task_priority
        ON workspace_contributions(task_id, priority ASC, updated_at DESC);
    `);
  },
} as const;
