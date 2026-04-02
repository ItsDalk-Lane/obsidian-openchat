import type { App } from 'obsidian';
import type { ListCommandsArgs, ListCommandsResult } from './schema';

interface ObsidianCommandLike {
	id?: string;
	name?: string;
}

const CORE_COMMAND_PREFIXES = new Set([
	'app',
	'workspace',
	'editor',
	'command-palette',
	'file-explorer',
	'graph',
	'outline',
	'daily-notes',
	'bookmarks',
	'tag-pane',
	'backlink',
	'page-preview',
	'switcher',
	'slash-command',
	'templates',
]);

const normalizeText = (value?: string): string => (
	String(value ?? '').trim()
);

const normalizeQuery = (value?: string): string => (
	normalizeText(value).toLowerCase()
);

const inferPluginId = (commandId: string): string | null => {
	const separatorIndex = commandId.indexOf(':');
	if (separatorIndex <= 0) {
		return null;
	}
	const prefix = commandId.slice(0, separatorIndex);
	return CORE_COMMAND_PREFIXES.has(prefix) ? null : prefix;
};

const listAllCommands = (app: App): Array<{
	id: string;
	name: string;
	plugin: string | null;
}> => {
	return app.commands.listCommands()
		.map((command) => command as ObsidianCommandLike)
		.map((command) => ({
			id: normalizeText(command.id),
			name: normalizeText(command.name) || normalizeText(command.id),
			plugin: inferPluginId(normalizeText(command.id)),
		}))
		.filter((command) => command.id.length > 0);
};

export const summarizeListCommands = (
	args: Partial<ListCommandsArgs>,
): string | null => {
	if (args.query?.trim()) {
		return args.query.trim();
	}
	if (args.plugin_id?.trim()) {
		return `plugin:${args.plugin_id.trim()}`;
	}
	return null;
};

export const describeListCommandsActivity = (
	args: Partial<ListCommandsArgs>,
): string | null => {
	const summary = summarizeListCommands(args);
	return summary ? `列出 Obsidian 命令 ${summary}` : '列出 Obsidian 命令';
};

export const executeListCommands = (
	app: App,
	args: ListCommandsArgs,
): ListCommandsResult => {
	const normalizedQuery = normalizeQuery(args.query);
	const normalizedPluginId = normalizeQuery(args.plugin_id);
	const results = listAllCommands(app)
		.filter((command) => {
			if (
				normalizedPluginId
				&& normalizeQuery(command.plugin ?? '') !== normalizedPluginId
			) {
				return false;
			}
			if (!normalizedQuery) {
				return true;
			}
			return normalizeQuery(command.name).includes(normalizedQuery)
				|| normalizeQuery(command.id).includes(normalizedQuery);
		})
		.sort((left, right) => left.name.localeCompare(right.name))
		.slice(0, args.max_results)
		.map((command) => ({
			id: command.id,
			name: command.name,
			...(command.plugin ? { plugin: command.plugin } : { plugin: null }),
		}));

	return {
		commands: results,
	};
};
