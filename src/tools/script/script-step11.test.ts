import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import Module from 'node:module';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const CURRENT_DIR = dirname(fileURLToPath(import.meta.url));

const installObsidianStub = (): void => {
	const globalScope = globalThis as typeof globalThis & {
		__obsidianScriptStubInstalled?: boolean;
	};
	if (globalScope.__obsidianScriptStubInstalled) {
		return;
	}
	const moduleLoader = Module as typeof Module & {
		_load: (request: string, parent: object | null, isMain: boolean) => unknown;
	};
	const originalLoad = moduleLoader._load;
	moduleLoader._load = (request, parent, isMain) => {
		if (request === 'obsidian') {
			class FileSystemAdapter {
				constructor(private readonly basePath = process.cwd()) {}

				getBasePath(): string {
					return this.basePath;
				}
			}

			class TAbstractFile {}
			class TFile extends TAbstractFile {}
			class TFolder extends TAbstractFile {}

			return {
				App: class App {},
				FileSystemAdapter,
				Platform: {
					isDesktopApp: true,
					isDesktop: true,
				},
				TAbstractFile,
				TFile,
				TFolder,
				normalizePath: (value: string) =>
					value.replace(/\\/gu, '/').replace(/\/+/gu, '/'),
			};
		}
		return originalLoad(request, parent, isMain);
	};
	globalScope.__obsidianScriptStubInstalled = true;
};

const loadScriptModules = async () => {
	installObsidianStub();
	return await Promise.all([
		import('./script-tools'),
		import('./run-script/tool'),
		import('./run-shell/tool'),
		import('../runtime/script-runtime'),
	]);
};

const readScriptSource = async (relativePath: string): Promise<string> => {
	return await readFile(resolve(CURRENT_DIR, relativePath), 'utf8');
};

test('Step 11 run_script 会提供执行摘要、并发/中断语义与脚本内进度回传', async () => {
	const [
		,
		{ createRunScriptTool },
		,
		{ ScriptRuntime },
	] = await loadScriptModules();
	const progressMessages: string[] = [];
	const runtime = new ScriptRuntime({
		callTool: async (name, args) => ({ name, args }),
		momentFactory: () => 'moment',
	});
	const tool = createRunScriptTool(runtime);
	const context = {
		app: {} as never,
		callTool: async () => null,
		reportProgress: (event: { message?: string }) => {
			if (event.message) {
				progressMessages.push(event.message);
			}
		},
	};

	assert.equal(tool.isConcurrencySafe?.({ script: 'return 1;' }), false);
	assert.equal(tool.interruptBehavior?.({ script: 'return 1;' }), 'block');
	assert.match(tool.getToolUseSummary?.({
		script: 'const now = await call_tool("get_current_time", {}); return now;',
	}) ?? '', /call_tool/);

	const invalid = await tool.validateInput?.({
		script: 'require("fs")',
	}, context);
	assert.equal(invalid?.ok, false);

	const result = await tool.execute({
		script:
			'const result = await call_tool("read_file", { file_path: "docs/plan.md" }); return result;',
	}, context);

	assert.deepEqual(result, {
		name: 'read_file',
		args: { file_path: 'docs/plan.md' },
	});
	assert.ok(
		progressMessages.some((message) => message.includes('脚本正在调用 read_file')),
	);
});

test('Step 11 run_shell 会进入确认流，并保持桌面端 shell 执行兼容', async () => {
	const [
		,
		,
		{ createRunShellTool },
	] = await loadScriptModules();
	const app = {
		vault: {
			adapter: {
				getBasePath: () => process.cwd(),
			},
		},
	} as never;
	const tool = createRunShellTool(app);
	const context = {
		app,
		callTool: async () => null,
		reportProgress: () => {},
	};

	const readOnlyPermission = await tool.checkPermissions?.({
		command: 'pwd',
		cwd: 'src',
	}, context);
	assert.equal(readOnlyPermission?.behavior, 'ask');
	if (readOnlyPermission?.behavior === 'ask') {
		assert.equal(readOnlyPermission.escalatedRisk, 'read-only');
		assert.match(readOnlyPermission.confirmation?.body ?? '', /工作目录: src/);
	}

	const destructivePermission = await tool.checkPermissions?.({
		command: 'rm -rf temp',
	}, context);
	assert.equal(destructivePermission?.behavior, 'ask');
	if (destructivePermission?.behavior === 'ask') {
		assert.equal(destructivePermission.escalatedRisk, 'destructive');
		assert.match(destructivePermission.confirmation?.title ?? '', /高风险/);
	}

	const result = await tool.execute({
		command: 'pwd',
		cwd: 'src',
	}, context);
	assert.equal(result.supported, true);
	assert.ok(result.cwd.endsWith('/src'));
	assert.ok(result.stdout.trim().endsWith('/src'));
});

test('Step 11 legacy 入口改为复用新的 script 工具目录', async () => {
	const scriptToolsSource = await readScriptSource('./script-tools.ts');
	const runScriptToolSource = await readScriptSource('./run-script/tool.ts');
	const runShellToolSource = await readScriptSource('./run-shell/tool.ts');

	assert.match(scriptToolsSource, /run-script\/tool/);
	assert.match(scriptToolsSource, /run-shell\/tool/);
	assert.match(runScriptToolSource, /visibility: 'workflow-only'/);
	assert.match(runScriptToolSource, /interruptBehavior: \(\) => 'block'/);
	assert.match(runShellToolSource, /checkPermissions:/);
	assert.match(runShellToolSource, /interruptBehavior: \(\) => 'cancel'/);
});
