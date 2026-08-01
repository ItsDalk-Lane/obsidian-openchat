const {
  app,
  BrowserWindow,
  Menu,
  shell,
  dialog,
  ipcMain,
  nativeTheme,
  screen,
  Notification,
} = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const http = require("http");
const fs = require("fs");
const {
  DEFAULT_WINDOW_STATE,
  clampWindowState,
  readWindowState,
} = require("./lib/window-state.cjs");
const { shouldSendCompletionNotification } = require("./lib/notification.cjs");

const PORT = process.env.PI_WEB_PORT || "30141";
const HOSTNAME = "127.0.0.1";
const SERVER_URL = `http://${HOSTNAME}:${PORT}`;

let mainWindow = null;
let serverProcess = null;
let completionNotification = null;

const WINDOW_STATE_FILE = "window-state.json";
const WINDOW_STATE_SAVE_DELAY_MS = 300;

// ─── Logging (file only — no stdout, avoids EPIPE in detached mode) ──
// In packaged builds __dirname lives inside the (read-only) app bundle,
// so logs go to the OS-appropriate user logs directory instead.
const logDir = app.isPackaged
  ? path.join(app.getPath("userData"), "logs")
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
      // Stop early when our own server process already died (e.g. the port
      // was taken by a leftover instance) instead of polling a dead server.
      if (serverProcessExited) {
        reject(new Error("Server process exited before becoming ready"));
        return;
      }
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

function startServerProcess() {
  const pkgDir = path.join(__dirname, "..");
  const serverLauncher = path.join(pkgDir, "server", "launcher.cjs");

  log(`Starting server on ${HOSTNAME}:${PORT}...`);

  serverProcess = spawn(process.execPath, [serverLauncher], {
    // 打包产物使用 asar=false，服务端从应用根目录读取静态资源和配置。
    cwd: pkgDir,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      // 打包后当前可执行文件是 Electron，本开关让子进程按普通 Node 运行。
      ELECTRON_RUN_AS_NODE: "1",
      PI_WEB_PORT: String(PORT),
      PI_WEB_HOSTNAME: HOSTNAME,
      PI_WEB_NO_OPEN: "1",
    },
    windowsHide: true,
  });

  serverProcess.stdout.on("data", (chunk) => { try { logStream.write(`[server] ${chunk}`); } catch {} });
  serverProcess.stderr.on("data", (chunk) => { try { logStream.write(`[server] ${chunk}`); } catch {} });
  // Spawn itself can fail asynchronously (e.g. bad cwd). Without a listener
  // this becomes an uncaught exception and the window stays on the loading
  // page forever.
  serverProcess.on("error", (err) => {
    log(`Failed to spawn server: ${err.message}`);
    serverProcessExited = true;
  });
  serverProcess.on("exit", (code) => {
    log(`Server exited with code ${code}`);
    serverProcessExited = true;
  });
}

// True once the spawned server process died (or failed to spawn). Used to
// stop the health-check loop early instead of polling a dead server.
let serverProcessExited = false;

// ─── Auto updates (electron-updater + GitHub Releases) ─────
// Packaged builds check GitHub Releases for a newer version, download it in
// the background and offer a restart once ready. Dev runs skip this entirely.
let autoUpdater = null;
// Distinguishes menu-triggered checks (which report "up to date"/failures to
// the user) from the silent background check at startup.
let manualUpdateCheck = false;
let lastLoggedProgress = -1;

if (app.isPackaged) {
  autoUpdater = require("electron-updater").autoUpdater;
  autoUpdater.autoDownload = true;
  // Lock the channel: a prerelease-style version (e.g. "0.8.1-fork.0") would
  // otherwise derive a bogus "fork" channel and never match latest.yml.
  autoUpdater.channel = "latest";
  const stringify = (msg) => (typeof msg === "string" ? msg : JSON.stringify(msg));
  autoUpdater.logger = {
    info: (m) => log(`[updater] ${stringify(m)}`),
    warn: (m) => log(`[updater] warn: ${stringify(m)}`),
    error: (m) => log(`[updater] error: ${stringify(m)}`),
    debug: () => {},
  };

  autoUpdater.on("update-available", (info) => {
    log(`[updater] update available: ${info.version}, downloading in background`);
  });
  autoUpdater.on("update-not-available", () => {
    log("[updater] already up to date");
    if (manualUpdateCheck && mainWindow && !mainWindow.isDestroyed()) {
      dialog.showMessageBox(mainWindow, {
        type: "info",
        title: "检查更新",
        message: `当前已是最新版本 (${app.getVersion()})`,
        buttons: ["确定"],
      });
    }
    manualUpdateCheck = false;
  });
  autoUpdater.on("download-progress", (p) => {
    // Throttle: this event fires very frequently.
    const step = Math.floor(p.percent / 10) * 10;
    if (step !== lastLoggedProgress) {
      lastLoggedProgress = step;
      log(`[updater] download progress: ${step}%`);
    }
  });
  autoUpdater.on("update-downloaded", (info) => {
    log(`[updater] update downloaded: ${info.version}`);
    manualUpdateCheck = false;
    if (!mainWindow || mainWindow.isDestroyed()) return;
    dialog
      .showMessageBox(mainWindow, {
        type: "info",
        title: "更新就绪",
        message: `新版本 ${info.version} 已下载完成`,
        detail: "立即重启以完成更新?(当前进行中的会话会被中断)",
        buttons: ["立即重启", "稍后"],
        defaultId: 0,
        cancelId: 1,
      })
      .then(({ response }) => {
        if (response === 0) autoUpdater.quitAndInstall();
      });
  });
  autoUpdater.on("error", (err) => {
    // Background check failures (offline, no release yet, ...) stay silent.
    log(`[updater] error: ${err.message}`);
    if (manualUpdateCheck && mainWindow && !mainWindow.isDestroyed()) {
      dialog.showMessageBox(mainWindow, {
        type: "warning",
        title: "检查更新",
        message: "检查更新失败",
        detail: err.message,
        buttons: ["确定"],
      });
    }
    manualUpdateCheck = false;
  });
}

