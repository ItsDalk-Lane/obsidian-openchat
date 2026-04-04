import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSkillsRootPath, SKILL_RELOAD_DEBOUNCE_MS } from './config';
import {
	buildSkillsSystemPromptBlock,
	filterRuntimeEnabledSkills,
	formatSkillToolResult,
	loadSkillContent,
	SkillScannerService,
} from './service';
import { parseSkillMetadata, stripSkillFrontmatter } from './document';
import { SkillRegistry } from './registry';
import { LocalVaultSkillSource } from './source';
import { SkillsRuntimeCoordinator } from './ui';
import type { VaultChangeEvent, VaultEntry } from 'src/providers/providers.types';
import type { SkillsRuntimeHostPort } from './ui';
import type {
	SkillDefinition,
	SkillScanResult,
	SkillSource,
	UpdateSkillInput,
} from './types';

function createFakeProvider(options?: {
	folders?: Record<string, readonly VaultEntry[]>;
	files?: Record<string, string>;
	readDelayMs?: number;
	parseYaml?: (content: string) => unknown;
}): SkillsRuntimeHostPort & {
	triggerVaultChange(event: VaultChangeEvent): void;
	setFolderEntries(path: string, entries: readonly VaultEntry[]): void;
	setFile(path: string, content: string): void;
	getReadCount(path: string): number;
	getWrittenFile(path: string): string | undefined;
	getDeletedPaths(): readonly string[];
	failNextParseYaml(): void;
} {
	const folders = new Map(Object.entries(options?.folders ?? {}));
	const files = new Map(Object.entries(options?.files ?? {}));
	const listeners = new Set<(event: VaultChangeEvent) => void>();
	const readCounts = new Map<string, number>();
	const deletedPaths: string[] = [];
	let failYaml = false;
	const normalize = (path: string): string => path.replace(/\\/gu, '/').replace(/\/+/gu, '/');
	const getParentPath = (path: string): string => {
		const normalized = normalize(path);
		const lastSlash = normalized.lastIndexOf('/');
		return lastSlash > 0 ? normalized.slice(0, lastSlash) : '';
	};
	const getEntryName = (path: string): string => {
		const normalized = normalize(path);
		const lastSlash = normalized.lastIndexOf('/');
		return lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized;
	};
	const upsertFolderEntry = (folderPath: string, entry: VaultEntry): void => {
		const normalizedFolder = normalize(folderPath);
		const current = [...(folders.get(normalizedFolder) ?? [])];
		const index = current.findIndex((item) => normalize(item.path) === normalize(entry.path));
		const nextEntry = { ...entry, path: normalize(entry.path) };
		if (index >= 0) {
			current[index] = nextEntry;
		} else {
			current.push(nextEntry);
		}
		folders.set(normalizedFolder, current);
	};
	const ensureFolderRecord = (folderPath: string): void => {
		const normalizedFolder = normalize(folderPath);
		if (!normalizedFolder) {
			return;
		}
		if (!folders.has(normalizedFolder)) {
			folders.set(normalizedFolder, []);
		}
		const parentPath = getParentPath(normalizedFolder);
		if (!parentPath) {
			return;
		}
		ensureFolderRecord(parentPath);
		upsertFolderEntry(parentPath, {
			path: normalizedFolder,
			name: getEntryName(normalizedFolder),
			kind: 'folder',
		});
	};
	const writeFileRecord = (filePath: string, content: string): void => {
		const normalizedFilePath = normalize(filePath);
		const folderPath = getParentPath(normalizedFilePath);
		if (folderPath) {
			ensureFolderRecord(folderPath);
			upsertFolderEntry(folderPath, {
				path: normalizedFilePath,
				name: getEntryName(normalizedFilePath),
				kind: 'file',
			});
		}
		files.set(normalizedFilePath, content);
	};
	const deletePathRecord = (targetPath: string): void => {
		const normalizedTarget = normalize(targetPath);
		for (const filePath of [...files.keys()]) {
			if (filePath === normalizedTarget || filePath.startsWith(`${normalizedTarget}/`)) {
				files.delete(filePath);
			}
		}
		for (const folderPath of [...folders.keys()]) {
			if (folderPath === normalizedTarget || folderPath.startsWith(`${normalizedTarget}/`)) {
				folders.delete(folderPath);
			}
		}
		for (const [folderPath, entries] of folders.entries()) {
			folders.set(
				folderPath,
				entries.filter((entry) => {
					const entryPath = normalize(entry.path);
					return entryPath !== normalizedTarget
						&& !entryPath.startsWith(`${normalizedTarget}/`);
				}),
			);
		}
	};
	const parseScalar = (value: string): unknown => {
		if (value === 'true') {
			return true;
		}
		if (value === 'false') {
			return false;
		}
		if (value === 'null') {
			return null;
		}
		if (/^-?\d+(?:\.\d+)?$/u.test(value)) {
			return Number(value);
		}
		return value;
	};
	const stringifyYamlValue = (value: unknown, indent: string): string[] => {
		if (Array.isArray(value)) {
			return value.flatMap((entry) => {
				if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
					const [firstKey, ...restKeys] = Object.keys(entry as Record<string, unknown>);
					if (!firstKey) {
						return [`${indent}- {}`];
					}
					const firstValue = (entry as Record<string, unknown>)[firstKey];
					const lines = [`${indent}- ${firstKey}: ${String(firstValue)}`];
					for (const key of restKeys) {
						lines.push(`${indent}  ${key}: ${String((entry as Record<string, unknown>)[key])}`);
					}
					return lines;
				}
				return [`${indent}- ${String(entry)}`];
			});
		}
		if (value && typeof value === 'object') {
			return Object.entries(value as Record<string, unknown>).flatMap(([key, nestedValue]) => {
				if (nestedValue && typeof nestedValue === 'object') {
					return [`${indent}${key}:`, ...stringifyYamlValue(nestedValue, `${indent}  `)];
				}
				return [`${indent}${key}: ${String(nestedValue)}`];
			});
		}
		return [`${indent}${String(value)}`];
	};
	return {
		normalizePath(path: string): string { return normalize(path); },
		async ensureAiDataFolders(): Promise<void> {},
		async ensureVaultFolder(folderPath: string): Promise<string> {
			ensureFolderRecord(folderPath);
			return normalize(folderPath);
		},
		getVaultName(): string {
			return 'vault';
		},
		getVaultEntry(path: string) {
			const normalizedPath = normalize(path);
			if (files.has(normalizedPath)) {
				return { path: normalizedPath, name: getEntryName(normalizedPath), kind: 'file' };
			}
			if (folders.has(normalizedPath)) {
				return { path: normalizedPath, name: getEntryName(normalizedPath), kind: 'folder' };
			}
			return null;
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
		async pathExists(path: string): Promise<boolean> {
			return this.getVaultEntry(path) !== null;
		},
		async statPath(path: string) {
			const entry = this.getVaultEntry(path);
			if (!entry) {
				return null;
			}
			return { size: 0, mtime: 0, ctime: 0 };
		},
		listFolderEntries(folderPath: string): readonly VaultEntry[] {
			return folders.get(normalize(folderPath)) ?? [];
		},
		async readVaultFile(filePath: string): Promise<string> {
			const normalizedPath = normalize(filePath);
			readCounts.set(normalizedPath, (readCounts.get(normalizedPath) ?? 0) + 1);
			if (options?.readDelayMs) {
				await new Promise((resolve) => setTimeout(resolve, options.readDelayMs));
			}
			const content = files.get(normalizedPath);
			if (content === undefined) {
				throw new Error(`文件不存在: ${normalizedPath}`);
			}
			return content;
		},
		async readVaultBinary(): Promise<ArrayBuffer> {
			return new Uint8Array().buffer;
		},
		parseYaml(content: string): unknown {
			if (failYaml) {
				failYaml = false;
				throw new Error('yaml broken');
			}
			if (options?.parseYaml) {
				return options.parseYaml(content);
			}
			return Object.fromEntries(content.split(/\r?\n/gu).filter(Boolean).map((line) => {
				const separatorIndex = line.indexOf(':');
				const key = line.slice(0, separatorIndex).trim();
				const rawValue = line.slice(separatorIndex + 1).trim();
				return [key, parseScalar(rawValue)];
			}));
		},
		stringifyYaml(content: unknown): string {
			if (!content || typeof content !== 'object' || Array.isArray(content)) {
				return '';
			}
			return Object.entries(content as Record<string, unknown>).flatMap(([key, value]) => {
				if (Array.isArray(value) || (value && typeof value === 'object')) {
					return [`${key}:`, ...stringifyYamlValue(value, '  ')];
				}
				return [`${key}: ${String(value)}`];
			}).join('\n');
		},
		async writeVaultFile(filePath: string, content: string): Promise<void> {
			writeFileRecord(filePath, content);
		},
		async writeVaultBinary(): Promise<void> {},
		async deleteVaultPath(path: string): Promise<void> {
			const normalizedPath = normalize(path);
			deletedPaths.push(normalizedPath);
			deletePathRecord(normalizedPath);
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
			ensureFolderRecord(path);
			folders.set(normalize(path), entries.map((entry) => ({
				...entry,
				path: normalize(entry.path),
			})));
		},
		setFile(path: string, content: string): void {
			writeFileRecord(path, content);
		},
		getReadCount(path: string): number {
			return readCounts.get(normalize(path)) ?? 0;
		},
		getWrittenFile(path: string): string | undefined {
			return files.get(normalize(path));
		},
		getDeletedPaths(): readonly string[] {
			return deletedPaths;
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

test('SkillRegistry 统一快照查询并保留重复名称 warning', async () => {
	const sourceResult: SkillScanResult = {
		skills: [
			{
				metadata: { name: 'shared', description: 'first' },
				skillFilePath: 'System\\AI Data\\skills\\one\\SKILL.md',
				basePath: 'System\\AI Data\\skills\\one',
			},
			{
				metadata: { name: 'shared', description: 'second' },
				skillFilePath: 'System/AI Data/skills/two/SKILL.md',
				basePath: 'System/AI Data/skills/two',
			},
		],
		errors: [{ path: 'broken/SKILL.md', reason: 'bad yaml', severity: 'error' }],
	};
	let scanCalls = 0;
	const source: SkillSource = {
		sourceId: 'test-source',
		kind: 'local',
		getSkillsRootPath(): string { return 'System/AI Data/skills'; },
		async scan(): Promise<SkillScanResult> {
			scanCalls += 1;
			return sourceResult;
		},
		normalizePath(path: string): string { return path.replace(/\\/gu, '/'); },
		async loadSkillContent(path: string) {
			return {
				definition: sourceResult.skills[0],
				fullContent: `full:${path}`,
				bodyContent: 'body',
			};
		},
		async createSkill() {
			throw new Error('not implemented');
		},
		async updateSkill() {
			throw new Error('not implemented');
		},
		async removeSkill() {
			throw new Error('not implemented');
		},
		async setSkillEnabled() {
			throw new Error('not implemented');
		},
		isSkillFilePath(path: string): boolean {
			return path.endsWith('/SKILL.md');
		},
	};
	const registry = new SkillRegistry(source);
	const snapshot = await registry.scan();
	assert.equal(snapshot.skills.length, 1);
	assert.equal(snapshot.skills[0]?.metadata.description, 'second');
	assert.equal(snapshot.errors.length, 2);
	assert.equal(snapshot.errors[1]?.severity, 'warning');
	assert.equal(registry.findByName('shared')?.skillFilePath, 'System/AI Data/skills/two/SKILL.md');
	assert.equal(
		registry.findById('System\\AI Data\\skills\\two\\SKILL.md')?.metadata.description,
		'second',
	);
	assert.equal(await registry.scan(), snapshot);
	assert.equal(scanCalls, 1);
	registry.clearCache();
	assert.equal(registry.getSnapshot(), null);
});

test('SkillRegistry 会按相关性排序并限制返回数量', async () => {
	const sourceResult: SkillScanResult = {
		skills: [
			{
				metadata: {
					name: 'pdf',
					description: 'Handle PDF workflows',
					when_to_use: 'Use for /pdf export and PDF conversion tasks',
				},
				skillFilePath: 'System/AI Data/skills/pdf/SKILL.md',
				basePath: 'System/AI Data/skills/pdf',
			},
			{
				metadata: {
					name: 'translate',
					description: 'Translate text between languages',
					enabled: false,
					when_to_use: 'Use when the user asks to translate content',
				},
				skillFilePath: 'System/AI Data/skills/translate/SKILL.md',
				basePath: 'System/AI Data/skills/translate',
			},
			{
				metadata: {
					name: 'summarize',
					description: 'Summarize long content',
				},
				skillFilePath: 'System/AI Data/skills/summarize/SKILL.md',
				basePath: 'System/AI Data/skills/summarize',
			},
		],
		errors: [],
	};
	const source: SkillSource = {
		sourceId: 'test-source',
		kind: 'local',
		getSkillsRootPath(): string { return 'System/AI Data/skills'; },
		async scan(): Promise<SkillScanResult> { return sourceResult; },
		normalizePath(path: string): string { return path.replace(/\\/gu, '/'); },
		async loadSkillContent(path: string) {
			return {
				definition: sourceResult.skills[0],
				fullContent: `full:${path}`,
				bodyContent: 'body',
			};
		},
		async createSkill() { throw new Error('not implemented'); },
		async updateSkill() { throw new Error('not implemented'); },
		async removeSkill() { throw new Error('not implemented'); },
		async setSkillEnabled() { throw new Error('not implemented'); },
		isSkillFilePath(path: string): boolean { return path.endsWith('/SKILL.md'); },
	};
	const registry = new SkillRegistry(source);
	await registry.scan();

	assert.deepEqual(
		registry.resolveRelevantSkills('请执行 /pdf export 并 translate 结果', 2).map((skill) => skill.metadata.name),
		['pdf'],
	);
	assert.equal(registry.findByName('translate'), undefined);
	assert.equal(registry.findByName('translate', { includeDisabled: true })?.metadata.enabled, false);
	assert.deepEqual(registry.resolveRelevantSkills('   ', 3), []);
});

test('filterRuntimeEnabledSkills 只保留运行时可用 Skill', () => {
	const result = filterRuntimeEnabledSkills({
		skills: [
			{
				metadata: { name: 'enabled', description: 'enabled skill', enabled: true },
				skillFilePath: 'System/AI Data/skills/enabled/SKILL.md',
				basePath: 'System/AI Data/skills/enabled',
			},
			{
				metadata: { name: 'disabled', description: 'disabled skill', enabled: false },
				skillFilePath: 'System/AI Data/skills/disabled/SKILL.md',
				basePath: 'System/AI Data/skills/disabled',
			},
		],
		errors: [],
	});

	assert.deepEqual(result.skills.map((skill) => skill.metadata.name), ['enabled']);
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

test('LocalVaultSkillSource 扫描不缓存，并可读取正文与识别 Skill 文件路径', async () => {
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
	const source = new LocalVaultSkillSource(provider, { getAiDataFolder: () => 'System/AI Data' });
	const result = await source.scan();
	provider.setFolderEntries(root, [
		{ path: `${root}/alpha`, name: 'alpha', kind: 'folder' },
		{ path: `${root}/beta`, name: 'beta', kind: 'folder' },
	]);
	provider.setFolderEntries(`${root}/beta`, [{ path: `${root}/beta/SKILL.md`, name: 'SKILL.md', kind: 'file' }]);
	provider.setFile(`${root}/beta/SKILL.md`, '---\nname: beta\ndescription: second skill\n---\nbeta body');
	const nextResult = await source.scan();
	const content = await source.loadSkillContent(`${root}/alpha/SKILL.md`);
	assert.equal(result.skills.length, 1);
	assert.equal(nextResult.skills.length, 2);
	assert.notEqual(nextResult, result);
	assert.equal(provider.getReadCount(`${root}/alpha/SKILL.md`), 3);
	assert.equal(content.bodyContent, 'alpha body');
	assert.equal(content.definition.skillFilePath, `${root}/alpha/SKILL.md`);
	assert.equal(source.isSkillFilePath(`${root}/alpha/SKILL.md`), true);
	assert.equal(source.isSkillFilePath(`${root}/alpha/README.md`), false);
});

test('LocalVaultSkillSource 支持 create、update、setEnabled 与 remove', async () => {
	const root = buildSkillsRootPath('System/AI Data');
	const provider = createFakeProvider({
		folders: {
			[root]: [],
		},
	});
	const source = new LocalVaultSkillSource(provider, { getAiDataFolder: () => 'System/AI Data' });
	const created = await source.createSkill({
		name: 'alpha',
		description: 'first skill',
	});
	assert.equal(created.skillFilePath, `${root}/alpha/SKILL.md`);
	assert.match(provider.getWrittenFile(created.skillFilePath) ?? '', /enabled: true/);
	assert.match(provider.getWrittenFile(created.skillFilePath) ?? '', /execution: isolated_resume/);
	assert.equal((await source.scan()).skills.length, 1);
	const updated = await source.updateSkill({
		skillId: created.skillFilePath,
		description: 'updated skill',
		when_to_use: 'Handle alpha tasks',
		bodyContent: 'updated body',
	});
	assert.equal(updated.metadata.description, 'updated skill');
	assert.match(provider.getWrittenFile(created.skillFilePath) ?? '', /when_to_use: Handle alpha tasks/);
	const disabled = await source.setSkillEnabled(created.skillFilePath, false);
	assert.equal(disabled.metadata.enabled, false);
	assert.match(provider.getWrittenFile(created.skillFilePath) ?? '', /enabled: false/);
	assert.equal((await source.loadSkillContent(created.skillFilePath)).bodyContent, 'updated body');
	await source.removeSkill(created.skillFilePath);
	assert.deepEqual(provider.getDeletedPaths(), [`${root}/alpha`]);
	assert.equal((await source.scan()).skills.length, 0);
});

test('LocalVaultSkillSource 会拒绝重复名称的 Skill 创建', async () => {
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
	const source = new LocalVaultSkillSource(provider, { getAiDataFolder: () => 'System/AI Data' });
	await assert.rejects(
		() => source.createSkill({ name: 'alpha', description: 'duplicate skill' }),
		/Skill 已存在/,
	);
});

test('SkillScannerService 可桥接注入的 SkillSource', async () => {
	const skill: SkillDefinition = {
		metadata: { name: 'alpha', description: 'first skill' },
		skillFilePath: 'System/AI Data/skills/alpha/SKILL.md',
		basePath: 'System/AI Data/skills/alpha',
	};
	const result: SkillScanResult = {
		skills: [skill],
		errors: [],
	};
	let scanCalls = 0;
	const source: SkillSource = {
		sourceId: 'test-source',
		kind: 'local',
		getSkillsRootPath(): string { return 'System/AI Data/skills'; },
		async scan(): Promise<SkillScanResult> {
			scanCalls += 1;
			return result;
		},
		normalizePath(path: string): string { return path.replace(/\\/gu, '/'); },
		async loadSkillContent(path: string) {
			return {
				definition: {
					metadata: { name: 'alpha', description: 'first skill' },
					skillFilePath: path,
					basePath: 'System/AI Data/skills/alpha',
				},
				fullContent: `full:${path}`,
				bodyContent: 'body',
			};
		},
		async createSkill() {
			return skill;
		},
		async updateSkill(input: UpdateSkillInput) {
			return {
				...skill,
				metadata: {
					...skill.metadata,
					description: input.description ?? skill.metadata.description,
				},
			};
		},
		async removeSkill() {},
		async setSkillEnabled(skillId: string, enabled: boolean) {
			return {
				...skill,
				metadata: {
					...skill.metadata,
					enabled,
				},
			};
		},
		isSkillFilePath(path: string): boolean {
			return path.endsWith('/SKILL.md');
		},
	};
	const scanner = new SkillScannerService(createFakeProvider(), {
		getAiDataFolder: () => 'System/AI Data',
		source,
	});
	assert.equal((await scanner.scan()).skills[0]?.metadata.name, 'alpha');
	assert.equal(scanCalls, 1);
	assert.equal(scanner.getCachedResult()?.skills[0]?.metadata.name, 'alpha');
	assert.equal(scanner.findByName('alpha')?.metadata.name, 'alpha');
	assert.equal(scanner.findByPath(skill.skillFilePath)?.metadata.name, 'alpha');
	assert.equal((await scanner.loadSkillContent(skill.skillFilePath)).bodyContent, 'body');
	assert.equal(scanner.isSkillFilePath('System/AI Data/skills/alpha/SKILL.md'), true);
	scanner.clearCache();
	assert.equal(scanner.getCachedResult(), null);
	assert.equal(scanCalls, 1);
	assert.equal((await scanner.scan()).skills[0]?.metadata.name, 'alpha');
	assert.equal(scanCalls, 2);
});

test('SkillScannerService 写操作后会刷新 registry 快照', async () => {
	const root = buildSkillsRootPath('System/AI Data');
	const provider = createFakeProvider({
		folders: {
			[root]: [],
		},
	});
	const scanner = new SkillScannerService(provider, { getAiDataFolder: () => 'System/AI Data' });
	const created = await scanner.createSkill({
		name: 'alpha',
		description: 'first skill',
		bodyContent: 'alpha body',
	});
	assert.equal(scanner.getCachedResult()?.skills.length, 1);
	assert.equal(scanner.findByName('alpha')?.metadata.description, 'first skill');
	const updated = await scanner.updateSkill({
		skillId: created.skillFilePath,
		description: 'updated skill',
	});
	assert.equal(updated.metadata.description, 'updated skill');
	const disabled = await scanner.setSkillEnabled(created.skillFilePath, false);
	assert.equal(disabled.metadata.enabled, false);
	assert.equal(scanner.findByName('alpha'), undefined);
	assert.equal(scanner.findByName('alpha', { includeDisabled: true })?.metadata.enabled, false);
	assert.equal(scanner.findByPath(created.skillFilePath)?.metadata.enabled, false);
	assert.equal((await scanner.scanRuntimeSkills()).skills.length, 0);
	await scanner.removeSkill(created.skillFilePath);
	assert.equal(scanner.getCachedResult()?.skills.length, 0);
	assert.equal(scanner.findByName('alpha'), undefined);
});

test('SkillScannerService 会向监听器广播首次扫描与写后刷新结果', async () => {
	const root = buildSkillsRootPath('System/AI Data');
	const provider = createFakeProvider({
		folders: {
			[root]: [],
		},
	});
	const scanner = new SkillScannerService(provider, { getAiDataFolder: () => 'System/AI Data' });
	const skillCounts: number[] = [];
	const unsubscribe = scanner.onChange((result) => {
		skillCounts.push(result.skills.length);
	});

	await scanner.scan();
	await scanner.createSkill({
		name: 'alpha',
		description: 'first skill',
		bodyContent: 'alpha body',
	});
	await scanner.removeSkill(`${root}/alpha/SKILL.md`);


test('filterRuntimeEnabledSkills 只保留运行时可用 Skill', () => {
	const result = filterRuntimeEnabledSkills({
		skills: [
			{
				metadata: { name: 'enabled', description: 'enabled skill', enabled: true },
				skillFilePath: 'System/AI Data/skills/enabled/SKILL.md',
				basePath: 'System/AI Data/skills/enabled',
			},
			{
				metadata: { name: 'disabled', description: 'disabled skill', enabled: false },
				skillFilePath: 'System/AI Data/skills/disabled/SKILL.md',
				basePath: 'System/AI Data/skills/disabled',
			},
		],
		errors: [],
	});

	assert.deepEqual(result.skills.map((skill) => skill.metadata.name), ['enabled']);
});
	assert.deepEqual(skillCounts, [0, 1, 0]);
	unsubscribe();
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

test('parseSkillMetadata 为旧 Skill 回填 Step01 默认字段', () => {
	const metadata = parseSkillMetadata('---\nignored: true\n---', {
		parseYaml(): unknown {
			return {
				name: 'legacy-skill',
				description: 'legacy description',
			};
		},
	});
	assert.equal(metadata.enabled, true);
	assert.equal(metadata.execution?.mode, 'isolated_resume');
	assert.equal(metadata.when_to_use, undefined);
	assert.equal(metadata.arguments, undefined);
});

test('parseSkillMetadata 解析 Step01 新字段', () => {
	const metadata = parseSkillMetadata('---\nignored: true\n---', {
		parseYaml(): unknown {
			return {
				name: 'modern-skill',
				description: 'modern description',
				enabled: false,
				when_to_use: 'Handle translation tasks',
				arguments: [
					{ name: 'source-text', description: 'The text to translate', required: true },
					{ name: 'target-language', default: 'zh-CN' },
				],
				execution: { mode: 'isolated' },
			};
		},
	});
	assert.equal(metadata.enabled, false);
	assert.equal(metadata.when_to_use, 'Handle translation tasks');
	assert.deepEqual(metadata.arguments, [
		{ name: 'source-text', description: 'The text to translate', required: true },
		{ name: 'target-language', default: 'zh-CN' },
	]);
	assert.deepEqual(metadata.execution, { mode: 'isolated' });
});

test('parseSkillMetadata 校验 Step01 新字段类型', () => {
	assert.throws(() => parseSkillMetadata('---\nignored: true\n---', {
		parseYaml(): unknown {
			return {
				name: 'invalid-enabled',
				description: 'demo',
				enabled: 'false',
			};
		},
	}), /frontmatter\.enabled 必须是布尔值/);
	assert.throws(() => parseSkillMetadata('---\nignored: true\n---', {
		parseYaml(): unknown {
			return {
				name: 'invalid-arguments',
				description: 'demo',
				arguments: [{ required: true }],
			};
		},
	}), /frontmatter\.arguments\[0\]\.name 为必填项/);
	assert.throws(() => parseSkillMetadata('---\nignored: true\n---', {
		parseYaml(): unknown {
			return {
				name: 'invalid-execution',
				description: 'demo',
				execution: { mode: 'background' },
			};
		},
	}), /frontmatter\.execution\.mode 不支持该执行模式/);
});

test('内容辅助函数会剥离 frontmatter、格式化结果并转义 skills prompt', () => {
	assert.equal(stripSkillFrontmatter('---\nname: demo\ndescription: test\n---\nbody'), 'body');
	assert.equal(formatSkillToolResult('folder\\sub', 'body', (value) => value.replace(/\\/gu, '/')), 'Base Path: folder/sub/\n\nbody');
	const prompt = buildSkillsSystemPromptBlock([{
		metadata: {
			name: 'a<b',
			description: 'x&y',
			when_to_use: 'Use when <xml> needs & escaping',
		},
		skillFilePath: 'a',
		basePath: 'b',
	}]);
	assert.match(prompt, /discover_skills/);
	assert.match(prompt, /invoke_skill/);
	assert.match(prompt, /a&lt;b/);
	assert.match(prompt, /x&amp;y/);
	assert.match(prompt, /Use when &lt;xml&gt; needs &amp; escaping/);
});

test('SkillScannerService resolveRelevantSkills 首次调用会触发扫描', async () => {
	const root = buildSkillsRootPath('System/AI Data');
	const provider = createFakeProvider({
		folders: {
			[root]: [
				{ path: `${root}/pdf`, name: 'pdf', kind: 'folder' },
				{ path: `${root}/translate`, name: 'translate', kind: 'folder' },
			],
			[`${root}/pdf`]: [{ path: `${root}/pdf/SKILL.md`, name: 'SKILL.md', kind: 'file' }],
			[`${root}/translate`]: [{ path: `${root}/translate/SKILL.md`, name: 'SKILL.md', kind: 'file' }],
		},
		files: {
			[`${root}/pdf/SKILL.md`]: '---\nname: pdf\ndescription: Handle PDF workflows\nwhen_to_use: Use for /pdf export tasks\n---\npdf body',
			[`${root}/translate/SKILL.md`]: '---\nname: translate\ndescription: Translate text\nwhen_to_use: Use for translation tasks\n---\ntranslate body',
		},
	});
	const scanner = new SkillScannerService(provider, { getAiDataFolder: () => 'System/AI Data' });

	const result = await scanner.resolveRelevantSkills('请用 /pdf 处理并翻译文档', 1);

	assert.deepEqual(result.map((skill) => skill.metadata.name), ['pdf']);
	assert.equal(scanner.getCachedResult()?.skills.length, 2);
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

test('SkillScannerService 同时兼容旧 Skill、新 Skill 与非法新字段 Skill', async () => {
	const root = buildSkillsRootPath('System/AI Data');
	const provider = createFakeProvider({
		folders: {
			[root]: [
				{ path: `${root}/legacy`, name: 'legacy', kind: 'folder' },
				{ path: `${root}/modern`, name: 'modern', kind: 'folder' },
				{ path: `${root}/broken`, name: 'broken', kind: 'folder' },
			],
			[`${root}/legacy`]: [{ path: `${root}/legacy/SKILL.md`, name: 'SKILL.md', kind: 'file' }],
			[`${root}/modern`]: [{ path: `${root}/modern/SKILL.md`, name: 'SKILL.md', kind: 'file' }],
			[`${root}/broken`]: [{ path: `${root}/broken/SKILL.md`, name: 'SKILL.md', kind: 'file' }],
		},
		files: {
			[`${root}/legacy/SKILL.md`]: '---\nvariant: legacy\n---\nbody',
			[`${root}/modern/SKILL.md`]: '---\nvariant: modern\n---\nbody',
			[`${root}/broken/SKILL.md`]: '---\nvariant: broken\n---\nbody',
		},
		parseYaml(content: string): unknown {
			if (content.includes('variant: legacy')) {
				return {
					name: 'legacy-skill',
					description: 'legacy description',
				};
			}
			if (content.includes('variant: modern')) {
				return {
					name: 'modern-skill',
					description: 'modern description',
					enabled: false,
					execution: 'inline',
				};
			}
			return {
				name: 'broken-skill',
				description: 'broken description',
				enabled: 'no',
			};
		},
	});
	const scanner = new SkillScannerService(provider, { getAiDataFolder: () => 'System/AI Data' });
	const result = await scanner.scan();
	assert.equal(result.skills.length, 2);
	assert.equal(result.skills[0]?.metadata.name, 'legacy-skill');
	assert.equal(result.skills[0]?.metadata.enabled, true);
	assert.equal(result.skills[1]?.metadata.name, 'modern-skill');
	assert.equal(result.skills[1]?.metadata.enabled, false);
	assert.deepEqual(result.skills[1]?.metadata.execution, { mode: 'inline' });
	assert.equal(result.errors.length, 1);
	assert.match(result.errors[0]?.reason ?? '', /frontmatter\.enabled 必须是布尔值/);
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

test('SkillsRuntimeCoordinator 会转发 scanner 写操作的广播结果', async () => {
	const root = buildSkillsRootPath('System/AI Data');
	const provider = createFakeProvider({
		folders: {
			[root]: [],
		},
	});
	const runtime = new SkillsRuntimeCoordinator(provider, { getAiDataFolder: () => 'System/AI Data' });
	const skillCounts: number[] = [];
	runtime.onSkillsChange((result) => {
		skillCounts.push(result.skills.length);
	});

	await runtime.initialize();
	await runtime.createSkill({
		name: 'alpha',
		description: 'first skill',
		bodyContent: 'alpha body',
	});
	await runtime.setSkillEnabled(`${root}/alpha/SKILL.md`, false);
	await runtime.removeSkill(`${root}/alpha/SKILL.md`);

	assert.deepEqual(skillCounts, [0, 1, 1, 0]);
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
