import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
	listCommandsResultSchema,
	listCommandsSchema,
} from './list-commands/schema';
import {
	runCommandResultSchema,
	runCommandSchema,
} from './run-command/schema';

const CURRENT_DIR = dirname(fileURLToPath(import.meta.url));

const readCommandSource = async (relativePath: string): Promise<string> => {
	return await readFile(resolve(CURRENT_DIR, relativePath), 'utf8');
};

test('Step 19 schema 保持 list_commands 与 run_command 的 discover/invoke 边界', () => {
	const listArgs = listCommandsSchema.parse({});
	const runArgs = runCommandSchema.parse({
		command_id: 'command-palette:open',
	});

	assert.equal(listArgs.max_results, 50);
	assert.equal(runArgs.command_id, 'command-palette:open');
	assert.deepEqual(Object.keys(listCommandsResultSchema.shape), ['commands']);
	assert.deepEqual(Object.keys(runCommandResultSchema.shape).sort(), [
		'command_id',
		'executed',
		'plugin',
	]);
});

test('Step 19 service 源码明确通过 Obsidian commands API 做 discover 与 invoke', async () => {
	const listServiceSource = await readCommandSource('./list-commands/service.ts');
	const runServiceSource = await readCommandSource('./run-command/service.ts');

	assert.match(listServiceSource, /app\.commands\.listCommands\(\)/);
	assert.match(listServiceSource, /plugin_id/);
	assert.match(runServiceSource, /app\.commands\.findCommand\(commandId\)/);
	assert.match(runServiceSource, /app\.commands\.executeCommandById\(commandId\)/);
	assert.match(runServiceSource, /behavior: 'ask'/);
	assert.match(runServiceSource, /命令不存在/);
	assert.match(runServiceSource, /未知来源或未知风险/);
});

test('Step 19 runtime 已接入 Obsidian commands 工具工厂', async () => {
	const listToolSource = await readCommandSource('./list-commands/tool.ts');
	const runToolSource = await readCommandSource('./run-command/tool.ts');
	const obsidianToolsSource = await readCommandSource('./obsidian-tools.ts');
	const runtimeSource = await readCommandSource('../../runtime/BuiltinToolsRuntime.ts');

	assert.match(listToolSource, /LIST_COMMANDS_TOOL_NAME = 'list_commands'/);
	assert.match(listToolSource, /family: 'builtin\.obsidian\.commands'/);
	assert.match(listToolSource, /visibility: 'candidate-only'/);
	assert.match(runToolSource, /RUN_COMMAND_TOOL_NAME = 'run_command'/);
	assert.match(runToolSource, /family: 'workflow\.obsidian\.commands'/);
	assert.match(runToolSource, /visibility: 'workflow-only'/);
	assert.match(obsidianToolsSource, /createListCommandsTool\(app\)/);
	assert.match(obsidianToolsSource, /createRunCommandTool\(app\)/);
	assert.match(runtimeSource, /createObsidianCommandTools/);
	assert.match(runtimeSource, /registry\.registerAll\(createObsidianCommandTools\(options\.app\)\)/);
});
