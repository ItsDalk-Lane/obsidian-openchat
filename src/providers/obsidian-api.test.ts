import test from 'node:test';
import assert from 'node:assert/strict';
import {
	createObsidianApiProviderFromRuntime,
	type ObsidianApiRuntime,
	type ObsidianVaultNode,
} from './obsidian-api-core';

function createRuntimeFixture(options?: {
	entries?: Record<string, ObsidianVaultNode | null>;
	fileContents?: Record<string, string>;
	binaryContents?: Record<string, ArrayBuffer>;
	stats?: Record<string, { size: number; mtime: number; ctime: number } | null>;
	requestText?: string | undefined;
	requestJson?: unknown;
	requestArrayBuffer?: ArrayBuffer;
	frontmatters?: Record<string, Record<string, unknown> | null>;
}) {
	const notifications: Array<{ message: string; timeout?: number }> = [];
	const offRefs: unknown[] = [];
	const listeners = new Map<string, (path: string, oldPath?: string) => void>();
	const entries = new Map(Object.entries(options?.entries ?? {}));
	const fileContents = new Map(Object.entries(options?.fileContents ?? {}));
	const binaryContents = new Map(Object.entries(options?.binaryContents ?? {}));
	const stats = new Map(Object.entries(options?.stats ?? {}));
	const frontmatters = new Map(Object.entries(options?.frontmatters ?? {}));
	const ensuredFolders: string[] = [];
	const writtenFiles: Array<{ path: string; content: string }> = [];
	const writtenBinaries: Array<{ path: string; content: ArrayBuffer }> = [];
	const deletedPaths: string[] = [];
	const localStorage = new Map<string, string>();
	const openedTabs: string[] = [];
	const runtime: ObsidianApiRuntime = {
		notify(message: string, timeout?: number): void {
			notifications.push({ message, timeout });
		},
		normalizePath(path: string): string {
			return path.replace(/\\/gu, '/').replace(/\/+/gu, '/');
		},
		async ensureAiDataFolders(): Promise<void> {},
		async ensureVaultFolder(folderPath: string): Promise<string> {
			ensuredFolders.push(folderPath);
			return folderPath;
		},
		async requestUrl(): Promise<{
			readonly status: number;
			readonly text?: string;
			readonly headers: Record<string, string>;
			readonly json?: unknown;
			readonly arrayBuffer?: ArrayBuffer;
		}> {
			return {
				status: 204,
				text: options?.requestText,
				headers: { 'x-test': 'ok' },
				json: options?.requestJson,
				arrayBuffer: options?.requestArrayBuffer,
			};
		},
		getAbstractFileByPath(path: string): ObsidianVaultNode | null {
			return entries.get(path) ?? null;
		},
		getVaultName(): string {
			return 'demo-vault';
		},
		getActiveFilePath(): string | null {
			return 'folder/active.md';
		},
		async getAvailablePathForAttachment(filename: string): Promise<string> {
			return `attachments/${filename}`;
		},
		getFrontmatter(path: string): Record<string, unknown> | null {
			return frontmatters.get(path) ?? null;
		},
		async pathExists(path: string): Promise<boolean> {
			return entries.has(path) || fileContents.has(path) || binaryContents.has(path);
		},
		async statPath(path: string) {
			if (stats.has(path)) {
				return stats.get(path) ?? null;
			}
			if (fileContents.has(path)) {
				return { size: fileContents.get(path)?.length ?? 0, mtime: 2, ctime: 1 };
			}
			if (binaryContents.has(path)) {
				return { size: binaryContents.get(path)?.byteLength ?? 0, mtime: 2, ctime: 1 };
			}
			return null;
		},
		async readVaultFile(path: string): Promise<string> {
			const content = fileContents.get(path);
			if (content === undefined) {
				throw new Error(`missing ${path}`);
			}
			return content;
		},
		async readVaultBinary(path: string): Promise<ArrayBuffer> {
			const content = binaryContents.get(path);
			if (content === undefined) {
				throw new Error(`missing binary ${path}`);
			}
			return content;
		},
		async writeVaultFile(path: string, content: string): Promise<void> {
			writtenFiles.push({ path, content });
			fileContents.set(path, content);
		},
		async writeVaultBinary(path: string, content: ArrayBuffer): Promise<void> {
			writtenBinaries.push({ path, content });
			binaryContents.set(path, content);
		},
		async deleteVaultPath(path: string): Promise<void> {
			deletedPaths.push(path);
			entries.delete(path);
			fileContents.delete(path);
			binaryContents.delete(path);
		},
		parseYaml(content: string): unknown {
			return { raw: content };
		},
		stringifyYaml(content: unknown): string {
			return JSON.stringify(content);
		},
		readLocalStorage(key: string): string | null {
			return localStorage.get(key) ?? null;
		},
		writeLocalStorage(key: string, value: string): void {
			localStorage.set(key, value);
		},
		openSettingsTab(tabId: string): void {
			openedTabs.push(tabId);
		},
		insertTextIntoMarkdownEditor(content: string) {
			return {
				inserted: content.length > 0,
				fileName: 'active-note',
			};
		},
		onVaultChange(type, listener): unknown {
			listeners.set(type, listener);
			return `${type}-ref`;
		},
		offVaultChange(ref: unknown): void {
			offRefs.push(ref);
		},
	};
	return {
		runtime,
		notifications,
		listeners,
		offRefs,
		ensuredFolders,
		writtenFiles,
		writtenBinaries,
		deletedPaths,
		localStorage,
		openedTabs,
	};
}

