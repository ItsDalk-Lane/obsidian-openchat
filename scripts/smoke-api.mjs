import assert from "node:assert/strict";
import { once } from "node:events";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const baseUrl = "http://127.0.0.1:30141";
const smokeRoot = await mkdtemp(join(tmpdir(), "pi-web-vite-smoke-"));
const dataDir = join(smokeRoot, "data");
const agentDir = join(smokeRoot, "agent");
const workspaceDir = join(smokeRoot, "workspace");
await Promise.all([
  mkdir(dataDir, { recursive: true }),
  mkdir(agentDir, { recursive: true }),
  mkdir(workspaceDir, { recursive: true }),
]);
await writeFile(join(workspaceDir, "fixture.txt"), "vite-server-smoke\n", "utf8");

const server = spawn(process.execPath, [join(projectRoot, "server/launcher.cjs")], {
  cwd: projectRoot,
  env: {
    ...process.env,
    PI_CODING_AGENT_DIR: agentDir,
    PI_WEB_DATA_DIR: dataDir,
    PI_WEB_HOSTNAME: "127.0.0.1",
    PI_WEB_PORT: "30141",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let serverOutput = "";
server.stdout.on("data", (chunk) => {
  serverOutput += chunk.toString();
});
server.stderr.on("data", (chunk) => {
  serverOutput += chunk.toString();
});

const delay = (milliseconds) => new Promise((resolveDelay) => {
  setTimeout(resolveDelay, milliseconds);
});

async function waitForServer() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (server.exitCode !== null) {
      throw new Error(`Server exited before becoming ready:\n${serverOutput}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/home`);
      if (response.status === 200) return;
    } catch {
      // 服务尚未开始监听，继续等下一轮。
    }
    await delay(100);
  }
  throw new Error(`Server did not become ready:\n${serverOutput}`);
}

async function requestJson(pathname, init, expectedStatus = 200) {
  const response = await fetch(`${baseUrl}${pathname}`, init);
  const text = await response.text();
  assert.equal(response.status, expectedStatus, `${pathname}: ${text}`);
  try {
    return JSON.parse(text);
  } catch {
    assert.fail(`${pathname} did not return JSON: ${text}`);
  }
}

async function readFirstSseFrame(pathname) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  let reader;
  try {
    const response = await fetch(`${baseUrl}${pathname}`, { signal: controller.signal });
    assert.equal(response.status, 200, `${pathname} returned ${response.status}`);
    assert.match(response.headers.get("content-type") ?? "", /^text\/event-stream\b/);
    assert.ok(response.body, `${pathname} has no response body`);
    reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (!buffer.includes("\n\n")) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
    }
    const frame = buffer.split("\n\n", 1)[0];
    assert.ok(frame.includes("data:"), `${pathname} first frame is not data: ${frame}`);
    return frame;
  } finally {
    clearTimeout(timeout);
    controller.abort();
    await reader?.cancel().catch(() => {});
  }
}

function encodeAbsolutePath(filePath) {
  return filePath
    .replaceAll("\\", "/")
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
}

let passed = 0;
async function check(name, operation) {
  await operation();
  passed += 1;
  console.log(`PASS ${name}`);
}

async function stopServer() {
  if (server.exitCode !== null) return;
  const exited = once(server, "exit");
  server.kill("SIGTERM");
  const stopped = await Promise.race([
    exited.then(() => true),
    delay(5_000).then(() => false),
  ]);
  if (!stopped && server.exitCode === null) {
    server.kill("SIGKILL");
    await once(server, "exit");
  }
}

try {
  await waitForServer();

  await check("67-route inventory matches server mirror", async () => {
    const inventory = (await readFile(join(projectRoot, "scripts/route-inventory.txt"), "utf8"))
      .split("\n")
      .filter(Boolean);
    assert.equal(inventory.length, 69);
    await Promise.all(inventory.map((appPath) => access(join(
      projectRoot,
      appPath.replace(/^app\//, "server/"),
    ))));
  });

  await check("GET /api/sessions", async () => {
    const body = await requestJson("/api/sessions");
    assert.ok(Array.isArray(body.sessions));
  });

  await check("POST /api/cwd/validate", async () => {
    const body = await requestJson("/api/cwd/validate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cwd: workspaceDir }),
    });
    assert.equal(body.cwd, workspaceDir);
  });

  const cwdQuery = encodeURIComponent(workspaceDir);
  await check("GET /api/models", async () => {
    const body = await requestJson(`/api/models?cwd=${cwdQuery}`);
    assert.equal(typeof body.models, "object");
    assert.ok(Array.isArray(body.modelList));
  });

  await check("GET /api/mcp", async () => {
    const body = await requestJson(`/api/mcp?cwd=${cwdQuery}`);
    assert.ok(Array.isArray(body.servers));
  });

  await check("GET /api/skills", async () => {
    const body = await requestJson(`/api/skills?cwd=${cwdQuery}`);
    assert.ok(Array.isArray(body.skills));
  });

  await check("GET /api/files path", async () => {
    const filePath = encodeAbsolutePath(join(workspaceDir, "fixture.txt"));
    const body = await requestJson(`/api/files/${filePath}?type=read`);
    assert.equal(body.content, "vite-server-smoke\n");
  });

  await check("GET /api/home", async () => {
    const body = await requestJson("/api/home");
    assert.equal(typeof body.home, "string");
  });

  await check("GET /api/capabilities", async () => {
    const body = await requestJson("/api/capabilities");
    assert.ok(Array.isArray(body.capabilities));
  });

  await check("GET /api/runtimes", async () => {
    const body = await requestJson("/api/runtimes");
    assert.ok(Array.isArray(body.runtimes));
  });

  let sessionId = "";
  await check("POST /api/agent/new", async () => {
    const body = await requestJson("/api/agent/new", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        cwd: workspaceDir,
        toolNames: [],
        type: "ensure_session",
      }),
    });
    assert.equal(body.success, true);
    assert.equal(typeof body.sessionId, "string");
    sessionId = body.sessionId;
  });

  await check("GET /api/agent/[id]", async () => {
    const body = await requestJson(`/api/agent/${encodeURIComponent(sessionId)}`);
    assert.equal(body.running, true);
    assert.equal(body.state.sessionId, sessionId);
  });

  await check("SSE /api/agent/running/events", async () => {
    const frame = await readFirstSseFrame("/api/agent/running/events");
    assert.match(frame, /"type":"running"/);
  });

  await check("SSE /api/agent/[id]/events", async () => {
    const frame = await readFirstSseFrame(`/api/agent/${encodeURIComponent(sessionId)}/events`);
    assert.match(frame, /"type":"transport.connected"/);
  });

  await check("SSE /api/auth/login/[provider]", async () => {
    const frame = await readFirstSseFrame("/api/auth/login/__smoke_unknown__");
    assert.match(frame, /"type":"error"/);
  });

  console.log(`SMOKE PASS ${passed} checks; 67 routes covered`);
} catch (error) {
  console.error(`SMOKE FAIL after ${passed} checks`);
  console.error(error);
  if (serverOutput) console.error(`SERVER OUTPUT\n${serverOutput}`);
  process.exitCode = 1;
} finally {
  await stopServer();
  await rm(smokeRoot, { recursive: true, force: true });
}
