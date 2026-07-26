import { randomUUID } from "crypto";
import type { TaskListFilters } from "@/lib/application/ports/task-repository";
import type { UnitOfWork } from "@/lib/application/ports/unit-of-work";
import {
  createKernelEvent,
  createTaskId,
  type Task,
  type TaskContract,
  type TaskId,
  type TaskScope,
  type TaskStatus,
} from "@/lib/kernel";

const TITLE_MAX_LENGTH = 240;
const LONG_TEXT_MAX_LENGTH = 4_000;
const ARRAY_MAX_ITEMS = 25;
const ARRAY_ITEM_MAX_LENGTH = 500;

export interface CreateTaskInput {
  title: string;
  goal?: string;
  context?: string;
  constraints?: string[];
  nonGoals?: string[];
  scope?: TaskScope;
}

export interface UpdateTaskInput {
  title?: string;
  goal?: string;
  context?: string;
  constraints?: string[];
  nonGoals?: string[];
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

function validateContract(input: Pick<CreateTaskInput, "goal" | "context" | "constraints" | "nonGoals">): TaskContract | undefined {
  const contract: TaskContract = {
    goal: validateString("goal", input.goal, LONG_TEXT_MAX_LENGTH),
    context: validateString("context", input.context, LONG_TEXT_MAX_LENGTH),
    constraints: validateStringArray("constraints", input.constraints),
    nonGoals: validateStringArray("nonGoals", input.nonGoals),
  };
  if (!contract.goal && !contract.context && !contract.constraints?.length && !contract.nonGoals?.length) {
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

  if (!next.goal && !next.context && !next.constraints?.length && !next.nonGoals?.length) {
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
