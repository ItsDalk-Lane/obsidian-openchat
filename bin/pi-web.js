#!/usr/bin/env node
"use strict";

const { getUnsupportedNodeVersionMessage, isNodeVersionSupported } = require("./node-version");

if (!isNodeVersionSupported(process.versions.node)) {
  console.error(getUnsupportedNodeVersionMessage(process.versions.node));
  process.exit(1);
}

const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const { parseLaunchOptions } = require("./pi-web-options");

const pkgDir = path.join(__dirname, "..");
const buildIndex = path.join(pkgDir, "web", "dist", "index.html");
const serverLauncher = path.join(pkgDir, "server", "launcher.cjs");

const { port, hostname, openBrowser } = parseLaunchOptions();
const loopbackHostnames = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

if (!fs.existsSync(buildIndex)) {
  console.error("Build artifacts not found. Please report this issue.");
  process.exit(1);
}

if (!loopbackHostnames.has(hostname)) {
  console.warn(
    `Warning: pi-web is listening on ${hostname} without authentication. Only use this on a trusted network.`,
  );
}

// 直接用当前 Node 进程启动独立服务，兼容 npx 与含空格路径。
const child = spawn(process.execPath, [serverLauncher], {
  cwd: pkgDir,
  stdio: ["inherit", "pipe", "inherit"],
  env: {
    ...process.env,
    PI_WEB_HOSTNAME: hostname,
    PI_WEB_PORT: port,
    PI_WEB_NO_OPEN: "1",
  },
});

let browserOpened = false;
const url = `http://${hostname}:${port}`;

child.stdout.on("data", (chunk) => {
  const text = chunk.toString();
  process.stdout.write(text);
  if (openBrowser && !browserOpened && text.includes("Ready")) {
    browserOpened = true;
    const isWindows = process.platform === "win32";
    const isMac = process.platform === "darwin";
    const openCmd = isWindows ? "start" : isMac ? "open" : "xdg-open";
    const opener = spawn(openCmd, [url], {
      shell: isWindows,
      stdio: "ignore",
      detached: true,
    });

    opener.on("error", (error) => {
      console.warn(`Could not open browser automatically: ${error.message}`);
    });

    opener.unref();
  }
});

child.on("exit", (code) => process.exit(code ?? 0));
