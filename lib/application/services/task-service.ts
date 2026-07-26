import { randomUUID } from "crypto";
import type { TaskListFilters } from "@/lib/application/ports/task-repository";
import type { UnitOfWork } from "@/lib/application/ports/unit-of-work";
import {
  createKernelEvent,
  createTaskId,
  type Task,
  type TaskContractAcceptanceCriterion,
  type TaskContractArtifactExpectation,
  type TaskContract,
  type TaskId,
  type TaskScope,
  type TaskStatus,
} from "@/lib/kernel";

const TITLE_MAX_LENGTH = 240;
const LONG_TEXT_MAX_LENGTH = 4_000;
const ARRAY_MAX_ITEMS = 25;
const ARRAY_ITEM_MAX_LENGTH = 500;
const EXPECTATION_ID_MAX_LENGTH = 80;
const EXPECTATION_TITLE_MAX_LENGTH = 240;
const EXPECTATION_TYPE_MAX_LENGTH = 120;
const CRITERION_ID_MAX_LENGTH = 80;

export interface CreateTaskInput {
  title: string;
  goal?: string;
  context?: string;
  constraints?: string[];
  nonGoals?: string[];
  expectedArtifacts?: TaskContractArtifactExpectation[];
  acceptanceCriteria?: TaskContractAcceptanceCriterion[];
  scope?: TaskScope;
}

export interface UpdateTaskInput {
  title?: string;
  goal?: string;
  context?: string;
  constraints?: string[];
  nonGoals?: string[];
  expectedArtifacts?: TaskContractArtifactExpectation[];
  acceptanceCriteria?: TaskContractAcceptanceCriterion[];
  scope?: TaskScope;
  status?: TaskStatus;
  expectedUpdatedAt?: string;
}

function trimOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function validateString(field: string, value: string | undefined, maxLength: number): string | undefined {
  const trimmed = trimOptional(value);
  if (trimmed && trimmed.length > maxLength) {
    throw new Error(`${field} is too long`);
  }
  return trimmed;
}

function validateStringArray(field: string, value: string[] | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
  if (value.length > ARRAY_MAX_ITEMS) throw new Error(`${field} has too many items`);
  const normalized = value
    .map((item) => validateString(field, item, ARRAY_ITEM_MAX_LENGTH))
    .filter((item): item is string => Boolean(item));
  return normalized;
}

function validateExpectedArtifacts(
  expectedArtifacts: TaskContractArtifactExpectation[] | undefined,
): TaskContractArtifactExpectation[] | undefined {
  if (expectedArtifacts === undefined) return undefined;
  if (!Array.isArray(expectedArtifacts)) throw new Error("expectedArtifacts must be an array");
  if (expectedArtifacts.length > ARRAY_MAX_ITEMS) throw new Error("expectedArtifacts has too many items");
  const seenIds = new Set<string>();
  const normalized = expectedArtifacts.map((item, index) => {
    if (!item || typeof item !== "object") throw new Error(`expectedArtifacts[${index}] must be an object`);
    const id = validateString("expectedArtifacts.id", item.id, EXPECTATION_ID_MAX_LENGTH);
    const title = validateString("expectedArtifacts.title", item.title, EXPECTATION_TITLE_MAX_LENGTH);
    const artifactType = validateString("expectedArtifacts.artifactType", item.artifactType, EXPECTATION_TYPE_MAX_LENGTH);
    if (!id) throw new Error(`expectedArtifacts[${index}] id is required`);
    if (!title) throw new Error(`expectedArtifacts[${index}] title is required`);
    if (seenIds.has(id)) throw new Error(`Duplicate expectedArtifacts id: ${id}`);
    seenIds.add(id);
    return {
      id,
      title,
      ...(artifactType ? { artifactType } : {}),
      ...(item.required !== undefined ? { required: item.required !== false } : {}),
    };
  });
  return normalized;
}

function validateAcceptanceCriteria(
  acceptanceCriteria: TaskContractAcceptanceCriterion[] | undefined,
): TaskContractAcceptanceCriterion[] | undefined {
  if (acceptanceCriteria === undefined) return undefined;
  if (!Array.isArray(acceptanceCriteria)) throw new Error("acceptanceCriteria must be an array");
  if (acceptanceCriteria.length > ARRAY_MAX_ITEMS) throw new Error("acceptanceCriteria has too many items");
  const seenIds = new Set<string>();
  const normalized = acceptanceCriteria.map((item, index) => {
    if (!item || typeof item !== "object") throw new Error(`acceptanceCriteria[${index}] must be an object`);
    const id = validateString("acceptanceCriteria.id", item.id, CRITERION_ID_MAX_LENGTH);
    const description = validateString("acceptanceCriteria.description", item.description, LONG_TEXT_MAX_LENGTH);
    if (!id) throw new Error(`acceptanceCriteria[${index}] id is required`);
    if (!description) throw new Error(`acceptanceCriteria[${index}] description is required`);
    if (seenIds.has(id)) throw new Error(`Duplicate acceptanceCriteria id: ${id}`);
    seenIds.add(id);
    return {
      id,
      description,
    };
  });
  return normalized;
}

