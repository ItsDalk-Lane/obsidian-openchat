import assert from "node:assert/strict";
import test from "node:test";
import {
  isExtensionInstalledAsPackage,
  resolveBundledExtensionDir,
} from "./mcp-extension.ts";

const packageName = "pi-mcp-adapter";

function createSettingsManager(globalPackages, projectPackages) {
  return {
    getGlobalSettings: () => ({ packages: globalPackages }),
    getProjectSettings: () => ({ packages: projectPackages }),
  };
}

test("deduplicates a string package source", () => {
  const settings = createSettingsManager([], ["npm:pi-mcp-adapter@2.13.0"]);
  assert.equal(isExtensionInstalledAsPackage(settings, packageName), true);
});

test("deduplicates an object package source", () => {
  const settings = createSettingsManager([], [{ source: "npm:pi-mcp-adapter@2.13.0" }]);
  assert.equal(isExtensionInstalledAsPackage(settings, packageName), true);
});

test("deduplicates a package installed in global settings", () => {
  const settings = createSettingsManager(
    ["github:owner/pi-mcp-adapter"],
    ["npm:another-extension"],
  );
  assert.equal(isExtensionInstalledAsPackage(settings, packageName), true);
});

test("deduplicates a package installed in project settings", () => {
  const settings = createSettingsManager(
    ["npm:another-extension"],
    ["pi-mcp-adapter"],
  );
  assert.equal(isExtensionInstalledAsPackage(settings, packageName), true);
});

test("does not deduplicate a different package", () => {
  const settings = createSettingsManager(
    ["npm:not-pi-mcp-adapter-extra"],
    [{ source: "github:owner/another-extension" }],
  );
  assert.equal(isExtensionInstalledAsPackage(settings, packageName), false);
});

test("does not deduplicate a package whose name only starts with the bundled name", () => {
  const settings = createSettingsManager([], ["npm:pi-mcp-adapter-pro"]);
  assert.equal(isExtensionInstalledAsPackage(settings, packageName), false);
  const other = createSettingsManager([], [{ source: "npm:pi-mcp-adapter-pro" }]);
  assert.equal(isExtensionInstalledAsPackage(other, packageName), false);
});

test("returns null instead of throwing for a missing bundled package", () => {
  const missingPackage = "@pi-web/definitely-not-installed";
  assert.doesNotThrow(() => resolveBundledExtensionDir(missingPackage));
  assert.equal(resolveBundledExtensionDir(missingPackage), null);
});
