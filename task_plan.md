# Task Plan: Remove `tars` Naming And Reorganize `src/`

## Goal
Implement the approved repo-wide refactor so `src/` no longer contains legacy shell directories like `features/`, `service/`, `tars/`, `mcp/`, `subAgents/`, `agentLoop/`, or `systemPrompts`, while preserving behavior and keeping the project compiling.

## Current Phase
Phase 5

## Phases
### Phase 1: Baseline & Stop-The-Bleeding
- [x] Record current findings and validation baseline
- [x] Run TypeScript to capture current errors
- [ ] Remove duplicate / dead legacy files
- [ ] Establish canonical type and settings targets for `aiRuntime`
- [ ] Repair validation tooling so incremental `tsc` is meaningful
- **Status:** in_progress

### Phase 2: Shared Infrastructure Migration
- [x] Migrate MCP client/runtime into `services/mcp` and `tools`
- [x] Migrate skills and agent runtime into `services/skills`, `core/agents`, and `tools/sub-agents`
- [x] Migrate system prompt persistence into `settings/system-prompts`
- **Status:** completed

### Phase 3: Chat / Editor / Commands Migration
- [x] Split `features/chat` into `core/chat`, `editor/chat`, `commands/chat`, and `components/chat-components`
- [x] Move selection toolbar and tab completion under `editor/`
- [x] Update imports and barrel files incrementally
- **Status:** completed

### Phase 4: AI Runtime Settings Migration
- [x] Replace `tars` naming with `aiRuntime`
- [x] Split `features/tars` into `settings/ai-runtime`, `commands/ai-runtime`, `components/settings-components`, `components/modals`, and `i18n/ai-runtime`
- [x] Add migration support from persisted `tars.settings` to `aiRuntime`
- **Status:** completed

### Phase 5: Cleanup & Verification
- [x] Delete legacy directories and compatibility leftovers
- [x] Run final `./node_modules/.bin/tsc --noEmit`
- [ ] Run final `npm run build`
- **Status:** in_progress

## Key Questions
1. Which broken imports are pure stale-path issues vs. actually missing source files?
2. Which existing types should become global canonical types under `src/types/`?
3. How much of the old persisted settings shape can be migrated without behavior changes?

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Use `aiRuntime` as the replacement semantic name for legacy `tars` configuration and command orchestration | Matches user request to remove meaningless `tars` naming while keeping the responsibility explicit |
| Keep `tools/` only for model-callable tools and `services/mcp/` only for external MCP integration | Avoids mixing protocol integration with built-in tool definitions |
| Migrate incrementally with `tsc` after each batch | Required by user and reduces refactor risk |
| Treat duplicate / invalid source files as stop-the-bleeding cleanup before structural moves | Current parse failures make incremental validation impossible |
| Treat unreferenced legacy tag-command code in `AiRuntimeCommandManager` as removable migration residue | The helper implementations and settings fields no longer exist anywhere in the repo, so keeping that block only preserves a broken shell |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| `typescript@4.7.4` cannot parse current dependency `.d.ts` files | 1 | Upgrade local TypeScript devDependency after stop-the-bleeding cleanup |
| Default Node heap OOMs on full `tsc --noEmit` | 1 | Re-run typecheck with `NODE_OPTIONS=--max-old-space-size=8192` to get actionable diagnostics |

## Notes
- Do not preserve `tars` as a new directory, type name, or runtime property.
- `tars` is only allowed inside `src/settings/legacyCompatibility.ts` as a legacy persisted input key / feature id / seed constant for migration compatibility.
- Prefer moving cohesive file groups together: source + CSS + local barrel + immediate import repair.
