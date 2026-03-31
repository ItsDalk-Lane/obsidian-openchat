import type { Extension } from '@codemirror/state';
import type { App, Command } from 'obsidian';
import type { ObsidianApiProvider } from 'src/providers/providers.types';

export interface AiRuntimeCommandHost {
	getApp(): App;
	getObsidianApiProvider(): ObsidianApiProvider;
	addCommand(command: Command): void;
	removeCommand(id: string): void;
	registerEditorExtension(extension: Extension | readonly Extension[]): void;
	notify(message: string, timeout?: number): void;
}
