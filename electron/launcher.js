#!/usr/bin/env node
"use strict";

/**
 * Launcher script that clears ELECTRON_RUN_AS_NODE before starting Electron.
 *
 * When launched via VBS (start-desktop.vbs), no console window is shown.
 * The launcher spawns Electron in detached mode and exits immediately,
 * so there is no parent process keeping a console alive.
 */

const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

// Resolve the electron binary path
const electronPath = require("electron");

// Build a clean environment without ELECTRON_RUN_AS_NODE
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

// Log file for Electron output (when no console is attached)
const logDir = path.join(__dirname, "..", "logs");
if (!fs.existsSync(logDir)) {
  try { fs.mkdirSync(logDir, { recursive: true }); } catch { /* ignore */ }
}
const logFile = path.join(logDir, "pi-web-desktop.log");
const logStream = fs.createWriteStream(logFile, { flags: "a" });

logStream.write(`\n${"=".repeat(60)}\n[${new Date().toISOString()}] Starting Pi Web Desktop\n`);

// Start Electron detached so it survives the launcher exiting.
// On Windows, detached creates a new process group.
const child = spawn(electronPath, [path.join(__dirname, "main.js")], {
  stdio: ["ignore", "pipe", "pipe"],
  env,
  detached: true,
  windowsHide: false,
});

// Pipe Electron stdout/stderr to log file (not to console)
child.stdout.on("data", (chunk) => {
  logStream.write(chunk);
});

child.stderr.on("data", (chunk) => {
  logStream.write(chunk);
});

// Detach the child so the launcher can exit without killing it
child.unref();

// Give it a moment to spawn, then exit the launcher
setTimeout(() => {
  logStream.write(`[${new Date().toISOString()}] Launcher exiting, Electron PID: ${child.pid}\n`);
  logStream.end();
  process.exit(0);
}, 1000);
