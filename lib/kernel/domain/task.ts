import type { RunId, TaskId } from "./ids";

export type TaskStatus =
  | "draft"
  | "idle"
  | "active"
  | "waiting"
  | "completed"
  | "failed"
  | "archived";

export interface TaskContractArtifactExpectation {
  id: string;
  title: string;
  artifactType?: string;
  required?: boolean;
}

export interface TaskContractAcceptanceCriterion {
  id: string;
  description: string;
}

export interface TaskContract {
  goal?: string;
  context?: string;
  nonGoals?: string[];
  constraints?: string[];
  expectedArtifacts?: TaskContractArtifactExpectation[];
  acceptanceCriteria?: TaskContractAcceptanceCriterion[];
}

export interface TaskScope {
  cwd?: string;
  projectRoot?: string;
  worktreeBranch?: string;
}

export interface TaskOrigin {
  kind: "native" | "pi-session" | (string & {});
  externalId?: string;
}

export type TaskTitleSource = "session-name" | "first-message" | "fallback" | "user" | "native";

export interface Task {
  id: TaskId;
  title: string;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  origin: TaskOrigin;
  contract?: TaskContract;
  scope?: TaskScope;
  defaultRunId?: RunId;
  parentTaskId?: TaskId;
  titleSource?: TaskTitleSource;
  metadata?: Record<string, unknown>;
}
