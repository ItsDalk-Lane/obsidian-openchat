const { app, BrowserWindow, Menu, shell, dialog, ipcMain, nativeTheme } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const http = require("http");
const fs = require("fs");

const PORT = process.env.PI_WEB_PORT || "30141";
const HOSTNAME = "127.0.0.1";
const SERVER_URL = `http://${HOSTNAME}:${PORT}`;

let mainWindow = null;
let nextServer = null;

// ─── Logging (file only — no stdout, avoids EPIPE in detached mode) ──
// In packaged builds __dirname lives inside the (read-only) app bundle,
// so logs go to the OS-appropriate user logs directory instead.
const logDir = app.isPackaged
  ? app.getPath("logs")
  : path.join(__dirname, "..", "logs");
if (!fs.existsSync(logDir)) {
  try { fs.mkdirSync(logDir, { recursive: true }); } catch { /* ignore */ }
}
const logFile = path.join(logDir, "pi-web-desktop.log");
const logStream = fs.createWriteStream(logFile, { flags: "a" });
// Prevent the stream from crashing on errors
logStream.on("error", () => { /* swallow */ });

function log(msg) {
  try {
    logStream.write(`[${new Date().toISOString()}] ${msg}\n`);
  } catch { /* ignore */ }
}

// ─── Server lifecycle ───────────────────────────────────────

function waitForServer(maxRetries = 120, interval = 500) {
  return new Promise((resolve, reject) => {
    let retries = 0;
    const check = () => {
      // Each attempt must settle exactly once: req.destroy() after a timeout
      // also emits "error", which used to double-count retries and spawn
      // duplicate check chains, burning all 60 retries in ~19 seconds.
      let settled = false;
      const fail = () => {
        if (settled) return;
        settled = true;
        if (++retries >= maxRetries) {
          reject(new Error(`Server not reachable after ${maxRetries} retries`));
        } else {
          setTimeout(check, interval);
        }
      };
      const req = http.get(SERVER_URL, (res) => {
        if (settled) return;
        settled = true;
        res.resume();
        resolve();
      });
      req.once("error", fail);
      // Generous timeout: cold-start first hits initialize middleware/page
      // modules and can exceed 3s on a busy machine even though the server
      // is up and healthy.
      req.setTimeout(8000, () => {
        req.destroy();
        fail();
      });
    };
    check();
  });
}

function startNextServer() {
  const pkgDir = path.join(__dirname, "..");
  let nextBin;
  try {
    nextBin = require.resolve("next/dist/bin/next", { paths: [pkgDir] });
  } catch {
    try {
      const nextPkg = require.resolve("next/package.json", { paths: [pkgDir] });
      nextBin = path.join(path.dirname(nextPkg), "dist", "bin", "next");
    } catch {
      nextBin = path.join(pkgDir, "node_modules", "next", "dist", "bin", "next");
    }
  }

  log(`Starting Next.js server on ${HOSTNAME}:${PORT}...`);

  nextServer = spawn(process.execPath, [nextBin, "start", "-p", String(PORT), "-H", HOSTNAME], {
    cwd: pkgDir,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      // In packaged builds process.execPath is the Electron binary, not Node;
      // this makes the child process run the next CLI as plain Node.js.
      ELECTRON_RUN_AS_NODE: "1",
      PORT: String(PORT),
      HOSTNAME: HOSTNAME,
      PI_WEB_NO_OPEN: "1",
    },
    windowsHide: true,
  });

  nextServer.stdout.on("data", (chunk) => { try { logStream.write(`[next] ${chunk}`); } catch {} });
  nextServer.stderr.on("data", (chunk) => { try { logStream.write(`[next] ${chunk}`); } catch {} });
  nextServer.on("exit", (code) => log(`Next.js server exited with code ${code}`));
}

// ─── App menu (Chinese) ─────────────────────────────────────

