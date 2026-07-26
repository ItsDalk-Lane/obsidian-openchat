import type { Task, TaskId, TaskOrigin, TaskStatus } from "@/lib/kernel";

export interface TaskListFilters {
  originKind?: TaskOrigin["kind"];
  status?: TaskStatus;
  projectRoot?: string;
  includeArchived?: boolean;
}

export interface TaskRepository {
  getById(id: TaskId): Task | null;
  list(filters?: TaskListFilters): Task[];
  create(task: Task): Task;
  update(task: Task): Task;
  findByOrigin(origin: TaskOrigin): Task | null;
  upsertImportedTask(task: Task): Task;
}
