/**
 * @module core/ai-runtime-assembler
 * @description AI Runtime 命令层的装配器。
 *   负责构建 AiRuntimeCommandHost，管理 AiRuntimeCommandManager 的生命周期。
 *
 * @dependencies obsidian (通过 type-only), src/commands/ai-runtime/*, src/providers/*
 * @side-effects 注册 Obsidian 命令与编辑器扩展
 * @invariants 不直接持有 Plugin 实例，只接收最小宿主接口。
 */

import type { App, Command } from 'obsidian';
import type { Extension } from '@codemirror/state';
import type { PluginSettings } from 'src/domains/settings/types';
import type { ObsidianApiProvider } from 'src/providers/providers.types';
import type { AiRuntimeCommandHost } from 'src/commands/ai-runtime/ai-runtime-command-host';
import { AiRuntimeCommandManager } from 'src/commands/ai-runtime/AiRuntimeCommandManager';

/**
 * AiRuntimeAssembler 对宿主 Plugin 的最小依赖接口。
 */
export interface AiRuntimeAssemblerHost {
	readonly app: App;
	addCommand(command: Command): void;
	removeCommand(id: string): void;
	registerEditorExtension(extension: Extension | readonly Extension[]): void;
}

export class AiRuntimeAssembler {
	private aiRuntimeCommandManager: AiRuntimeCommandManager | null = null;
	private readonly commandHost: AiRuntimeCommandHost;

	constructor(
		host: AiRuntimeAssemblerHost,
		private readonly obsidianApiProvider: ObsidianApiProvider,
	) {
		this.commandHost = buildAiRuntimeCommandHost(host, obsidianApiProvider);
	}

	initialize(settings: PluginSettings): void {
		const aiRuntimeSettings = settings.aiRuntime;
		const defaultModelTag = settings.chat.defaultModel;
		if (!this.aiRuntimeCommandManager) {
			this.aiRuntimeCommandManager = new AiRuntimeCommandManager(
				this.commandHost,
				this.obsidianApiProvider,
				aiRuntimeSettings,
				defaultModelTag,
			);
			this.aiRuntimeCommandManager.initialize();
		} else {
			this.aiRuntimeCommandManager.updateSettings(
				aiRuntimeSettings,
				defaultModelTag,
			);
		}
	}

	dispose(): void {
		this.aiRuntimeCommandManager?.dispose();
		this.aiRuntimeCommandManager = null;
	}
}

function buildAiRuntimeCommandHost(
	host: AiRuntimeAssemblerHost,
	obsidianApiProvider: ObsidianApiProvider,
): AiRuntimeCommandHost {
	return {
		getApp: () => host.app,
		getObsidianApiProvider: () => obsidianApiProvider,
		addCommand: (command) => {
			host.addCommand(command);
		},
		removeCommand: (id) => {
			host.removeCommand(id);
		},
		registerEditorExtension: (extension) => {
			host.registerEditorExtension(extension);
		},
		notify: (message, timeout) => {
			obsidianApiProvider.notify(message, timeout);
		},
	};
}
