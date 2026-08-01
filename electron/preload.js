// Preload: expose a minimal, safe bridge so the renderer can sync the
// native window chrome (title bar) with the in-app theme.
const { contextBridge, ipcRenderer } = require("electron");

function normalizeNotificationText(value, maxLength) {
  if (typeof value !== "string") return null;
  const normalized = Array.from(value, (character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127 ? " " : character;
  }).join("").replace(/\s+/g, " ").trim();
  if (normalized.length === 0) return null;
  return normalized.slice(0, maxLength);
}

contextBridge.exposeInMainWorld("piDesktop", {
  setTheme: (theme) => {
    if (theme === "dark" || theme === "light") {
      ipcRenderer.send("pi-web:set-theme", theme);
    }
  },
  selectDirectory: () => ipcRenderer.invoke("pi-web:select-directory"),
  notifyAgentComplete: (payload) => {
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return;
    const title = normalizeNotificationText(payload.title, 80);
    const body = normalizeNotificationText(payload.body, 240);
    if (title && body) ipcRenderer.send("pi-web:notify-agent-complete", { title, body });
  },
  onNewSession: (callback) => {
    if (typeof callback !== "function") return () => {};
    // 只把业务事件交给页面，不暴露 Electron 事件对象。
    const listener = () => callback();
    ipcRenderer.on("menu:new-session", listener);
    return () => ipcRenderer.removeListener("menu:new-session", listener);
  },
  // Used by the loading page's error state (see loading.html).
  retryStartup: () => ipcRenderer.send("pi-web:retry-startup"),
  openAnyway: () => ipcRenderer.send("pi-web:open-anyway"),
});
