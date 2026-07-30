import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { parseDocument } from "yaml";
import { piSubagentsSpec } from "./bundled/subagents.ts";
import {
  listSubagentAgents,
  listSubagentChains,
  readSubagentAgent,
  updateSubagentAgent,
  updateSubagentSettings,
} from "./subagents-config.ts";

const PI_BINARY_ENV = "PI_SUBAGENT_PI_BINARY";

test("subagents setup points the binary environment variable at an existing SDK file", () => {
  const previous = process.env[PI_BINARY_ENV];
  delete process.env[PI_BINARY_ENV];
  try {
    piSubagentsSpec.setup?.({ cwd: process.cwd() });
    assert.ok(process.env[PI_BINARY_ENV]);
    assert.equal(existsSync(process.env[PI_BINARY_ENV]), true);
  } finally {
    if (previous === undefined) delete process.env[PI_BINARY_ENV];
    else process.env[PI_BINARY_ENV] = previous;
  }
});

test("subagents setup preserves a preconfigured binary", () => {
  const previous = process.env[PI_BINARY_ENV];
  const configured = "/custom/pi";
  process.env[PI_BINARY_ENV] = configured;
  try {
    piSubagentsSpec.setup?.({ cwd: process.cwd() });
    assert.equal(process.env[PI_BINARY_ENV], configured);
  } finally {
    if (previous === undefined) delete process.env[PI_BINARY_ENV];
    else process.env[PI_BINARY_ENV] = previous;
  }
});

function createFixture(t) {
  const root = mkdtempSync(join(tmpdir(), "pi-web-subagents-"));
  const agentDir = join(root, "agent");
  const projectDir = join(root, "project");
  mkdirSync(join(agentDir, "agents"), { recursive: true });
  mkdirSync(join(projectDir, ".pi", "agents"), { recursive: true });
  mkdirSync(join(agentDir, "chains"), { recursive: true });
  mkdirSync(join(projectDir, ".pi", "chains"), { recursive: true });
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;
  t.after(() => {
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
    rmSync(root, { recursive: true, force: true });
  });
  return { root, agentDir, projectDir };
}

function writeAgent(filePath, name, description, extra = "", body = "Prompt") {
  writeFileSync(
    filePath,
    `---\nname: ${name}\ndescription: ${description}\n${extra}---\n\n${body}\n`,
    "utf8",
  );
}

test("agent update preserves unmanaged frontmatter fields", (t) => {
  const { agentDir, projectDir } = createFixture(t);
  const filePath = join(agentDir, "agents", "custom.md");
  writeAgent(
    filePath,
    "custom",
    "Before",
    "tools: read\ncustomFlag: keep-me\npermission:\n  allow:\n    - bash\n",
    "Old prompt",
  );

  const updated = updateSubagentAgent(projectDir, "user", "custom", {
    name: "custom",
    description: "After",
    tools: ["read", "write"],
    model: "provider/model",
    fallbackModels: ["provider/fallback"],
    thinking: "high",
    systemPromptMode: "append",
    inheritProjectContext: true,
    inheritSkills: true,
    skills: ["review"],
    async: true,
    timeoutMs: 120000,
    body: "New prompt",
  });

  assert.equal(updated.description, "After");
  assert.deepEqual(updated.tools, ["read", "write"]);
  assert.equal(updated.body, "New prompt");
  const raw = readFileSync(filePath, "utf8");
  assert.match(raw, /^---\nname: custom\ndescription: After\n/);
  const yaml = raw.match(/^---\n([\s\S]*?)\n---/)?.[1];
  assert.ok(yaml);
  const frontmatter = parseDocument(yaml).toJS();
  assert.equal(frontmatter.customFlag, "keep-me");
  assert.deepEqual(frontmatter.permission, { allow: ["bash"] });
});

test("settings update merges subagents fields without damaging unrelated settings", (t) => {
  const { agentDir, projectDir } = createFixture(t);
  const settingsPath = join(agentDir, "settings.json");
  writeFileSync(settingsPath, JSON.stringify({
    theme: "dark",
    subagents: {
      defaultModel: "old/default",
      defaultThinking: "high",
      preservedOption: { enabled: true },
      agentOverrides: {
        worker: {
          model: "old/worker",
          thinking: "medium",
          tools: ["read"],
        },
        reviewer: { disabled: true },
      },
    },
  }, null, 2));

  const result = updateSubagentSettings(projectDir, "user", {
    defaultModel: "new/default",
    defaultThinking: null,
    disableBuiltins: true,
    agentOverrides: {
      worker: {
        model: "new/worker",
        thinking: null,
        disabled: true,
      },
    },
  });

  assert.equal(result.defaultModel, "new/default");
  assert.equal(result.defaultThinking, undefined);
  assert.equal(result.disableBuiltins, true);
  const saved = JSON.parse(readFileSync(settingsPath, "utf8"));
  assert.equal(saved.theme, "dark");
  assert.deepEqual(saved.subagents.preservedOption, { enabled: true });
  assert.deepEqual(saved.subagents.agentOverrides.worker, {
    model: "new/worker",
    tools: ["read"],
    disabled: true,
  });
  assert.deepEqual(saved.subagents.agentOverrides.reviewer, { disabled: true });
  assert.equal(readdirSync(agentDir).some((name) => name.endsWith(".tmp")), false);
});

test("agent discovery returns builtin, user, and project domains with override metadata", (t) => {
  const { agentDir, projectDir } = createFixture(t);
  writeAgent(join(agentDir, "agents", "worker.md"), "worker", "User worker");
  writeAgent(join(agentDir, "agents", "shared.md"), "shared", "User shared");
  writeAgent(join(projectDir, ".pi", "agents", "shared.md"), "shared", "Project shared");

  const catalog = listSubagentAgents(projectDir);
  assert.equal(catalog.diagnostics.length, 0);
  assert.ok(catalog.agents.some((agent) => agent.scope === "builtin" && agent.name === "worker"));
  assert.equal(readSubagentAgent(projectDir, "user", "worker").overridesScope, "builtin");
  assert.equal(readSubagentAgent(projectDir, "project", "shared").overridesScope, "user");
  assert.deepEqual(
    new Set(catalog.agents.filter((agent) => agent.name === "shared").map((agent) => agent.scope)),
    new Set(["user", "project"]),
  );
});

test("chain discovery lists user and project descriptions without editing files", (t) => {
  const { agentDir, projectDir } = createFixture(t);
  writeFileSync(
    join(agentDir, "chains", "review.chain.md"),
    "---\nname: review\ndescription: User review chain\n---\n\nBody\n",
  );
  writeFileSync(
    join(projectDir, ".pi", "chains", "ship.chain.json"),
    JSON.stringify({ name: "ship", description: "Project ship chain", steps: [] }),
  );

  const chains = listSubagentChains(projectDir);
  assert.deepEqual(
    chains.map(({ name, description, scope }) => ({ name, description, scope })),
    [
      { name: "ship", description: "Project ship chain", scope: "project" },
      { name: "review", description: "User review chain", scope: "user" },
    ],
  );
});
