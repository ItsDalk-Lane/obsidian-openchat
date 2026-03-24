# Findings & Decisions

## Requirements
- Remove legacy shell directories from `src/`, especially `features/`, `service/`, `tars/`, `mcp/`, `subAgents/`, `agentLoop/`, and `systemPrompts`.
- Fully split `features/chat` and `features/tars` by real domain responsibility.
- Do not keep `tars` as a directory name, type name, or new config key.
- Use `tools/` only for built-in model-callable tools.
- Use `services/mcp/` only for external MCP service integration.
- Keep behavior unchanged while repairing imports and maintaining compilation.

## Research Findings
- `node_modules/.bin/tsc` is now available, so incremental compile validation can run locally.
- The worktree is clean before starting the refactor.
- There are confirmed duplicate legacy files: `src/features/chat/ChatEditorIntegration.tsx` duplicates `.ts`; `src/features/tars/system-prompts/SystemPromptManagerModal.tsx` duplicates `src/systemPrompts/SystemPromptManagerModal.tsx`.
- There is a confirmed dead sample file: `src/settings.ts`.
- The repository currently contains many stale imports targeting paths that do not exist, especially `features/tars/providers`, `features/tars/agent-loop/*`, and `features/tars/mcp/*`.
- Current `./node_modules/.bin/tsc --noEmit` is blocked by two independent issues:
  - `typescript@4.7.4` cannot parse modern syntax in some installed `.d.ts` files under `node_modules`
  - `src/features/chat/ChatEditorIntegration.ts` contains JSX while using a `.ts` extension
- After the current migration batches:
  - `features/tars` source references have been removed from `src/`
  - `features/chat` source references have been removed from `src/`
  - `settings.tars.settings` has been replaced by `settings.aiRuntime`
  - `mcp/client` has been moved to `services/mcp`
  - `agentLoop` has been moved to `core/agents/loop`
  - `skills` has been moved to `services/skills`
  - `subAgents` has been moved to `tools/sub-agents`
  - `mcp/builtin` has been moved to `tools/runtime`, `tools/vault`, `tools/web`, `tools/script`, `tools/plan`, `tools/time`, `tools/link`, and `tools/skill`
  - `service` has been moved to `core/services`
  - `systemPrompts` has been moved to `settings/system-prompts` and `components/system-prompt-components`
  - empty legacy directories `src/features`, `src/service`, `src/systemPrompts`, and `src/mcp` have been deleted
  - full `tsc` with 8GB heap no longer reports stale-path module errors from those legacy homes; remaining errors are strict typing / API mismatch debt in active modules
  - system prompt feature id has been renamed from `tars_chat` to `ai_chat`
  - legacy `tars_chat` values are still accepted on read via `SystemPromptDataService` mapping, then normalized to `ai_chat`
  - system prompt locale keys have been renamed from `system_prompt_feature_tars_chat*` to `system_prompt_feature_ai_chat*`
  - ai-runtime locale files no longer contain `Tars`-named translation keys
  - `LLMProviders/*` no longer import `tars/lang/helper`; they now import `src/i18n/ai-runtime/helper`
  - the old fallback crypto seed is kept only as a legacy decryption-compatible seed, while new fallback encryption uses an `openchat`-named seed
  - repo-wide `tsc --noEmit` now passes with `NODE_OPTIONS=--max-old-space-size=8192`
  - remaining `tars` text references are now centralized in `src/settings/legacyCompatibility.ts`; the only other occurrence is the upstream Doubao model id `doubao-1-5-ui-tars-250428`, which should not be renamed locally

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| Introduce `src/types/ai-runtime.ts`, `src/types/provider.ts`, `src/types/mcp.ts`, and `src/types/tool.ts` as canonical shared type homes | Needed to dissolve `features/tars` / `agentLoop` / `mcp` cross-domain path coupling |
| Migrate MCP builtin tools into top-level `tools/*` folders instead of `tools/mcp` | Matches user clarification and keeps `tools/` semantic |
| Rename settings runtime shape from `settings.tars.settings` to `settings.aiRuntime` with migration compatibility | Required by approved plan and user clarification |
| Fix parse blockers before large directory moves | Prevents false negatives during incremental validation |
| Move first by domain ownership, then repair relative imports in-place | Lets us eliminate old shell directories quickly while keeping diffs reviewable per domain |
| Keep legacy `tars` only in migration code paths and persisted feature IDs for now | Those cases affect backward compatibility and require a separate semantic migration pass beyond pure directory restructuring |
| Normalize legacy `tars_chat` to `ai_chat` at load time instead of preserving both as first-class ids | Keeps current runtime semantics clean while retaining backward compatibility for persisted system prompt files |
| Centralize all remaining legacy `tars` compatibility literals in `src/settings/legacyCompatibility.ts` | Keeps business code free of legacy naming while preserving migration support |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| Large number of stale imports make naive file moves unsafe | Establish canonical shared types and runtime homes first, then move by batches |
| TypeScript baseline is not currently usable for incremental verification | First remove invalid duplicate source, then upgrade TypeScript compiler version |
| Full project typecheck exhausts default Node heap | Use `NODE_OPTIONS=--max-old-space-size=8192` for repo-wide verification until type volume is reduced |

## Resources
- `/Users/study_superior/Desktop/Code/obsidian-openchat/src`
- `/Users/study_superior/Desktop/Code/obsidian-openchat/task_plan.md`
- `/Users/study_superior/Desktop/Code/obsidian-openchat/findings.md`
- `/Users/study_superior/Desktop/Code/obsidian-openchat/progress.md`

## Visual/Browser Findings
- No browser work used for this task.