function checkForUpdates(manual) {
  if (!autoUpdater) {
    if (manual) {
      dialog.showMessageBox({
        type: "info",
        title: "检查更新",
        message: "开发模式不提供自动更新",
        buttons: ["确定"],
      });
    }
    return;
  }
  manualUpdateCheck = !!manual;
  lastLoggedProgress = -1;
  autoUpdater.checkForUpdates().catch((err) => {
    // The "error" event above handles reporting; this only catches rejections.
    log(`[updater] checkForUpdates rejected: ${err.message}`);
  });
}

// ─── App menu (Chinese) ─────────────────────────────────────

function sendToMainWindow(channel) {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return;
  mainWindow.webContents.send(channel);
}

function focusMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.focus();
}

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
        { label: "新建会话", accelerator: "CmdOrCtrl+N", click: () => sendToMainWindow("menu:new-session") },
        { type: "separator" },
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
        { label: "检查更新", click: () => checkForUpdates(true) },
        { type: "separator" },
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

function getWindowStateFilePath() {
  return path.join(app.getPath("userData"), WINDOW_STATE_FILE);
}

function intersectionArea(bounds, workArea) {
  const width = Math.max(
    0,
    Math.min(bounds.x + bounds.width, workArea.x + workArea.width) - Math.max(bounds.x, workArea.x),
  );
  const height = Math.max(
    0,
    Math.min(bounds.y + bounds.height, workArea.y + workArea.height) - Math.max(bounds.y, workArea.y),
  );
  return width * height;
}

function getRestoredWindowState() {
  const savedState = readWindowState(getWindowStateFilePath(), DEFAULT_WINDOW_STATE);
  const displays = screen.getAllDisplays();
  let targetDisplay = null;
  let largestOverlap = 0;

  for (const display of displays) {
    const overlap = intersectionArea(savedState, display.workArea);
    if (overlap > largestOverlap) {
      largestOverlap = overlap;
      targetDisplay = display;
    }
  }

  // 旧显示器已拔掉时回主屏；合法的负坐标副屏仍会按交叠面积命中。
  const workArea = (targetDisplay ?? screen.getPrimaryDisplay()).workArea;
  return clampWindowState(savedState, workArea, DEFAULT_WINDOW_STATE);
}

function persistWindowState(win) {
  if (win.isDestroyed()) return;
  const bounds = win.getNormalBounds();
  const state = {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    isMaximized: win.isMaximized(),
  };
  const filePath = getWindowStateFilePath();
  const temporaryPath = `${filePath}.${process.pid}.tmp`;

  try {
    fs.writeFileSync(temporaryPath, JSON.stringify(state), { encoding: "utf8", mode: 0o600 });
    fs.renameSync(temporaryPath, filePath);
  } catch (err) {
    log(`Failed to persist window state: ${err.message}`);
    try { fs.unlinkSync(temporaryPath); } catch { /* ignore */ }
  }
}

function normalizeNotificationText(value, maxLength) {
  if (typeof value !== "string") return null;
  const normalized = Array.from(value, (character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127 ? " " : character;
  }).join("").replace(/\s+/g, " ").trim();
  if (normalized.length === 0) return null;
  return normalized.slice(0, maxLength);
}

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

