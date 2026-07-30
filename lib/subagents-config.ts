import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { isMap, parseDocument } from "yaml";

export type SubagentScope = "builtin" | "user" | "project";
export type WritableSubagentScope = Exclude<SubagentScope, "builtin">;
export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

export interface SubagentAgentInput {
  name: string;
  description: string;
  tools?: string[];
  model?: string;
  fallbackModels?: string[];
  thinking?: string | false;
  systemPromptMode?: "append" | "replace";
  inheritProjectContext?: boolean;
  inheritSkills?: boolean;
  skills?: string[];
  async?: boolean;
  timeoutMs?: number;
  body: string;
}

export interface SubagentAgent extends SubagentAgentInput {
  scope: SubagentScope;
  filePath: string;
  readOnly: boolean;
  overridesScope: Exclude<SubagentScope, "project"> | null;
}

export interface SubagentCatalog {
  agents: SubagentAgent[];
  diagnostics: Array<{ filePath: string; error: string }>;
}

export interface SubagentOverride {
  model?: string | false;
  thinking?: string | false;
  disabled?: boolean;
  [key: string]: unknown;
}

export interface SubagentSettings {
  defaultModel?: string;
  defaultThinking?: string;
  disableBuiltins?: boolean;
  agentOverrides: Record<string, SubagentOverride>;
}

export interface SubagentSettingsUpdate {
  defaultModel?: string | null;
  defaultThinking?: string | null;
  disableBuiltins?: boolean | null;
  agentOverrides?: Record<string, {
    model?: string | false | null;
    thinking?: string | false | null;
    disabled?: boolean | null;
  }>;
}

export interface SubagentChain {
  name: string;
  description: string;
  scope: WritableSubagentScope;
  filePath: string;
}

const PI_SDK_AGENT_DIR = ".pi";
const SUBAGENTS_PACKAGE = "pi-subagents";
const AGENT_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const moduleRequire = createRequire(import.meta.url);

function expandHome(value: string): string {
  if (value === "~") return homedir();
  return value.startsWith(`~${sep}`) ? join(homedir(), value.slice(2)) : value;
}

function getAgentDir(): string {
  return process.env.PI_CODING_AGENT_DIR
    ? resolve(expandHome(process.env.PI_CODING_AGENT_DIR))
    : join(homedir(), PI_SDK_AGENT_DIR, "agent");
}

function findProjectRoot(cwd: string): string {
  let current = resolve(cwd);
  while (true) {
    if (existsSync(join(current, PI_SDK_AGENT_DIR)) || existsSync(join(current, ".agents"))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) return resolve(cwd);
    current = parent;
  }
}

function getUserAgentDirs(): { read: string[]; write: string } {
  const configured = process.env.PI_CODING_AGENT_DIR;
  const standard = join(getAgentDir(), "agents");
  if (configured) return { read: [standard], write: standard };

  const compatible = join(homedir(), ".agents");
  return {
    read: [standard, compatible],
    write: existsSync(compatible) ? compatible : standard,
  };
}

function getProjectAgentDirs(cwd: string): { read: string[]; write: string } {
  const projectRoot = findProjectRoot(cwd);
  return {
    read: [join(projectRoot, ".agents"), join(projectRoot, PI_SDK_AGENT_DIR, "agents")],
    write: join(projectRoot, PI_SDK_AGENT_DIR, "agents"),
  };
}

function findPackageRoot(packageName: string): string {
  const packageJsonPath = moduleRequire.resolve
    .paths(packageName)
    ?.map((modulesDir) => join(modulesDir, packageName, "package.json"))
    .find(existsSync);
  if (!packageJsonPath) throw new Error(`找不到 ${packageName}`);
  return dirname(packageJsonPath);
}

