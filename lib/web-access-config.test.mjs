import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  getWebAccessConfigPath,
  readWebAccessConfig,
  saveWebAccessConfig,
} from "./web-access-config.ts";

test("web access 配置只暴露托管字段并掩码密钥", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "pi-web-access-config-"));
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  const previousXdgDir = process.env.XDG_CONFIG_HOME;
  process.env.PI_CODING_AGENT_DIR = root;
  delete process.env.XDG_CONFIG_HOME;

  t.after(async () => {
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
    if (previousXdgDir === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = previousXdgDir;
    await rm(root, { recursive: true, force: true });
  });

  const path = getWebAccessConfigPath();
  assert.equal(path, join(root, "web-search.json"));
  assert.deepEqual(readWebAccessConfig(), {});

  await writeFile(path, JSON.stringify({
    openaiApiKey: "secret-openai",
    braveApiKey: "$BRAVE_API_KEY",
    provider: "brave",
    searxngBaseUrl: "https://search.example.com",
    workflow: "auto-summary",
    webSearch: { enabled: false, futureOption: "keep" },
    githubClone: { enabled: false },
  }));

  assert.deepEqual(readWebAccessConfig(), {
    openaiApiKey: "***",
    braveApiKey: "***",
    provider: "brave",
    searxngBaseUrl: "https://search.example.com",
    workflow: "auto-summary",
    webSearch: { enabled: false },
  });
});

test("保存会还原掩码并保留未托管配置", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "pi-web-access-preserve-"));
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = root;
  t.after(async () => {
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
    await rm(root, { recursive: true, force: true });
  });

  const path = getWebAccessConfigPath();
  const untouched = {
    githubClone: { enabled: false, maxRepoSizeMB: 321 },
    youtube: { enabled: true },
    webSearch: { enabled: true, futureOption: "keep" },
  };
  await writeFile(path, JSON.stringify({
    openaiApiKey: "keep-this-secret",
    provider: "openai",
    ...untouched,
  }));

  saveWebAccessConfig({
    openaiApiKey: "***",
    provider: "brave",
    webSearch: { enabled: false },
  });

  const saved = JSON.parse(await readFile(path, "utf8"));
  assert.equal(saved.openaiApiKey, "keep-this-secret");
  assert.equal(saved.provider, "brave");
  assert.deepEqual(saved.githubClone, untouched.githubClone);
  assert.deepEqual(saved.youtube, untouched.youtube);
  assert.deepEqual(saved.webSearch, { enabled: false, futureOption: "keep" });
});

test("$VAR 与 !command 始终按字面保存且不会执行", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "pi-web-access-literal-"));
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = root;
  t.after(async () => {
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
    await rm(root, { recursive: true, force: true });
  });

  const marker = join(root, "must-not-exist");
  saveWebAccessConfig({
    braveApiKey: "$HOME",
    exaApiKey: `!touch ${marker}`,
  });

  const saved = JSON.parse(await readFile(getWebAccessConfigPath(), "utf8"));
  assert.equal(saved.braveApiKey, "$HOME");
  assert.equal(saved.exaApiKey, `!touch ${marker}`);
  assert.equal(existsSync(marker), false);
});

test("坏 JSON 返回可定位错误，随后仍可继续执行", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "pi-web-access-invalid-"));
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = root;
  t.after(async () => {
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
    await rm(root, { recursive: true, force: true });
  });

  const path = getWebAccessConfigPath();
  await writeFile(path, "{broken");
  assert.throws(
    () => readWebAccessConfig(),
    (error) => error instanceof Error
      && error.message.includes(path)
      && error.message.includes("解析"),
  );
  assert.equal(existsSync(path), true);
});
