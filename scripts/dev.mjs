import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    host: { type: "string" },
    port: { type: "string" },
    "api-port": { type: "string" },
  },
  strict: true,
});

function readPort(value, label) {
  const port = Number.parseInt(value, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`${label} 端口无效：${value}`);
  }
  return port;
}

const host = values.host ?? "127.0.0.1";
const webPort = readPort(values.port ?? process.env.PI_WEB_DEV_PORT ?? "5173", "页面服务");
const apiPort = readPort(values["api-port"] ?? process.env.PI_WEB_PORT ?? "30141", "接口服务");

if (webPort === apiPort) {
  throw new Error("页面服务和接口服务不能使用同一个端口");
}

const serverLauncher = fileURLToPath(new URL("../server/launcher.cjs", import.meta.url));
const viteLauncher = fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url));
const children = new Set();
let shuttingDown = false;
let finalExitCode = 0;

function start(command, args, env) {
  const child = spawn(command, args, {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    stdio: "inherit",
    env,
  });
  children.add(child);
  return child;
}

function finishIfStopped() {
  if (shuttingDown && children.size === 0) {
    process.exit(finalExitCode);
  }
}

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  finalExitCode = exitCode;
  for (const child of children) {
    child.kill("SIGTERM");
  }
  const forceExit = setTimeout(() => process.exit(finalExitCode), 5_000);
  forceExit.unref();
  finishIfStopped();
}

const server = start(process.execPath, [serverLauncher], {
  ...process.env,
  PI_WEB_HOSTNAME: "127.0.0.1",
  PI_WEB_PORT: String(apiPort),
  PI_WEB_NO_OPEN: "1",
});

const vite = start(process.execPath, [
  viteLauncher,
  "--host",
  host,
  "--port",
  String(webPort),
  "--strictPort",
], {
  ...process.env,
  PI_WEB_API_PORT: String(apiPort),
});

for (const [name, child] of [["接口服务", server], ["页面服务", vite]]) {
  child.on("error", (error) => {
    console.error(`${name}启动失败：${error.message}`);
    shutdown(1);
  });
  child.on("exit", (code, signal) => {
    children.delete(child);
    if (!shuttingDown) {
      const reason = signal ? `信号 ${signal}` : `退出码 ${code ?? 1}`;
      console.error(`${name}意外退出：${reason}`);
      shutdown(code ?? 1);
    }
    finishIfStopped();
  });
}

process.once("SIGINT", () => shutdown(0));
process.once("SIGTERM", () => shutdown(0));
