import type { ResourceDiagnostic } from "@earendil-works/pi-coding-agent";
import type { SessionInfo } from "./types";

export interface SuccessResponse {
  success: boolean;
}

export interface SessionsResponse {
  sessions: SessionInfo[];
  runningSessionIds?: string[];
}

export interface DeleteSessionsResponse {
  ok: boolean;
  deletedIds: string[];
}

export interface HomeResponse {
  home: string;
}

export interface CwdValidateResponse {
  success: boolean;
  cwd: string;
  projectRoot: string;
  projectKey: string;
}

export interface DefaultCwdResponse {
  cwd: string;
}

export interface AppSettingsResponse {
  defaultCwd: string | null;
}

export interface CwdQuickLink {
  name: string;
  path: string;
}

export interface CwdQuickLinksResponse {
  places: CwdQuickLink[];
  recents: string[];
}

export interface CwdMkdirResponse {
  cwd: string;
}

export interface CwdSystemPickResponse {
  cancelled: boolean;
  cwd: string | null;
}

export interface WorktreeEntry {
  path: string;
  branch: string | null;
  isMain: boolean;
}

export interface WorktreesResponse {
  projectRoot: string;
  projectKey: string;
  isGit: boolean;
  isTopLevel: boolean;
  /** Canonical path of the checkout containing cwd, resolved server-side. */
  currentWorktreePath: string | null;
  worktrees: WorktreeEntry[];
}

export interface CreateWorktreeResponse {
  path: string;
  branch: string | null;
}

export interface WorktreeDeleteErrorResponse {
  error?: string;
  dirty?: boolean;
}

export interface SkillSearchResult {
  package: string;
  installs: string;
  url: string;
}

export type SkillInstallScope = "global" | "project";

export interface SkillInstallInfo {
  package: string;
  scope: SkillInstallScope;
  source: string;
  sourceType?: string;
  skillsShUrl?: string;
  skillPath?: string;
  ref?: string;
  versionHash?: string;
  canCheckForUpdates: boolean;
}

export type SkillUpdateState =
  | "up-to-date"
  | "update-available"
  | "unsupported"
  | "error";

export interface SkillUpdateResult {
  package: string;
  scope: SkillInstallScope;
  state: SkillUpdateState;
  currentVersion?: string;
  latestVersion?: string;
  message?: string;
}

export interface SkillInfo {
  name: string;
  description: string;
  filePath: string;
  baseDir: string;
  disableModelInvocation: boolean;
  sourceInfo: {
    source?: string;
    scope?: string;
  };
  install?: SkillInstallInfo;
}

export interface SkillSearchResponse {
  results: SkillSearchResult[];
}

export interface SkillInstallResponse extends SuccessResponse {
  output?: string;
}

export interface SkillsResponse {
  skills: SkillInfo[];
  diagnostics: ResourceDiagnostic[];
  projectResourcesLoaded: boolean;
}

export interface ProjectTrustStatus {
  requiresTrust: boolean;
  trusted: boolean;
}

export interface SkillCheckResponse {
  updates: SkillUpdateResult[];
}

export interface SkillUpdateResponse extends SuccessResponse {
  skill?: SkillInfo;
}

export interface OAuthProviderInfo {
  id: string;
  name: string;
  usesCallbackServer: boolean;
  loggedIn: boolean;
  /** Provider also supports API-key auth, so it appears in both picker sections. */
  supportsApiKey?: boolean;
}

export interface ApiKeyProviderInfo {
  id: string;
  displayName: string;
  configured: boolean;
  source?: string;
  modelCount: number;
  /** Provider also supports OAuth, so it appears in both picker sections. */
  supportsOAuth?: boolean;
}

export interface OAuthProvidersResponse {
  providers: OAuthProviderInfo[];
}

export interface ApiKeyProvidersResponse {
  providers: ApiKeyProviderInfo[];
}

export interface AuthActionResponse {
  ok?: boolean;
  success?: boolean;
  provider?: string;
}

export interface ModelTestResponse {
  ok?: boolean;
  error?: string;
  latencyMs?: number;
  status?: number;
  responseText?: string;
}

/** One selectable entry of the chat model-selector scope editor. */
export interface SelectorModelInfo {
  provider: string;
  id: string;
  name: string;
  reasoning?: boolean;
  input?: string[];
  contextWindow?: number;
}

export interface EnabledModelsResponse {
  /** Every currently available model, unscoped — candidates for checkboxes. */
  allModels: SelectorModelInfo[];
  /** Raw global `enabledModels`; null means unrestricted (everything visible). */
  enabledPatterns: string[] | null;
  warnings?: string[];
}

export interface EnabledModelsUpdateResponse extends SuccessResponse {
  warnings?: string[];
}

/** Response of POST /api/models/refresh (remote catalogs → models-store.json). */
export interface ModelsRefreshResponse extends SuccessResponse {
  refreshedAt?: string;
  /** Available-model count after the refresh. */
  totalModels?: number;
  /** Per-provider network/refresh failures; empty when all providers updated. */
  failed?: { provider: string; message: string }[];
  runtimeError?: string;
}

export type PluginScope = "global" | "project";
export type PluginResourceKind = "extension" | "skill" | "prompt" | "theme";

export interface PluginResourceCounts {
  extensions: number;
  skills: number;
  prompts: number;
  themes: number;
}

export interface PluginDiagnostic {
  type: "warning" | "error";
  message: string;
  source?: string;
  path?: string;
}

export interface PluginResourceInfo {
  kind: PluginResourceKind;
  name: string;
  path: string;
  relativePath: string;
}

export interface PluginPackageInfo {
  source: string;
  scope: PluginScope;
  filtered: boolean;
  disabled: boolean;
  installedPath?: string;
  packageName?: string;
  version?: string;
  configuredVersion?: string;
  counts: PluginResourceCounts;
  resources: PluginResourceInfo[];
  status: "loaded" | "installed" | "missing" | "disabled";
}

export interface PluginsResponse {
  packages: PluginPackageInfo[];
  totals: PluginResourceCounts;
  diagnostics: PluginDiagnostic[];
  projectResourcesLoaded: boolean;
}