function buildAppMenu() {
  const isMac = process.platform === "darwin";

  const template = [
    // macOS 应用菜单
    ...(isMac
      ? [{
          label: "Pi Web Desktop",
          submenu: [
            { label: "关于 Pi Web Desktop", role: "about" },
            { type: "separator" },
            { label: "服务", role: "services" },
            { type: "separator" },
            { label: "隐藏 Pi Web Desktop", role: "hide" },
            { label: "隐藏其他", role: "hideOthers" },
            { label: "全部显示", role: "unhide" },
            { type: "separator" },
            { label: "退出", role: "quit" },
          ],
        }]
      : []),
    // 文件
    {
      label: "文件",
      submenu: [
        isMac ? { label: "关闭窗口", role: "close" } : { label: "退出", role: "quit" },
      ],
    },
    // 编辑
    {
      label: "编辑",
      submenu: [
        { label: "撤销", role: "undo" },
        { label: "重做", role: "redo" },
        { type: "separator" },
        { label: "剪切", role: "cut" },
        { label: "复制", role: "copy" },
        { label: "粘贴", role: "paste" },
        ...(isMac
          ? [
              { label: "粘贴并匹配样式", role: "pasteAndMatchStyle" },
              { label: "删除", role: "delete" },
              { label: "全选", role: "selectAll" },
              { type: "separator" },
              { label: "查找", submenu: [
                { label: "查找", accelerator: "CmdOrCtrl+F", click: () => mainWindow?.webContents.send("menu:find") },
                { label: "查找下一个", accelerator: "CmdOrCtrl+G", click: () => mainWindow?.webContents.send("menu:find-next") },
              ] },
            ]
          : [
              { label: "删除", role: "delete" },
              { type: "separator" },
              { label: "全选", role: "selectAll" },
            ]),
      ],
    },
    // 视图
    {
      label: "视图",
      submenu: [
        { label: "重新加载", role: "reload", accelerator: "CmdOrCtrl+R" },
        { label: "强制重新加载", role: "forceReload", accelerator: "CmdOrCtrl+Shift+R" },
        { label: "切换开发者工具", role: "toggleDevTools", accelerator: "CmdOrCtrl+Shift+I" },
        { type: "separator" },
        { label: "实际大小", role: "resetZoom", accelerator: "CmdOrCtrl+0" },
        { label: "放大", role: "zoomIn", accelerator: "CmdOrCtrl+=" },
        { label: "缩小", role: "zoomOut", accelerator: "CmdOrCtrl+-" },
        { type: "separator" },
        { label: "切换全屏", role: "togglefullscreen", accelerator: "F11" },
      ],
    },
    // 窗口
    {
      label: "窗口",
      submenu: [
        { label: "最小化", role: "minimize" },
        { label: "缩放", role: "zoom" },
        ...(isMac
          ? [
              { type: "separator" },
              { label: "前置全部窗口", role: "front" },
              { type: "separator" },
              { label: "窗口", role: "window" },
            ]
          : [
              { label: "关闭", role: "close" },
            ]),
      ],
    },
    // 帮助
    {
      label: "帮助",
      role: "help",
      submenu: [
        { label: "访问 Pi 项目", click: () => shell.openExternal("https://github.com/earendil-works/pi") },
        { label: "访问 pi-web 项目", click: () => shell.openExternal("https://github.com/ItsDalk-Lane/pi-web") },
        { type: "separator" },
        { label: "关于", click: () => {
          if (mainWindow) {
            mainWindow.webContents.executeJavaScript(
              `alert("Pi Web Desktop\\n\\n将 Pi 编码代理的 Web 界面打包为桌面应用\\n\\n基于 agegr/pi-web 的维护分支")`
            );
          }
        } },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ─── Window management ──────────────────────────────────────

// Renderer reports the in-app theme so the native title bar matches it.
ipcMain.on("pi-web:set-theme", (_event, theme) => {
  if (theme === "dark" || theme === "light") {
    nativeTheme.themeSource = theme;
  }
});

// Native directory picker for the sidebar's custom working directory flow.
ipcMain.handle("pi-web:select-directory", async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory", "createDirectory"],
  });
  return result.canceled ? null : (result.filePaths[0] ?? null);
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: "Pi Web Desktop",
    backgroundColor: "#1a1a2e",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.js"),
    },
    show: false,
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.on("closed", () => { mainWindow = null; });
  // Show a lightweight loading page immediately; the real app URL is loaded
  // once the Next.js server answers the health check.
  mainWindow.loadFile(path.join(__dirname, "loading.html"));
}

function loadAppUrl() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.loadURL(SERVER_URL);
  }
}

// ─── App lifecycle ──────────────────────────────────────────

// Single instance lock - prevent multiple Electron instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  log("Another instance is already running, exiting.");
  app.quit();
} else {
  app.on("second-instance", () => {
    // Someone tried to run a second instance, focus existing window instead
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

app.whenReady().then(async () => {
  buildAppMenu();
  // Open the window first so the user gets immediate visual feedback
  // (loading page) instead of staring at nothing while the server boots.
  // This also makes the single-instance "second launch focuses window"
  // path work during startup.
  createWindow();
  startNextServer();
  try {
    log("Waiting for Next.js server...");
    await waitForServer();
    log("Server is ready, loading app...");
    loadAppUrl();
  } catch (err) {
    // The health check is stricter than reality: the server has been seen
    // serving requests even after every probe "failed" on a loaded machine.
    // Try loading the app anyway before giving up.
    log(`Health check failed: ${err.message}; loading app URL anyway`);
    loadAppUrl();
  }
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (nextServer) {
    log("Shutting down Next.js server...");
    nextServer.kill("SIGTERM");
    nextServer = null;
  }
  logStream.end();
});
} // end single-instance else block

// Suppress stdout/stderr EPIPE errors in detached mode
process.stdout?.on?.("error", () => {});
process.stderr?.on?.("error", () => {});
process.on("uncaughtException", (err) => {
  // Only log to file, never to stdout
  try { logStream.write(`[uncaught] ${err.stack || err.message}\n`); } catch {}
});