function validateContract(
  input: Pick<CreateTaskInput, "goal" | "context" | "constraints" | "nonGoals" | "expectedArtifacts" | "acceptanceCriteria">,
): TaskContract | undefined {
  const contract: TaskContract = {
    goal: validateString("goal", input.goal, LONG_TEXT_MAX_LENGTH),
    context: validateString("context", input.context, LONG_TEXT_MAX_LENGTH),
    constraints: validateStringArray("constraints", input.constraints),
    nonGoals: validateStringArray("nonGoals", input.nonGoals),
    expectedArtifacts: validateExpectedArtifacts(input.expectedArtifacts),
    acceptanceCriteria: validateAcceptanceCriteria(input.acceptanceCriteria),
  };
  if (
    !contract.goal
    && !contract.context
    && !contract.constraints?.length
    && !contract.nonGoals?.length
    && !contract.expectedArtifacts?.length
    && !contract.acceptanceCriteria?.length
  ) {
    return undefined;
  }
  return contract;
}

function mergeContract(existing: TaskContract | undefined, input: UpdateTaskInput): TaskContract | undefined {
  const next: TaskContract = {
    ...(existing ?? {}),
  };

  if ("goal" in input) {
    next.goal = validateString("goal", input.goal, LONG_TEXT_MAX_LENGTH);
  }
  if ("context" in input) {
    next.context = validateString("context", input.context, LONG_TEXT_MAX_LENGTH);
  }
  if ("constraints" in input) {
    next.constraints = validateStringArray("constraints", input.constraints);
  }
  if ("nonGoals" in input) {
    next.nonGoals = validateStringArray("nonGoals", input.nonGoals);
  }
  if ("expectedArtifacts" in input) {
    next.expectedArtifacts = validateExpectedArtifacts(input.expectedArtifacts);
  }
  if ("acceptanceCriteria" in input) {
    next.acceptanceCriteria = validateAcceptanceCriteria(input.acceptanceCriteria);
  }

  if (
    !next.goal
    && !next.context
    && !next.constraints?.length
    && !next.nonGoals?.length
    && !next.expectedArtifacts?.length
    && !next.acceptanceCriteria?.length
  ) {
    return undefined;
  }
  return next;
}

function isTaskStatusTransitionAllowed(from: TaskStatus, to: TaskStatus): boolean {
  if (from === to) return true;
  if (from === "archived") return false;
  if (to === "draft") return false;
  if (from === "completed") return to === "idle" || to === "archived";
  return true;
}

export class TaskService {
  constructor(private readonly uow: UnitOfWork) {}

  listTasks(filters?: TaskListFilters): Task[] {
    return this.uow.tasks.list(filters);
  }

  getTask(taskId: TaskId): Task | null {
    return this.uow.tasks.getById(taskId);
  }

  createTask(input: CreateTaskInput): Task {
    const title = validateString("title", input.title, TITLE_MAX_LENGTH);
    if (!title) throw new Error("title is required");
    const now = new Date().toISOString();
    const task: Task = {
      id: createTaskId(`native:${randomUUID()}`),
      title,
      status: "draft",
      origin: { kind: "native" },
      contract: validateContract(input),
      scope: input.scope,
      titleSource: "native",
      metadata: {},
      createdAt: now,
      updatedAt: now,
    };

    return this.uow.transaction(({ tasks, events }) => {
      tasks.create(task);
      events.append(createKernelEvent(
        "task.created",
        task.id,
        undefined,
        { task: { id: task.id, status: task.status, title: task.title } },
        { kind: "system" },
      ), "durable");
      return task;
    });
  }

  updateTask(taskId: TaskId, input: UpdateTaskInput): Task {
    return this.uow.transaction(({ tasks, events }) => {
      const existing = tasks.getById(taskId);
      if (!existing) {
        throw new Error("Task not found");
      }
      if (input.expectedUpdatedAt && input.expectedUpdatedAt !== existing.updatedAt) {
        throw new Error("Task has been updated by another request");
      }

      const nextStatus = input.status ?? existing.status;
      if (!isTaskStatusTransitionAllowed(existing.status, nextStatus)) {
        throw new Error(`Illegal task status transition: ${existing.status} -> ${nextStatus}`);
      }

      const nextContract = mergeContract(existing.contract, input);

      const changedFields: string[] = [];
      const nextTitle = input.title !== undefined
        ? validateString("title", input.title, TITLE_MAX_LENGTH)
        : existing.title;
      if (!nextTitle) throw new Error("title is required");
      if (nextTitle !== existing.title) changedFields.push("title");

      const updatedAt = new Date().toISOString();
      const nextTask: Task = {
        ...existing,
        title: nextTitle,
        titleSource: input.title !== undefined ? "user" : existing.titleSource,
        contract: nextContract,
        scope: input.scope ?? existing.scope,
        status: nextStatus,
        updatedAt,
      };

      if (JSON.stringify(existing.contract ?? null) !== JSON.stringify(nextTask.contract ?? null)) changedFields.push("contract");
      if (JSON.stringify(existing.scope ?? null) !== JSON.stringify(nextTask.scope ?? null)) changedFields.push("scope");
      if (existing.status !== nextTask.status) changedFields.push("status");

      tasks.update(nextTask);
      if (existing.status !== nextTask.status) {
        events.append(createKernelEvent(
          "task.status.changed",
          nextTask.id,
          nextTask.defaultRunId,
          { previousStatus: existing.status, status: nextTask.status },
          { kind: "system" },
        ), "durable");
      }
      if (changedFields.some((field) => field !== "status")) {
        events.append(createKernelEvent(
          "task.updated",
          nextTask.id,
          nextTask.defaultRunId,
          { changedFields: changedFields.filter((field) => field !== "status") },
          { kind: "system" },
        ), "durable");
      }
      return nextTask;
    });
  }
}
