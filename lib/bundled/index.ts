import { piMcpAdapterSpec } from "./pi-mcp-adapter";

export interface BundledExtensionSpec {
  packageName: string;
  setup?(context: { cwd: string }): void;
}

export const bundledExtensionSpecs: readonly BundledExtensionSpec[] = [
  piMcpAdapterSpec,
];
