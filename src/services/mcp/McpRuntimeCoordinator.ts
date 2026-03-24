import type { App } from 'obsidian';
import type { PluginSettings } from 'src/settings/PluginSettings';
import { DEFAULT_MCP_SETTINGS } from './types';
import { McpClientManager } from './McpClientManager';

export class McpRuntimeCoordinator {
	private mcpClientManager: McpClientManager | null = null;

	constructor(private readonly app: App) {}

	async initialize(settings: PluginSettings): Promise<void> {
		const mcpSettings = settings.aiRuntime.mcp ?? DEFAULT_MCP_SETTINGS;
		if (!this.mcpClientManager) {
			this.mcpClientManager = new McpClientManager(this.app, mcpSettings);
			return;
		}

		await this.mcpClientManager.updateSettings(mcpSettings);
	}

	getManager(): McpClientManager | null {
		return this.mcpClientManager;
	}

	dispose(): void {
		this.mcpClientManager?.dispose();
		this.mcpClientManager = null;
	}
}
