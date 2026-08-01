import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const projectRoot = dirname(fileURLToPath(import.meta.url));

function readVersion(packagePath: string): string {
  try {
    return (JSON.parse(readFileSync(packagePath, "utf8")) as { version?: string }).version ?? "unknown";
  } catch {
    return "unknown";
  }
}

const appVersion = readVersion(resolve(projectRoot, "package.json"));
const piVersion = readVersion(resolve(
  projectRoot,
  "node_modules/@earendil-works/pi-coding-agent/package.json",
));

export default defineConfig({
  root: resolve(projectRoot, "web"),
  publicDir: false,
  plugins: [react()],
  resolve: {
    alias: {
      "@": projectRoot,
    },
  },
  define: {
    "process.env.NEXT_PUBLIC_APP_VERSION": JSON.stringify(appVersion),
    "process.env.NEXT_PUBLIC_PI_VERSION": JSON.stringify(piVersion),
  },
  server: {
    host: "127.0.0.1",
    proxy: {
      "/api": {
        target: "http://127.0.0.1:30141",
      },
    },
  },
  build: {
    emptyOutDir: true,
    outDir: "dist",
  },
});