test('ObsidianApiProvider 委托通知、路径归一化、提示词与目录初始化', async () => {
	let ensuredFolder = '';
	const { runtime, notifications } = createRuntimeFixture();
	runtime.ensureAiDataFolders = async (folder) => {
		ensuredFolder = folder;
	};
	const provider = createObsidianApiProviderFromRuntime(runtime, async (featureId) => `prompt:${featureId}`);
	provider.notify('hello', 1500);
	assert.deepEqual(notifications, [{ message: 'hello', timeout: 1500 }]);
	assert.equal(provider.normalizePath('folder\\child'), 'folder/child');
	assert.equal(await provider.buildGlobalSystemPrompt('editor'), 'prompt:editor');
	await provider.ensureAiDataFolders('System/AI Data');
	assert.equal(ensuredFolder, 'System/AI Data');
});

test('ObsidianApiProvider 规范化 HTTP 响应并为空文本兜底', async () => {
	const provider = createObsidianApiProviderFromRuntime(
		createRuntimeFixture({
			requestText: undefined,
			requestJson: { ok: true },
			requestArrayBuffer: new Uint8Array([1, 2]).buffer,
		}).runtime,
		async () => '',
	);
	const response = await provider.requestHttp({ url: 'https://example.com', method: 'GET' });
	assert.deepEqual(response, {
		status: 204,
		text: '',
		headers: { 'x-test': 'ok' },
		json: { ok: true },
		arrayBuffer: new Uint8Array([1, 2]).buffer,
	});
});

test('ObsidianApiProvider 会读取并列出规范化后的 Vault 条目', async () => {
	const provider = createObsidianApiProviderFromRuntime(
		createRuntimeFixture({
			entries: {
				'folder/path': {
					path: 'folder/path',
					name: 'path',
					kind: 'folder',
					children: [
						{ path: 'folder/path/alpha.md', name: 'alpha.md', kind: 'file' },
						{ path: 'folder/path/nested', name: 'nested', kind: 'folder' },
					],
				},
				'folder/path/alpha.md': {
					path: 'folder/path/alpha.md',
					name: 'alpha.md',
					kind: 'file',
				},
			},
			fileContents: {
				'folder/path/alpha.md': 'hello world',
			},
		}).runtime,
		async () => '',
	);
	assert.deepEqual(provider.listFolderEntries('folder\\path'), [
		{ path: 'folder/path/alpha.md', name: 'alpha.md', kind: 'file' },
		{ path: 'folder/path/nested', name: 'nested', kind: 'folder' },
	]);
	assert.equal(await provider.readVaultFile('folder\\path\\alpha.md'), 'hello world');
	assert.deepEqual(provider.listFolderEntries('missing'), []);
	await assert.rejects(async () => await provider.readVaultFile('missing.md'), /文件不存在: missing.md/);
});

