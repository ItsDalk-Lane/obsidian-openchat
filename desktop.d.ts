/**
 * Bridge exposed by the Electron preload (electron/preload.js).
 * Undefined when the app runs in a plain browser.
 */
interface PiDesktopBridge {
  /** Sync the native window title bar with the in-app theme. */
  setTheme?: (theme: "light" | "dark") => void;
  /** Open a native directory picker; resolves to the chosen path or null. */
  selectDirectory?: () => Promise<string | null>;
}

interface Window {
  piDesktop?: PiDesktopBridge;
}
