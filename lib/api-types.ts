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
  isGit: boolean;
  isTopLevel: boolean;
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
}

export interface ApiKeyProviderInfo {
  id: string;
  displayName: string;
  configured: boolean;
  source?: string;
  modelCount: number;
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