test('ObsidianApiProvider 会代理 vault 查询与读写能力', async () => {
	const imageBytes = new Uint8Array([1, 2, 3]).buffer;
	const {
		runtime,
		ensuredFolders,
		writtenFiles,
		writtenBinaries,
		deletedPaths,
	} = createRuntimeFixture({
		entries: {
			'folder/file.md': { path: 'folder/file.md', name: 'file.md', kind: 'file' },
			'folder/image.png': { path: 'folder/image.png', name: 'image.png', kind: 'file' },
		},
		fileContents: {
			'folder/file.md': 'hello world',
		},
		binaryContents: {
			'folder/image.png': imageBytes,
		},
		stats: {
			'folder/file.md': { size: 11, mtime: 20, ctime: 10 },
		},
	});
	const provider = createObsidianApiProviderFromRuntime(runtime, async () => '');

	assert.deepEqual(provider.getVaultEntry('folder\\file.md'), {
		path: 'folder/file.md',
		name: 'file.md',
		kind: 'file',
	});
	assert.equal(provider.getVaultName(), 'demo-vault');
	assert.equal(provider.getActiveFilePath(), 'folder/active.md');
	assert.equal(await provider.getAvailableAttachmentPath('image.png'), 'attachments/image.png');
	assert.equal(await provider.pathExists('folder\\file.md'), true);
	assert.deepEqual(await provider.statPath('folder\\file.md'), {
		size: 11,
		mtime: 20,
		ctime: 10,
	});
	assert.deepEqual(new Uint8Array(await provider.readVaultBinary('folder\\image.png')), new Uint8Array([1, 2, 3]));
	await provider.writeVaultFile('folder\\new.md', 'new content');
	await provider.writeVaultBinary('folder\\new.png', new Uint8Array([9, 8]).buffer);
	assert.equal(await provider.ensureVaultFolder('folder\\nested'), 'folder/nested');
	await provider.deleteVaultPath('folder\\new.md');

	assert.deepEqual(ensuredFolders, ['folder/nested']);
	assert.deepEqual(writtenFiles, [{ path: 'folder/new.md', content: 'new content' }]);
	assert.deepEqual(writtenBinaries.map((entry) => ({ path: entry.path, size: entry.content.byteLength })), [
		{ path: 'folder/new.png', size: 2 },
	]);
	assert.deepEqual(deletedPaths, ['folder/new.md']);
});

test('ObsidianApiProvider 会委托 YAML 解析', () => {
	const provider = createObsidianApiProviderFromRuntime(createRuntimeFixture().runtime, async () => '');
	assert.deepEqual(provider.parseYaml('name: demo'), { raw: 'name: demo' });
	assert.equal(provider.stringifyYaml({ demo: true }), '{"demo":true}');
});

test('ObsidianApiProvider 会委托 frontmatter、本地存储与设置打开能力', () => {
	const fixture = createRuntimeFixture({
		frontmatters: {
			'note.md': { title: 'demo' },
		},
	});
	const provider = createObsidianApiProviderFromRuntime(fixture.runtime, async () => '');
	assert.deepEqual(provider.getFrontmatter('note.md'), { title: 'demo' });
	assert.equal(provider.readLocalStorage('layout'), null);
	provider.writeLocalStorage('layout', 'tabs');
	assert.equal(provider.readLocalStorage('layout'), 'tabs');
	provider.openSettingsTab('openchat');
	assert.deepEqual(provider.insertTextIntoMarkdownEditor('hello'), {
		inserted: true,
		fileName: 'active-note',
	});
	assert.deepEqual(fixture.openedTabs, ['openchat']);
});

test('ObsidianApiProvider 会映射 Vault 事件并在清理时注销全部监听器', () => {
	const { runtime, listeners, offRefs } = createRuntimeFixture();
	const provider = createObsidianApiProviderFromRuntime(runtime, async () => '');
	const received: Array<{ type: string; path: string; oldPath?: string }> = [];
	const dispose = provider.onVaultChange((event) => {
		received.push(event);
	});
	listeners.get('create')?.('skills/alpha.md');
	listeners.get('modify')?.('skills/beta.md');
	listeners.get('delete')?.('skills/gamma.md');
	listeners.get('rename')?.('skills/new.md', 'skills/old.md');
	assert.deepEqual(received, [
		{ type: 'create', path: 'skills/alpha.md' },
		{ type: 'modify', path: 'skills/beta.md' },
		{ type: 'delete', path: 'skills/gamma.md' },
		{ type: 'rename', path: 'skills/new.md', oldPath: 'skills/old.md' },
	]);
	dispose();
	assert.deepEqual(offRefs, ['create-ref', 'modify-ref', 'delete-ref', 'rename-ref']);
});
