import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import type { BundledExtensionSpec } from "./index";

const PI_BINARY_ENV = "PI_SUBAGENT_PI_BINARY";
const PI_SDK_PACKAGE = "@earendil-works/pi-coding-agent";
const moduleRequire = createRequire(import.meta.url);

function resolvePiBinary(): string {
  const packageJsonPath = moduleRequire.resolve
    .paths(PI_SDK_PACKAGE)
    ?.map((modulesDir) => join(modulesDir, PI_SDK_PACKAGE, "package.json"))
    .find(existsSync);
  if (!packageJsonPath) {
    throw new Error(`找不到 ${PI_SDK_PACKAGE}/package.json`);
  }

  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
    name?: string;
    bin?: string | Record<string, string>;
  };
  if (packageJson.name !== PI_SDK_PACKAGE) {
    throw new Error(`SDK 包名不匹配：${packageJson.name ?? "未知"}`);
  }

  const binary = typeof packageJson.bin === "string"
    ? packageJson.bin
    : packageJson.bin?.pi ?? Object.values(packageJson.bin ?? {})[0];
  if (!binary) {
    throw new Error(`${PI_SDK_PACKAGE} 未声明可执行入口`);
  }

  const binaryPath = resolve(dirname(packageJsonPath), binary);
  if (!existsSync(binaryPath)) {
    throw new Error(`SDK 可执行文件不存在：${binaryPath}`);
  }
  return binaryPath;
}

export const piSubagentsSpec: BundledExtensionSpec = {
  packageName: "pi-subagents",
  setup() {
    if (process.env[PI_BINARY_ENV]?.trim()) return;
    try {
      process.env[PI_BINARY_ENV] = resolvePiBinary();
    } catch (error) {
      console.warn(
        `[pi-web] 无法为 pi-subagents 设置 ${PI_BINARY_ENV}：`,
        error instanceof Error ? error.message : error,
      );
    }
  },
};
