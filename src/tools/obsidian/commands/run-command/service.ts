import type { App } from 'obsidian';
import type {
	BuiltinPermissionDecision,
	BuiltinValidationResult,
} from '../../../runtime/types';
import type { RunCommandArgs, RunCommandResult } from './schema';

interface ObsidianCommandLike {
	id?: string;
	name?: string;
}

type CommandRisk = 'read-only' | 'mutating' | 'destructive' | 'unknown';

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

const READ_ONLY_COMMAND_PATTERNS = [
	/^command-palette:/u,
	/^switcher:/u,
	/^graph:/u,
	/^outline:/u,
	/^backlink:/u,
	/^workspace:(new-tab|toggle|focus|open-link)/u,
] as const;

const MUTATING_COMMAND_PATTERNS = [
	/^editor:/u,
	/^workspace:(split|copy|manage|change-layout)/u,
	/^bookmarks:/u,
	/^daily-notes:/u,
	/^templates:/u,
] as const;

const DESTRUCTIVE_COMMAND_PATTERNS = [
	/(delete|remove|trash|erase|clear|reset|overwrite|rename|move)/iu,
] as const;

const normalizeCommandId = (commandId: string): string => {
	const normalized = String(commandId ?? '').trim();
	if (!normalized) {
		throw new Error('command_id 不能为空');
	}
	return normalized;
};

const matchesAny = (value: string, patterns: readonly RegExp[]): boolean => (
	patterns.some((pattern) => pattern.test(value))
);

const inferPluginId = (commandId: string): string | null => {
	const separatorIndex = commandId.indexOf(':');
	if (separatorIndex <= 0) {
		return null;
	}
	const prefix = commandId.slice(0, separatorIndex);
	return CORE_COMMAND_PREFIXES.has(prefix) ? null : prefix;
};

const getCommandById = (
	app: App,
	commandId: string,
): ObsidianCommandLike | undefined => {
	return app.commands.findCommand(commandId) as ObsidianCommandLike | undefined;
};

export const resolveRunCommandRisk = (commandId: string): CommandRisk => {
	if (matchesAny(commandId, DESTRUCTIVE_COMMAND_PATTERNS)) {
		return 'destructive';
	}
	if (matchesAny(commandId, MUTATING_COMMAND_PATTERNS)) {
		return 'mutating';
	}
	if (matchesAny(commandId, READ_ONLY_COMMAND_PATTERNS)) {
		return 'read-only';
	}
	return 'unknown';
};

export const validateRunCommandInput = (
	args: RunCommandArgs,
): BuiltinValidationResult => {
	try {
		normalizeCommandId(args.command_id);
		return { ok: true };
	} catch (error) {
		return {
			ok: false,
			summary: error instanceof Error ? error.message : String(error),
			notes: ['run_command 只接受明确 command id；不知道 id 时先用 list_commands。'],
		};
	}
};

export const checkRunCommandPermissions = async (
	app: App,
	args: RunCommandArgs,
): Promise<BuiltinPermissionDecision<RunCommandArgs>> => {
	const commandId = normalizeCommandId(args.command_id);
	const command = getCommandById(app, commandId);
	if (!command) {
		return {
			behavior: 'deny',
			message: `命令不存在: ${commandId}`,
		};
	}

	const risk = resolveRunCommandRisk(commandId);
	const pluginId = inferPluginId(commandId);
	const bodyLines = [
		`命令 id: ${commandId}`,
		`命令名: ${command.name ?? commandId}`,
		`来源: ${pluginId ?? 'core'}`,
		`动态风险: ${risk}`,
	];

	return {
		behavior: 'ask',
		message: risk === 'unknown'
			? '即将执行未知来源或未知风险的 Obsidian 命令'
			: '即将执行 Obsidian 命令',
		updatedArgs: {
			command_id: commandId,
		},
		escalatedRisk:
			risk === 'unknown'
				? 'destructive'
				: risk === 'destructive'
					? 'destructive'
					: 'mutating',
		confirmation: {
			title: risk === 'unknown' ? '确认执行未知命令' : '确认执行命令',
			body: bodyLines.join('\n'),
			confirmLabel: '确认执行',
		},
	};
};

export const summarizeRunCommand = (
	args: Partial<RunCommandArgs>,
): string | null => args.command_id?.trim() || null;

export const describeRunCommandActivity = (
	args: Partial<RunCommandArgs>,
): string | null => (
	args.command_id ? `执行 Obsidian 命令 ${args.command_id}` : '执行 Obsidian 命令'
);

export const executeRunCommand = (
	app: App,
	args: RunCommandArgs,
): RunCommandResult => {
	const commandId = normalizeCommandId(args.command_id);
	const executed = app.commands.executeCommandById(commandId);
	return {
		command_id: commandId,
		executed,
		plugin: inferPluginId(commandId),
	};
};
