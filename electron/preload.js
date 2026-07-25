// Preload: expose a minimal, safe bridge so the renderer can sync the
// native window chrome (title bar) with the in-app theme.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("piDesktop", {
  setTheme: (theme) => {
    if (theme === "dark" || theme === "light") {
      ipcRenderer.send("pi-web:set-theme", theme);
    }
  },
  selectDirectory: () => ipcRenderer.invoke("pi-web:select-directory"),
});
