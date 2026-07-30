import { piMcpAdapterSpec } from "./pi-mcp-adapter";
import { webAccessSpec } from "./web-access";

export interface BundledExtensionSpec {
  packageName: string;
  setup?(context: { cwd: string }): void;
}

export const bundledExtensionSpecs: readonly BundledExtensionSpec[] = [
  piMcpAdapterSpec,
  webAccessSpec,
];
