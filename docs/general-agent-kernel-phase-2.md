# General Agent Kernel - Phase 2

## Scope

This phase introduces a minimal, production-used kernel baseline without replacing Pi session storage or existing UX flows.

## Architecture

```text
Pi Session (.jsonl)
  -> Pi projector (adapter layer)
  -> Task + default Run
  -> KernelEvent v1
  -> SSE / client decoder
  -> Chat workspace view

File path
  -> FileArtifact adapter
  -> Artifact
  -> Artifact renderer registry
  -> Artifact workspace view
```

## Data Flow

1. Server loads `SessionInfo` through `session-reader`.
2. Pi adapter projects session into `Task` + default `Run`.
3. Runtime commands are validated as `RuntimeCommand` union before `rpc-manager`.
4. Pi native events are translated by `pi-event-adapter` into `KernelEvent`.
5. `/api/agent/[id]/events` streams only typed `KernelEvent` payloads.
6. Client uses `decodeKernelEvent` (v1 + legacy fallback) and updates chat state.

## ID Strategy

- `TaskId`: deterministic hash of `pi:session:<sessionId>`
- `RunId`: deterministic hash of `pi:session:<sessionId>:default-run`
- `ArtifactId`: deterministic hash of normalized file path
- No pseudo persistent ID is generated before a real session id exists.

## Event Versioning

- Current schema: `KernelEvent.schemaVersion = 1`
- Envelope includes `id`, `occurredAt`, `taskId`, `runId`, optional `operationId`, `source`, and typed `payload`.
- Legacy flat event decoding is kept in decoder for compatibility migration.

## Legacy Decoder Removal Criteria

Remove legacy flat decoding after:

1. All server emitters produce only v1 kernel events.
2. No remaining clients depend on flat `{ type: string }` event shape.
3. Regression tests for reconnect/background restore pass without legacy path.

## Artifact Renderer Extension

Add renderers by implementing `ArtifactRenderer` and registering with explicit `priority`.

- Selection is deterministic (`priority` desc, `id` asc for ties).
- File access auth remains in `/api/files`; renderers only choose view components.

## Boundary Rules

- `lib/kernel/**`: domain/protocol only, no Pi/React/Next/Node-only imports.
- Pi-native names and runtime coupling live in `lib/adapters/pi/**`.
- UI workspace wrappers live in `components/workspace/**`.

## Phase 2 vs Phase 3

Implemented in phase 2:

- Task/Run projection (read-only, session-backed)
- Typed command/event protocol
- Artifact adapter + renderer registry
- Generic workbench tab/view baseline

Not implemented yet:

- Persistent task store
- Multi-run orchestration
- Capability registry/policy engine
- Dynamic third-party view contributions

## Upstream Sync Risk Areas

When syncing with upstream, review carefully:

- `lib/rpc-manager.ts`
- `hooks/useAgentSession.ts`
- `lib/adapters/pi/*`
- `components/FileViewer.tsx`
- `components/AppShell.tsx`
- `components/TabBar.tsx`
- `app/api/agent/*`
