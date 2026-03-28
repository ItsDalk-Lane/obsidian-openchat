import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSkillsRootPath, SKILL_RELOAD_DEBOUNCE_MS } from './config';
import {
	buildSkillsSystemPromptBlock,
	formatSkillToolResult,
	loadSkillContent,
	parseSkillMetadata,
	SkillScannerService,
	stripSkillFrontmatter,
} from './service';
import { SkillsRuntimeCoordinator } from './ui';
import type { ObsidianApiProvider, VaultChangeEvent, VaultEntry } from 'src/providers/providers.types';

function createFakeProvider(options?: {
	folders?: Record<string, readonly VaultEntry[]>;
	files?: Record<string, string>;
	readDelayMs?: number;
}): ObsidianApiProvider & {
	triggerVaultChange(event: VaultChangeEvent): void;
	setFolderEntries(path: string, entries: readonly VaultEntry[]): void;
	setFile(path: string, content: string): void;
	getReadCount(path: string): number;
	failNextParseYaml(): void;
} {
	const folders = new Map(Object.entries(options?.folders ?? {}));
	const files = new Map(Object.entries(options?.files ?? {}));
	const listeners = new Set<(event: VaultChangeEvent) => void>();
	const readCounts = new Map<string, number>();
	let failYaml = false;
	return {
		notify(): void {},
		async buildGlobalSystemPrompt(): Promise<string> { return ''; },
		normalizePath(path: string): string { return path.replace(/\\/gu, '/').replace(/\/+/gu, '/'); },
		async ensureAiDataFolders(): Promise<void> {},
		async ensureVaultFolder(folderPath: string): Promise<string> { return folderPath; },
		async requestHttp() {
			return { status: 200, text: '', headers: {} };
		},
		getVaultEntry() {
			return null;
		},
		getVaultName(): string {
			return 'vault';
		},
		getActiveFilePath(): string | null {
			return null;
		},
		async getAvailableAttachmentPath(filename: string): Promise<string> {
			return filename;
		},
		getFrontmatter() {
			return null;
		},
		async pathExists(): Promise<boolean> {
			return false;
		},
		async statPath() {
			return null;
		},
		listFolderEntries(folderPath: string): readonly VaultEntry[] { return folders.get(folderPath) ?? []; },
		async readVaultFile(filePath: string): Promise<string> {
			readCounts.set(filePath, (readCounts.get(filePath) ?? 0) + 1);
			if (options?.readDelayMs) {
				await new Promise((resolve) => setTimeout(resolve, options.readDelayMs));
			}
			const content = files.get(filePath);
			if (content === undefined) {
				throw new Error(`文件不存在: ${filePath}`);
			}
			return content;
		},
		async readVaultBinary(): Promise<ArrayBuffer> {
			return new Uint8Array().buffer;
		},
		async writeVaultFile(): Promise<void> {},
		async writeVaultBinary(): Promise<void> {},
		async deleteVaultPath(): Promise<void> {},
		parseYaml(content: string): unknown {
			if (failYaml) {
				failYaml = false;
				throw new Error('yaml broken');
			}
			return Object.fromEntries(content.split(/\r?\n/gu).filter(Boolean).map((line) => {
				const separatorIndex = line.indexOf(':');
				return [line.slice(0, separatorIndex).trim(), line.slice(separatorIndex + 1).trim()];
			}));
		},
		stringifyYaml(): string {
			return '';
		},
		readLocalStorage(): string | null {
			return null;
		},
		writeLocalStorage(): void {},
		openSettingsTab(): void {},
		insertTextIntoMarkdownEditor() {
			return { inserted: false };
		},
		onVaultChange(listener): () => void {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		triggerVaultChange(event: VaultChangeEvent): void {
			for (const listener of listeners) {
				listener(event);
			}
		},
		setFolderEntries(path: string, entries: readonly VaultEntry[]): void {
			folders.set(path, entries);
		},
		setFile(path: string, content: string): void {
			files.set(path, content);
		},
		getReadCount(path: string): number {
			return readCounts.get(path) ?? 0;
		},
		failNextParseYaml(): void {
			failYaml = true;
		},
	};
}

function wait(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

test('SkillScannerService 扫描并缓存有效技能', async () => {
	const root = buildSkillsRootPath('System/AI Data');
	const provider = createFakeProvider({
		folders: {
			[root]: [
				{ path: `${root}/alpha`, name: 'alpha', kind: 'folder' },
				{ path: `${root}/beta`, name: 'beta', kind: 'folder' },
			],
			[`${root}/alpha`]: [{ path: `${root}/alpha/SKILL.md`, name: 'SKILL.md', kind: 'file' }],
			[`${root}/beta`]: [{ path: `${root}/beta/SKILL.md`, name: 'SKILL.md', kind: 'file' }],
		},
		files: {
			[`${root}/alpha/SKILL.md`]: '---\nname: alpha\ndescription: first skill\n---\nalpha body',
			[`${root}/beta/SKILL.md`]: '---\nname: beta\ndescription: second skill\n---\nbeta body',
		},
	});
	const scanner = new SkillScannerService(provider, { getAiDataFolder: () => 'System/AI Data' });
	const result = await scanner.scan();
	assert.equal(result.skills.length, 2);
	assert.equal(result.skills[0].metadata.name, 'alpha');
	assert.equal(scanner.findByName('beta')?.skillFilePath, `${root}/beta/SKILL.md`);
	assert.equal(await scanner.scan(), result);
});

test('SkillScannerService 对重复技能名保留 warning 并覆盖旧定义', async () => {
	const root = buildSkillsRootPath('System/AI Data');
	const provider = createFakeProvider({
		folders: {
			[root]: [
				{ path: `${root}/one`, name: 'one', kind: 'folder' },
				{ path: `${root}/two`, name: 'two', kind: 'folder' },
			],
			[`${root}/one`]: [{ path: `${root}/one/SKILL.md`, name: 'SKILL.md', kind: 'file' }],
			[`${root}/two`]: [{ path: `${root}/two/SKILL.md`, name: 'SKILL.md', kind: 'file' }],
		},
		files: {
			[`${root}/one/SKILL.md`]: '---\nname: shared\ndescription: first\n---\none',
			[`${root}/two/SKILL.md`]: '---\nname: shared\ndescription: second\n---\ntwo',
		},
	});
	const scanner = new SkillScannerService(provider, { getAiDataFolder: () => 'System/AI Data' });
	const result = await scanner.scan();
	assert.equal(result.skills.length, 1);
	assert.equal(result.skills[0].basePath, `${root}/two`);
	assert.equal(result.errors[0]?.severity, 'warning');
});

test('parseSkillMetadata 校验必填字段与命名规范', () => {
	const provider = createFakeProvider();
	assert.throws(() => parseSkillMetadata('body only', provider), /YAML frontmatter/);
	assert.throws(
		() => parseSkillMetadata('---\nname: Invalid_Name\ndescription: demo\n---\nbody', provider),
		/命名规范/,
	);
});

test('parseSkillMetadata 保留可选字段并校验描述长度', () => {
	const metadata = parseSkillMetadata('---\nignored: true\n---', {
		parseYaml(): unknown {
			return {
				name: 'alpha-skill',
				description: 'demo description',
				license: 'MIT',
				compatibility: ['desktop', 'mobile'],
				metadata: { tier: 'gold' },
			};
		},
	});
	assert.equal(metadata.license, 'MIT');
	assert.deepEqual(metadata.compatibility, ['desktop', 'mobile']);
	assert.deepEqual(metadata.metadata, { tier: 'gold' });
	assert.throws(() => parseSkillMetadata('---\nignored: true\n---', {
		parseYaml(): unknown {
			return {
				name: 'alpha-skill',
				description: 'x'.repeat(1025),
			};
		},
	}), /1024/);
});

test('内容辅助函数会剥离 frontmatter、格式化结果并转义 skills prompt', () => {
	assert.equal(stripSkillFrontmatter('---\nname: demo\ndescription: test\n---\nbody'), 'body');
	assert.equal(formatSkillToolResult('folder\\sub', 'body', (value) => value.replace(/\\/gu, '/')), 'Base Path: folder/sub/\n\nbody');
	const prompt = buildSkillsSystemPromptBlock([{ metadata: { name: 'a<b', description: 'x&y' }, skillFilePath: 'a', basePath: 'b' }]);
	assert.match(prompt, /a&lt;b/);
	assert.match(prompt, /x&amp;y/);
});

test('SkillScannerService loadSkillContent 首次调用会触发扫描并返回正文', async () => {
	const root = buildSkillsRootPath('System/AI Data');
	const missingSkillPath = `${root}/missing/SKILL.md`;
	const provider = createFakeProvider({
		folders: {
			[root]: [{ path: `${root}/alpha`, name: 'alpha', kind: 'folder' }],
			[`${root}/alpha`]: [{ path: `${root}/alpha/SKILL.md`, name: 'SKILL.md', kind: 'file' }],
		},
		files: {
			[`${root}/alpha/SKILL.md`]: '---\nname: alpha\ndescription: first skill\n---\nalpha body',
		},
	});
	const scanner = new SkillScannerService(provider, { getAiDataFolder: () => 'System/AI Data' });
	const content = await loadSkillContent(scanner, `${root}/alpha/SKILL.md`);
	assert.equal(content.definition.metadata.name, 'alpha');
	assert.equal(content.bodyContent, 'alpha body');
	await assert.rejects(() => loadSkillContent(scanner, missingSkillPath), /未找到已注册的 Skill/);
});

test('SkillScannerService 扫描时保留解析错误并继续处理其他技能', async () => {
	const root = buildSkillsRootPath('System/AI Data');
	const provider = createFakeProvider({
		folders: {
			[root]: [
				{ path: `${root}/broken`, name: 'broken', kind: 'folder' },
				{ path: `${root}/valid`, name: 'valid', kind: 'folder' },
			],
			[`${root}/broken`]: [{ path: `${root}/broken/SKILL.md`, name: 'SKILL.md', kind: 'file' }],
			[`${root}/valid`]: [{ path: `${root}/valid/SKILL.md`, name: 'SKILL.md', kind: 'file' }],
		},
		files: {
			[`${root}/broken/SKILL.md`]: '---\nname: broken\ndescription: bad\n---\nbody',
			[`${root}/valid/SKILL.md`]: '---\nname: valid\ndescription: good\n---\nbody',
		},
	});
	provider.failNextParseYaml();
	const scanner = new SkillScannerService(provider, { getAiDataFolder: () => 'System/AI Data' });
	const result = await scanner.scan();
	assert.equal(result.skills.length, 1);
	assert.equal(result.skills[0]?.metadata.name, 'valid');
	assert.equal(result.errors[0]?.severity, 'error');
	assert.match(result.errors[0]?.reason ?? '', /frontmatter 解析失败/);
});

test('SkillScannerService 并发扫描共享同一个 Promise', async () => {
	const root = buildSkillsRootPath('System/AI Data');
	const skillFilePath = `${root}/alpha/SKILL.md`;
	const provider = createFakeProvider({
		folders: {
			[root]: [{ path: `${root}/alpha`, name: 'alpha', kind: 'folder' }],
			[`${root}/alpha`]: [{ path: skillFilePath, name: 'SKILL.md', kind: 'file' }],
		},
		files: {
			[skillFilePath]: '---\nname: alpha\ndescription: first skill\n---\nalpha body',
		},
		readDelayMs: 20,
	});
	const scanner = new SkillScannerService(provider, { getAiDataFolder: () => 'System/AI Data' });
	const [left, right] = await Promise.all([scanner.scan(), scanner.scan()]);
	assert.equal(left, right);
	assert.equal(provider.getReadCount(skillFilePath), 1);
});

test('SkillsRuntimeCoordinator 初始化后会向监听器推送当前技能结果', async () => {
	const root = buildSkillsRootPath('System/AI Data');
	const provider = createFakeProvider({
		folders: {
			[root]: [{ path: `${root}/alpha`, name: 'alpha', kind: 'folder' }],
			[`${root}/alpha`]: [{ path: `${root}/alpha/SKILL.md`, name: 'SKILL.md', kind: 'file' }],
		},
		files: {
			[`${root}/alpha/SKILL.md`]: '---\nname: alpha\ndescription: first skill\n---\nalpha body',
		},
	});
	const runtime = new SkillsRuntimeCoordinator(provider, { getAiDataFolder: () => 'System/AI Data' });
	let latestCount = 0;
	const unsubscribe = runtime.onSkillsChange((result) => {
		latestCount = result.skills.length;
	});
	await runtime.initialize();
	assert.equal(latestCount, 1);
	unsubscribe();
	runtime.dispose();
});

test('SkillsRuntimeCoordinator 仅在 SKILL.md 变化后防抖刷新', async () => {
	const root = buildSkillsRootPath('System/AI Data');
	const provider = createFakeProvider({
		folders: {
			[root]: [{ path: `${root}/alpha`, name: 'alpha', kind: 'folder' }],
			[`${root}/alpha`]: [{ path: `${root}/alpha/SKILL.md`, name: 'SKILL.md', kind: 'file' }],
		},
		files: {
			[`${root}/alpha/SKILL.md`]: '---\nname: alpha\ndescription: first skill\n---\nalpha body',
		},
	});
	const runtime = new SkillsRuntimeCoordinator(provider, { getAiDataFolder: () => 'System/AI Data' });
	let latestCount = 0;
	runtime.onSkillsChange((result) => {
		latestCount = result.skills.length;
	});
	await runtime.initialize();
	provider.setFolderEntries(root, [
		{ path: `${root}/alpha`, name: 'alpha', kind: 'folder' },
		{ path: `${root}/beta`, name: 'beta', kind: 'folder' },
	]);
	provider.setFolderEntries(`${root}/beta`, [{ path: `${root}/beta/SKILL.md`, name: 'SKILL.md', kind: 'file' }]);
	provider.setFile(`${root}/beta/SKILL.md`, '---\nname: beta\ndescription: second skill\n---\nbeta body');
	provider.triggerVaultChange({ type: 'modify', path: `${root}/beta/README.md` });
	await wait(SKILL_RELOAD_DEBOUNCE_MS + 30);
	assert.equal(latestCount, 1);
	provider.triggerVaultChange({ type: 'modify', path: `${root}/beta/SKILL.md` });
	await wait(SKILL_RELOAD_DEBOUNCE_MS + 30);
	assert.equal(latestCount, 2);
	runtime.dispose();
});

test('SkillsRuntimeCoordinator dispose 后停止响应变更事件', async () => {
	const root = buildSkillsRootPath('System/AI Data');
	const provider = createFakeProvider({
		folders: {
			[root]: [{ path: `${root}/alpha`, name: 'alpha', kind: 'folder' }],
			[`${root}/alpha`]: [{ path: `${root}/alpha/SKILL.md`, name: 'SKILL.md', kind: 'file' }],
		},
		files: {
			[`${root}/alpha/SKILL.md`]: '---\nname: alpha\ndescription: first skill\n---\nalpha body',
		},
	});
	const runtime = new SkillsRuntimeCoordinator(provider, { getAiDataFolder: () => 'System/AI Data' });
	let latestCount = 0;
	runtime.onSkillsChange((result) => {
		latestCount = result.skills.length;
	});
	await runtime.initialize();
	runtime.dispose();
	provider.setFolderEntries(root, [
		{ path: `${root}/alpha`, name: 'alpha', kind: 'folder' },
		{ path: `${root}/beta`, name: 'beta', kind: 'folder' },
	]);
	provider.setFolderEntries(`${root}/beta`, [{ path: `${root}/beta/SKILL.md`, name: 'SKILL.md', kind: 'file' }]);
	provider.setFile(`${root}/beta/SKILL.md`, '---\nname: beta\ndescription: second skill\n---\nbeta body');
	provider.triggerVaultChange({ type: 'modify', path: `${root}/beta/SKILL.md` });
	await wait(SKILL_RELOAD_DEBOUNCE_MS + 30);
	assert.equal(latestCount, 1);
});