function listMarkdownFiles(root: string, discoveryRoot = root): string[] {
  if (!existsSync(root)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const filePath = join(root, entry.name);
    if (entry.isDirectory()) {
      const topLevelDir = relative(discoveryRoot, filePath).split(sep)[0];
      if (basename(discoveryRoot) === ".agents" && topLevelDir === "skills") continue;
      files.push(...listMarkdownFiles(filePath, discoveryRoot));
    }
    else if (entry.isFile() && entry.name.endsWith(".md") && !entry.name.endsWith(".chain.md")) files.push(filePath);
  }
  return files;
}

function splitFrontmatter(content: string): { yaml: string; body: string } {
  const normalized = content.replace(/\r\n/g, "\n");
  const match = normalized.match(/^---\n([\s\S]*?)\n---(?:\n|$)([\s\S]*)$/);
  if (!match) throw new Error("缺少完整的 YAML frontmatter");
  return { yaml: match[1], body: match[2].replace(/^\n/, "").trimEnd() };
}

function asRecord(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(message);
  return value as Record<string, unknown>;
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asStringList(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const items = value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
    return items.length > 0 ? items : [];
  }
  if (typeof value !== "string") return undefined;
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function parseAgentFile(filePath: string, scope: SubagentScope): SubagentAgent {
  const content = readFileSync(filePath, "utf8");
  const { yaml, body } = splitFrontmatter(content);
  const document = parseDocument(yaml);
  if (document.errors.length > 0) throw new Error(document.errors[0].message);
  const frontmatter = asRecord(document.toJS(), "frontmatter 必须是对象");
  const name = asOptionalString(frontmatter.name);
  const description = asOptionalString(frontmatter.description);
  if (!name || !description) throw new Error("name 和 description 都不能为空");

  const thinking = frontmatter.thinking === false || frontmatter.thinking === "false"
    ? false
    : asOptionalString(frontmatter.thinking);
  const systemPromptMode = frontmatter.systemPromptMode === "append"
    ? "append"
    : frontmatter.systemPromptMode === "replace"
      ? "replace"
      : name === "delegate"
        ? "append"
        : "replace";
  const timeoutMs = typeof frontmatter.timeoutMs === "number"
    ? frontmatter.timeoutMs
    : Number(frontmatter.timeoutMs);

  return {
    scope,
    name,
    description,
    tools: asStringList(frontmatter.tools),
    model: asOptionalString(frontmatter.model),
    fallbackModels: asStringList(frontmatter.fallbackModels),
    thinking,
    systemPromptMode,
    inheritProjectContext: frontmatter.inheritProjectContext === undefined
      ? name === "delegate"
      : frontmatter.inheritProjectContext === true || frontmatter.inheritProjectContext === "true",
    inheritSkills: frontmatter.inheritSkills === true || frontmatter.inheritSkills === "true",
    skills: asStringList(frontmatter.skills ?? frontmatter.skill),
    async: frontmatter.async === undefined
      ? undefined
      : frontmatter.async === true || frontmatter.async === "true",
    timeoutMs: Number.isInteger(timeoutMs) && timeoutMs > 0 ? timeoutMs : undefined,
    body,
    filePath,
    readOnly: scope === "builtin",
    overridesScope: null,
  };
}

function loadScope(
  scope: SubagentScope,
  directories: string[],
  diagnostics: SubagentCatalog["diagnostics"],
): SubagentAgent[] {
  const agents = new Map<string, SubagentAgent>();
  for (const directory of directories) {
    for (const filePath of listMarkdownFiles(directory)) {
      try {
        const agent = parseAgentFile(filePath, scope);
        agents.set(agent.name, agent);
      } catch (error) {
        diagnostics.push({
          filePath,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
  return [...agents.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function listSubagentAgents(cwd: string): SubagentCatalog {
  const diagnostics: SubagentCatalog["diagnostics"] = [];
  const builtin = loadScope("builtin", [join(findPackageRoot(SUBAGENTS_PACKAGE), "agents")], diagnostics);
  const user = loadScope("user", getUserAgentDirs().read, diagnostics);
  const project = loadScope("project", getProjectAgentDirs(cwd).read, diagnostics);
  const builtinNames = new Set(builtin.map((agent) => agent.name));
  const userNames = new Set(user.map((agent) => agent.name));

  for (const agent of user) {
    agent.overridesScope = builtinNames.has(agent.name) ? "builtin" : null;
  }
  for (const agent of project) {
    agent.overridesScope = userNames.has(agent.name)
      ? "user"
      : builtinNames.has(agent.name)
        ? "builtin"
        : null;
  }
  return { agents: [...builtin, ...user, ...project], diagnostics };
}

function assertWritableScope(scope: SubagentScope): asserts scope is WritableSubagentScope {
  if (scope === "builtin") throw new Error("内置 agent 只读");
}

function assertValidAgentInput(input: SubagentAgentInput): void {
  if (!AGENT_NAME_PATTERN.test(input.name)) throw new Error("agent 名称只能包含字母、数字、点、下划线和连字符");
  if (!input.description.trim()) throw new Error("description 不能为空");
  if (input.timeoutMs !== undefined && (!Number.isInteger(input.timeoutMs) || input.timeoutMs <= 0)) {
    throw new Error("timeoutMs 必须是正整数");
  }
}

function assertInside(filePath: string, roots: string[]): void {
  const absolute = resolve(filePath);
  if (!roots.some((root) => {
    const pathFromRoot = relative(resolve(root), absolute);
    return pathFromRoot === "" || (!pathFromRoot.startsWith(`..${sep}`) && pathFromRoot !== ".." && !isAbsolute(pathFromRoot));
  })) {
    throw new Error("agent 文件不在允许目录内");
  }
}

function findAgent(cwd: string, scope: SubagentScope, name: string): SubagentAgent | undefined {
  return listSubagentAgents(cwd).agents.find((agent) => agent.scope === scope && agent.name === name);
}

export function readSubagentAgent(cwd: string, scope: SubagentScope, name: string): SubagentAgent {
  const agent = findAgent(cwd, scope, name);
  if (!agent) throw new Error(`找不到 ${scope} agent：${name}`);
  return agent;
}

function setOptional(
  document: ReturnType<typeof parseDocument>,
  key: string,
  value: string | boolean | number | undefined,
): void {
  if (value === undefined || value === "") document.delete(key);
  else document.set(key, value);
}

function setList(
  document: ReturnType<typeof parseDocument>,
  key: string,
  value: string[] | undefined,
): void {
  if (value === undefined) document.delete(key);
  else document.set(key, value.join(", "));
}

function serializeAgent(input: SubagentAgentInput, previousContent?: string): string {
  const previous = previousContent ? splitFrontmatter(previousContent) : null;
  const document = parseDocument(previous?.yaml ?? "__placeholder: true\n");
  if (document.errors.length > 0) throw new Error(document.errors[0].message);
  document.delete("__placeholder");
  if (isMap(document.contents)) document.contents.flow = false;

  document.set("name", input.name);
  document.set("description", input.description.trim());
  setList(document, "tools", input.tools);
  setOptional(document, "model", input.model?.trim());
  setList(document, "fallbackModels", input.fallbackModels);
  setOptional(document, "thinking", input.thinking);
  document.set("systemPromptMode", input.systemPromptMode ?? "replace");
  document.set("inheritProjectContext", input.inheritProjectContext ?? false);
  document.set("inheritSkills", input.inheritSkills ?? false);
  setList(document, "skills", input.skills);
  document.delete("skill");
  setOptional(document, "async", input.async);
  setOptional(document, "timeoutMs", input.timeoutMs);

  return `---\n${document.toString({ lineWidth: 0 }).trimEnd()}\n---\n\n${input.body.trimEnd()}\n`;
}

function atomicWrite(filePath: string, content: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
  const tempPath = join(dirname(filePath), `.${basename(filePath)}.${process.pid}.${randomUUID()}.tmp`);
  try {
    writeFileSync(tempPath, content, "utf8");
    renameSync(tempPath, filePath);
  } catch (error) {
    rmSync(tempPath, { force: true });
    throw error;
  }
}

function writableAgentDirs(cwd: string, scope: WritableSubagentScope): { read: string[]; write: string } {
  return scope === "user" ? getUserAgentDirs() : getProjectAgentDirs(cwd);
}

export function createSubagentAgent(
  cwd: string,
  scope: WritableSubagentScope,
  input: SubagentAgentInput,
): SubagentAgent {
  assertValidAgentInput(input);
  if (findAgent(cwd, scope, input.name)) throw new Error(`${scope} agent 已存在：${input.name}`);
  const filePath = join(writableAgentDirs(cwd, scope).write, `${input.name}.md`);
  atomicWrite(filePath, serializeAgent(input));
  return readSubagentAgent(cwd, scope, input.name);
}

export function updateSubagentAgent(
  cwd: string,
  scope: WritableSubagentScope,
  name: string,
  input: SubagentAgentInput,
): SubagentAgent {
  assertValidAgentInput(input);
  if (input.name !== name) throw new Error("编辑时不能修改 agent 名称");
  const existing = readSubagentAgent(cwd, scope, name);
  assertWritableScope(existing.scope);
  const directories = writableAgentDirs(cwd, scope);
  assertInside(existing.filePath, directories.read);
  atomicWrite(existing.filePath, serializeAgent(input, readFileSync(existing.filePath, "utf8")));
  return readSubagentAgent(cwd, scope, name);
}

export function deleteSubagentAgent(cwd: string, scope: WritableSubagentScope, name: string): void {
  const existing = readSubagentAgent(cwd, scope, name);
  const directories = writableAgentDirs(cwd, scope);
  assertInside(existing.filePath, directories.read);
  if (lstatSync(existing.filePath).isSymbolicLink()) throw new Error("不删除符号链接");
  unlinkSync(existing.filePath);
}

function settingsPath(cwd: string, scope: WritableSubagentScope): string {
  return scope === "user"
    ? join(getAgentDir(), "settings.json")
    : join(findProjectRoot(cwd), PI_SDK_AGENT_DIR, "settings.json");
}

function readJsonObject(filePath: string): Record<string, unknown> {
  if (!existsSync(filePath)) return {};
  return asRecord(JSON.parse(readFileSync(filePath, "utf8")), "settings.json 必须是对象");
}

export function readSubagentSettings(cwd: string, scope: WritableSubagentScope): SubagentSettings {
  const settings = readJsonObject(settingsPath(cwd, scope));
  const subagents = settings.subagents && typeof settings.subagents === "object" && !Array.isArray(settings.subagents)
    ? settings.subagents as Record<string, unknown>
    : {};
  const overrides = subagents.agentOverrides && typeof subagents.agentOverrides === "object" && !Array.isArray(subagents.agentOverrides)
    ? subagents.agentOverrides as Record<string, SubagentOverride>
    : {};
  return {
    defaultModel: asOptionalString(subagents.defaultModel),
    defaultThinking: asOptionalString(subagents.defaultThinking),
    disableBuiltins: typeof subagents.disableBuiltins === "boolean" ? subagents.disableBuiltins : undefined,
    agentOverrides: structuredClone(overrides),
  };
}

function applyNullableField(
  target: Record<string, unknown>,
  key: string,
  value: unknown,
): void {
  if (value === null || value === "") delete target[key];
  else if (value !== undefined) target[key] = value;
}

export function updateSubagentSettings(
  cwd: string,
  scope: WritableSubagentScope,
  update: SubagentSettingsUpdate,
): SubagentSettings {
  const filePath = settingsPath(cwd, scope);
  const settings = readJsonObject(filePath);
  const subagents = settings.subagents && typeof settings.subagents === "object" && !Array.isArray(settings.subagents)
    ? { ...settings.subagents as Record<string, unknown> }
    : {};

  if ("defaultModel" in update) applyNullableField(subagents, "defaultModel", update.defaultModel?.trim() ?? update.defaultModel);
  if ("defaultThinking" in update) applyNullableField(subagents, "defaultThinking", update.defaultThinking?.trim() ?? update.defaultThinking);
  if ("disableBuiltins" in update) applyNullableField(subagents, "disableBuiltins", update.disableBuiltins);

  if (update.agentOverrides) {
    const overrides = subagents.agentOverrides && typeof subagents.agentOverrides === "object" && !Array.isArray(subagents.agentOverrides)
      ? { ...subagents.agentOverrides as Record<string, unknown> }
      : {};
    for (const [name, changedFields] of Object.entries(update.agentOverrides)) {
      if (!AGENT_NAME_PATTERN.test(name)) throw new Error(`无效的 agent 名称：${name}`);
      const current = overrides[name] && typeof overrides[name] === "object" && !Array.isArray(overrides[name])
        ? { ...overrides[name] as Record<string, unknown> }
        : {};
      for (const key of ["model", "thinking", "disabled"] as const) {
        if (key in changedFields) applyNullableField(current, key, changedFields[key]);
      }
      if (Object.keys(current).length === 0) delete overrides[name];
      else overrides[name] = current;
    }
    if (Object.keys(overrides).length === 0) delete subagents.agentOverrides;
    else subagents.agentOverrides = overrides;
  }

  if (Object.keys(subagents).length === 0) delete settings.subagents;
  else settings.subagents = subagents;
  atomicWrite(filePath, `${JSON.stringify(settings, null, 2)}\n`);
  return readSubagentSettings(cwd, scope);
}

function firstDescription(content: string): string {
  try {
    const parsed = JSON.parse(content) as unknown;
    const description = asOptionalString(asRecord(parsed, "chain JSON 必须是对象").description);
    if (description) return description;
  } catch {
    // 不是 JSON 时继续按 Markdown 读取。
  }
  try {
    const { yaml, body } = splitFrontmatter(content);
    const document = parseDocument(yaml);
    const frontmatter = document.toJS() as Record<string, unknown> | null;
    const description = asOptionalString(frontmatter?.description);
    if (description) return description;
    return body.split("\n").map((line) => line.trim()).find(Boolean)?.replace(/^#+\s*/, "") ?? "";
  } catch {
    return content.split("\n").map((line) => line.trim()).find(Boolean)?.replace(/^#+\s*/, "") ?? "";
  }
}

export function listSubagentChains(cwd: string): SubagentChain[] {
  const roots: Array<{ scope: WritableSubagentScope; dir: string }> = [
    { scope: "user", dir: join(getAgentDir(), "chains") },
    { scope: "project", dir: join(findProjectRoot(cwd), PI_SDK_AGENT_DIR, "chains") },
  ];
  const chains: SubagentChain[] = [];
  for (const { scope, dir } of roots) {
    if (!existsSync(dir)) continue;
    for (const filePath of listChainFiles(dir)) {
      const content = readFileSync(filePath, "utf8");
      const fileName = basename(filePath).replace(/\.chain\.(?:md|json)$/, "");
      chains.push({ name: fileName, description: firstDescription(content), scope, filePath });
    }
  }
  return chains.sort((a, b) => a.scope.localeCompare(b.scope) || a.name.localeCompare(b.name));
}

function listChainFiles(root: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const filePath = join(root, entry.name);
    if (entry.isDirectory()) files.push(...listChainFiles(filePath));
    else if (entry.isFile() && /\.chain\.(?:md|json)$/.test(entry.name)) files.push(filePath);
  }
  return files;
}

export function parseScope(value: unknown): WritableSubagentScope {
  if (value === "user" || value === "project") return value;
  throw new Error("scope 必须是 user 或 project");
}

export function parseAgentScope(value: unknown): SubagentScope {
  if (value === "builtin" || value === "user" || value === "project") return value;
  throw new Error("scope 必须是 builtin、user 或 project");
}

export function parseCommaList(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}