ipcMain.on("pi-web:notify-agent-complete", (event, payload) => {
  if (
    !mainWindow
    || mainWindow.isDestroyed()
    || event.sender !== mainWindow.webContents
    || typeof payload !== "object"
    || payload === null
    || Array.isArray(payload)
  ) {
    return;
  }

  const title = normalizeNotificationText(payload.title, 80);
  const body = normalizeNotificationText(payload.body, 240);
  if (
    !title
    || !body
    || !Notification.isSupported()
    || !shouldSendCompletionNotification({
      isFocused: mainWindow.isFocused(),
      wasRunning: true,
      isRunning: false,
    })
  ) {
    return;
  }

  completionNotification?.close();
  const notification = new Notification({ title, body });
  completionNotification = notification;
  notification.once("click", focusMainWindow);
  notification.once("close", () => {
    if (completionNotification === notification) completionNotification = null;
  });
  notification.show();
});

function createWindow() {
  const restoredState = getRestoredWindowState();
  const win = new BrowserWindow({
    x: restoredState.x,
    y: restoredState.y,
    width: restoredState.width,
    height: restoredState.height,
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
  mainWindow = win;

  let saveTimer = null;
  const flushWindowState = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = null;
    persistWindowState(win);
  };
  const scheduleWindowStateSave = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(flushWindowState, WINDOW_STATE_SAVE_DELAY_MS);
  };
  for (const eventName of ["move", "resize", "maximize", "unmaximize"]) {
    win.on(eventName, scheduleWindowStateSave);
  }
  win.on("close", flushWindowState);

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  win.once("ready-to-show", () => {
    win.show();
    // macOS 会在窗口首次显示时做一次级联摆放；显示后再次落实已校验的边界，
    // 才能让保存的位置和普通尺寸真正恢复。
    win.setBounds({
      x: restoredState.x,
      y: restoredState.y,
      width: restoredState.width,
      height: restoredState.height,
    });
    if (restoredState.isMaximized) win.maximize();
    win.focus();
  });

  win.on("closed", () => {
    if (saveTimer) clearTimeout(saveTimer);
    if (mainWindow === win) mainWindow = null;
  });
  // Show a lightweight loading page immediately; the real app URL is loaded
  // once the server answers the health check.
  win.loadFile(path.join(__dirname, "loading.html"));
}

function loadAppUrl() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.loadURL(SERVER_URL);
  }
}

// Show an actionable error on the loading page instead of navigating to a
// dead URL (which used to leave users staring at a blank window after the
// health check burned through all its retries).
function showStartupError(message) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.loadFile(path.join(__dirname, "loading.html"), {
      query: { error: message || "unknown error" },
    });
  }
}

// Runs the full boot sequence once: spawn the server, wait for it to
// answer, then load the app. Re-runnable from the error page's retry button.
let bootInFlight = false;
async function bootServer() {
  if (bootInFlight) return;
  bootInFlight = true;
  try {
    serverProcessExited = false;
    startServerProcess();
    log("Waiting for server...");
    await waitForServer();
    log("Server is ready, loading app...");
    loadAppUrl();
  } catch (err) {
    if (!serverProcessExited) {
      // The health check is stricter than reality: the server has been seen
      // serving requests even after every probe "failed" on a loaded machine.
      // The process is still alive, so try loading the app before giving up.
      log(`Health check failed: ${err.message}; loading app URL anyway`);
      loadAppUrl();
    } else {
      // Our own server process died (or never spawned). A dead URL would just
      // render Chromium's error page, so show a retryable error instead.
      log(`Server failed to start: ${err.message}`);
      showStartupError(err.message);
    }
  } finally {
    bootInFlight = false;
  }
}

// Error page buttons (see loading.html).
ipcMain.on("pi-web:retry-startup", () => {
  log("Retrying startup from error page...");
  bootServer();
});
ipcMain.on("pi-web:open-anyway", () => {
  log("User chose to open the app URL despite startup failure.");
  loadAppUrl();
});

// ─── App lifecycle ──────────────────────────────────────────

// Single instance lock - prevent multiple Electron instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  log("Another instance is already running, exiting.");
  app.quit();
} else {
  app.on("second-instance", () => {
    // Someone tried to run a second instance, focus existing window instead
    focusMainWindow();
  });

app.whenReady().then(() => {
  buildAppMenu();
  // Open the window first so the user gets immediate visual feedback
  // (loading page) instead of staring at nothing while the server boots.
  // This also makes the single-instance "second launch focuses window"
  // path work during startup.
  createWindow();
  bootServer();
  // Delay the background update check so it doesn't compete with the
  // server cold start for CPU/disk.
  setTimeout(() => checkForUpdates(false), 15000);
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (serverProcess && !serverProcessExited) {
    log("Shutting down server...");
    if (process.platform === "win32") {
      // Windows 下按进程树关闭，避免子进程残留并继续占用端口。
      try {
        spawn("taskkill", ["/pid", String(serverProcess.pid), "/T", "/F"], { windowsHide: true });
      } catch {
        serverProcess.kill("SIGTERM");
      }
    } else {
      serverProcess.kill("SIGTERM");
    }
    serverProcess = null;
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
