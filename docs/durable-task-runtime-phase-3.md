# Durable Task Runtime - Phase 3

Phase 3 turns the phase-2 kernel skeleton into a durable local runtime layer for Pi Web.

## What changed

- Added persistent `Task`, `Run`, `Artifact`, and `KernelEvent` storage in SQLite.
- Added `PI_WEB_DATA_DIR`; default storage is `<PI_CODING_AGENT_DIR or ~/.pi/agent>/pi-web/kernel.sqlite`.
- Added application ports/services under `lib/application/` so routes, runtime management, and React do not talk to SQLite directly.
- Added `PiSessionReconciler` to import and sync Pi sessions into durable tasks/runs.
- Added a kernel event journal with durable/transient event separation.
- Added minimal multi-run support so one task can own multiple Pi runs.
- Added task resolver and task/run/event/artifact APIs backed by persistent state.
- Moved `AppShell` to resolve active task/run through the server instead of client-side Pi projection.

## Data model

- `Task`: durable work item with contract, scope, origin, status, and default run.
- `Run`: durable runtime context. A Pi session maps to one Pi run, but a task may have multiple runs.
- `Artifact`: metadata-only catalog entry. File contents remain on disk and still flow through `/api/files`.
- `StoredKernelEvent`: journal record with monotonic `sequence` plus the original `KernelEvent`.

## SQLite schema

The phase-3 database contains:

- `schema_migrations`
- `tasks`
- `runs`
- `artifacts`
- `task_artifacts`
- `kernel_events`

Key constraints:

- task origin uniqueness: `(origin_kind, origin_external_id)`
- run origin uniqueness: `(runtime_kind, native_runtime_id)`
- event uniqueness: `event_id`
- task-artifact uniqueness: `(task_id, artifact_id)`

## API surface

Phase 3 adds or repurposes:

- `GET /api/tasks`
- `POST /api/tasks`
- `GET /api/tasks/[taskId]`
- `PATCH /api/tasks/[taskId]`
- `GET /api/tasks/resolve?runtimeKind=pi&nativeRuntimeId=<sessionId>`
- `GET /api/tasks/[taskId]/runs`
- `POST /api/tasks/[taskId]/runs`
- `GET /api/tasks/[taskId]/events`
- `GET /api/tasks/[taskId]/artifacts`
- `POST /api/tasks/[taskId]/artifacts`
- `PATCH /api/tasks/[taskId]/artifacts/[artifactId]`

`/api/tasks/[taskId]` now accepts only durable `TaskId` values. Session ids must go through the resolver route.

## Runtime semantics

- Forking a Pi session still creates a new Pi session file, and now reconciles to a new task and run with `parentTaskId`.
- In-session branching still stays inside the same task/run.
- `agent_end` is operation completion, not task completion.
- Running runs are marked `interrupted` after process restart when no active in-memory runtime exists.
- Message bodies and streaming deltas stay in Pi JSONL/SSE flows and are not copied into the event journal by default.

## Testing

Phase 3 adds focused Node test entrypoints:

- `npm run test:persistence`
- `npm run test:task-runtime`
- `npm run test:event-journal`

The main `npm run test` command still includes them through the existing glob.
