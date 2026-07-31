import { piMcpAdapterSpec } from "./pi-mcp-adapter";
import { piSubagentsSpec } from "./subagents";

export interface BundledExtensionSpec {
  packageName: string;
  setup?(context: { cwd: string }): void;
}

export const bundledExtensionSpecs: readonly BundledExtensionSpec[] = [
  piMcpAdapterSpec,
  piSubagentsSpec,
];
